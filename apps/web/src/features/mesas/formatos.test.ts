import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SISTEMAS_RPG, definicaoDoSistema } from '@rolavinte/shared';
import { nomeDoSistema } from './formatos';

/**
 * O nome do sistema tem um dono só (RV-091).
 *
 * Antes deste teste o front mantinha um `NOME_SISTEMA` escrito à mão ao lado do
 * `nome` que a `DefinicaoSistema` já carregava. As duas listas divergiram sem
 * que nada acusasse: "Tormenta20" no painel de mesas, "Tormenta 20" no cabeçalho
 * da ficha. Um `Record<SistemaRpg, string>` protege contra *sistema faltando*,
 * nunca contra *rótulo errado* — quem protege contra isso é não haver segunda
 * lista.
 */

const RAIZ = join(import.meta.dirname, '..', '..');
const ARQUIVO_DA_DERIVACAO = join('features', 'mesas', 'formatos.ts');

function listarFontes(diretorio: string): string[] {
  return readdirSync(diretorio).flatMap((entrada) => {
    const caminho = join(diretorio, entrada);
    if (statSync(caminho).isDirectory()) return listarFontes(caminho);
    if (!/\.tsx?$/.test(entrada)) return [];
    return [caminho];
  });
}

describe('nome do sistema no front (RV-091)', () => {
  it('todo sistema é exibido exatamente com o nome do registro', () => {
    for (const chave of SISTEMAS_RPG) {
      expect(nomeDoSistema(chave), `rótulo de "${chave}"`).toBe(definicaoDoSistema(chave).nome);
    }
  });

  it('nenhuma tela escreve o rótulo de um sistema à mão', () => {
    // Os nomes reais das definições, procurados como texto no fonte. Uma tela
    // que os digite no JSX volta a criar a segunda lista que este card apagou.
    const rotulos = SISTEMAS_RPG.map((chave) => definicaoDoSistema(chave).nome);
    const infratores = listarFontes(RAIZ)
      .map((caminho) => relative(RAIZ, caminho))
      // O próprio teste cita os rótulos, e a ficha de D&D é verificada pelo
      // nome que o usuário lê — os dois saem da definição, não de uma cópia.
      .filter((caminho) => !caminho.endsWith('.test.ts') && !caminho.endsWith('.test.tsx'))
      // O arquivo que faz a derivação cita os rótulos antigos no comentário que
      // explica por que a lista à mão saiu; o primeiro teste é quem o cobre.
      .filter((caminho) => caminho !== ARQUIVO_DA_DERIVACAO)
      .filter((caminho) => {
        const fonte = readFileSync(join(RAIZ, caminho), 'utf8');
        return rotulos.some(
          (rotulo) => fonte.includes(`'${rotulo}'`) || fonte.includes(`"${rotulo}"`),
        );
      });

    expect(
      infratores,
      'O nome exibível do sistema sai de definicaoDoSistema(...).nome, em @rolavinte/shared. ' +
        'Use nomeDoSistema(...) de features/mesas/formatos em vez de repetir o rótulo no JSX.',
    ).toEqual([]);
  });
});
