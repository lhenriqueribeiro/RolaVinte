import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guarda do DoD do RV-122: "nenhuma página mantém texto de carregamento ou erro
 * próprio fora dos componentes padrão".
 *
 * Uma regra que só existe no texto do card volta na primeira tela nova — foi
 * assim que nasceram os cinco "Carregando …" diferentes que este card veio
 * apagar. Aqui ela vira teste: quem escrever um `<p className="text-perigo">`
 * com `error.message` dentro fica vermelho, e a mensagem diz o que usar no
 * lugar.
 *
 * Escaneia o fonte em vez de renderizar porque o alvo é uma propriedade do
 * repositório inteiro, não de um componente. Mesmo espírito do
 * `fronteiras-arquitetura.test.ts` da api.
 */

const RAIZ = join(import.meta.dirname, '..', '..');
const COMPONENTES_PADRAO = join('components', 'ui');

function listarFontes(diretorio: string): string[] {
  return readdirSync(diretorio).flatMap((entrada) => {
    const caminho = join(diretorio, entrada);
    if (statSync(caminho).isDirectory()) return listarFontes(caminho);
    if (!/\.tsx?$/.test(entrada) || entrada.includes('.test.')) return [];
    return [caminho];
  });
}

/** Todo fonte de produção que **não** é um dos componentes padrão. */
const FONTES_DE_TELA = listarFontes(RAIZ)
  .map((caminho) => relative(RAIZ, caminho))
  .filter((caminho) => !caminho.startsWith(COMPONENTES_PADRAO) && !caminho.startsWith('testes'));

function ocorrencias(padrao: RegExp): string[] {
  return FONTES_DE_TELA.filter((caminho) => padrao.test(readFileSync(join(RAIZ, caminho), 'utf8')));
}

describe('padronização de estados (RV-122)', () => {
  it('há telas para varrer (senão este teste passaria por vazio)', () => {
    expect(FONTES_DE_TELA.length).toBeGreaterThan(10);
    expect(FONTES_DE_TELA).toContain(join('features', 'jogo', 'Chat.tsx'));
  });

  it('nenhuma tela extrai `error.message` por conta própria', () => {
    // Quem precisa mostrar uma falha passa o erro inteiro para <Erro> (ou para
    // a prop `erro` do DialogoConfirmacao): o texto sai de `mensagemDeErro`, num
    // lugar só, e o valor que não é `Error` deixa de virar "undefined" na tela.
    expect(ocorrencias(/\.error\.message/)).toEqual([]);
  });

  it('nenhuma tela declara o próprio `role="alert"`', () => {
    // Alerta é sempre o <Erro> padrão — que já traz ícone, o prefixo "Erro:"
    // para leitor de tela e o botão de nova tentativa quando ele faz sentido.
    expect(ocorrencias(/role="alert"/)).toEqual([]);
  });

  it('nenhuma tela escreve a própria frase de carregamento', () => {
    // "Carregando…" como conteúdo de JSX (`>Carregando…<`) é o padrão antigo.
    // Passar `rotulo="Carregando a conversa…"` para <Carregando>/<ListaEsqueleto>
    // continua permitido, e é o que diz ao usuário o que está sendo esperado.
    expect(ocorrencias(/>\s*(Carregando|Verificando|Abrindo)[^<]*…/)).toEqual([]);
  });
});
