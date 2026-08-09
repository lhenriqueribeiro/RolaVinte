import { describe, expect, it } from 'vitest';
import { dadosIniciaisDaFicha } from '@rolavinte/shared';
import { personagemParaRow, rowParaPersonagem, type RowPersonagem } from './personagem.mapper';

/**
 * Migração de ficha já gravada (RV-091).
 *
 * O card exige que "a ficha genérica continue funcionando igual, sem perda de
 * dados". Já existem personagens no banco escritos antes da coluna
 * `personagens.dados` existir, e o que decide se eles sobrevivem é o **mapper**,
 * não o caso de uso: o `FakePersonagemRepository` guarda o agregado inteiro e
 * jamais veria uma linha sem a coluna nova (F3 da taxonomia — fake que passa por
 * construção). Por isso este teste está aqui, no adapter, e não em `aplicacao/`.
 */

/** Uma linha exatamente como a migration 0001 a gravava: sem `dados`. */
const ROW_FORMATO_ANTIGO = {
  id: '00000000-0000-4000-9000-0000000000b1',
  mesa_id: '00000000-0000-4000-9000-000000000001',
  dono_id: '00000000-0000-4000-9000-00000000000a',
  nome: 'Thorin',
  classe: 'Guerreiro',
  nivel: 3,
  pv_atual: 12,
  pv_max: 30,
  atributos: {
    forca: 16,
    destreza: 10,
    constituicao: 14,
    inteligencia: 8,
    sabedoria: 12,
    carisma: 10,
  },
  anotacoes: 'Carrega o machado do pai.',
} satisfies Omit<RowPersonagem, 'dados'>;

describe('personagem.mapper — a ficha do formato antigo sobrevive ao RV-091', () => {
  it('linha sem a coluna `dados` carrega, e a ficha do sistema vira `{}`', () => {
    const p = rowParaPersonagem(ROW_FORMATO_ANTIGO);

    expect(p.id).toBe(ROW_FORMATO_ANTIGO.id);
    expect(p.nome).toBe('Thorin');
    expect(p.pvAtual).toBe(12);
    expect(p.pvMax).toBe(30);
    expect(p.anotacoes).toBe('Carrega o machado do pai.');
    expect(p.atributos).toEqual(ROW_FORMATO_ANTIGO.atributos);
    expect(p.dados).toEqual({});
  });

  it('`{}` é exatamente a ficha válida do sistema genérico — nada a converter', () => {
    expect(rowParaPersonagem(ROW_FORMATO_ANTIGO).dados).toEqual(dadosIniciaisDaFicha('generico'));
  });

  it('carregar e regravar devolve a linha antiga intacta, mais `dados: {}`', () => {
    // A prova de "sem perda": todo campo que estava lá volta idêntico. Um
    // esquecimento no mapper — não copiar `anotacoes`, por exemplo — apagaria o
    // texto do jogador na primeira edição de PV.
    const regravada = personagemParaRow(rowParaPersonagem(ROW_FORMATO_ANTIGO));

    expect(regravada).toEqual({ ...ROW_FORMATO_ANTIGO, dados: {} });
  });

  it('`dados` nulo no banco também vira `{}` em vez de derrubar a leitura', () => {
    expect(rowParaPersonagem({ ...ROW_FORMATO_ANTIGO, dados: null }).dados).toEqual({});
  });

  it('ida e volta de uma ficha com dados preserva o conteúdo do sistema', () => {
    const dados = {
      ca: 18,
      deslocamento: 9,
      inspiracao: true,
      pericias: { atletismo: 'proficiente' },
    };

    const regravada = personagemParaRow(rowParaPersonagem({ ...ROW_FORMATO_ANTIGO, dados }));

    expect(regravada.dados).toEqual(dados);
  });
});
