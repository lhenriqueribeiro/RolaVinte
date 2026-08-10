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

/**
 * Consolidação do atributo de PF2e (RV-098) — o que é do mapper e o que é da
 * migration.
 *
 * O card exige que D&D 5e não regrida e que uma ficha já gravada continue
 * legível. Quem decide isso é o **mapper**, não o caso de uso: o
 * `FakePersonagemRepository` regrava o agregado inteiro e jamais veria uma linha
 * no formato antigo (F3 da taxonomia — fake que passa por construção).
 *
 * O que estes testes fixam:
 *
 * - o mapper **não** converte escala, e não poderia: a escala é do sistema da
 *   mesa, e o `Personagem` de propósito não guarda `sistema`. A conversão é da
 *   migration `0009`, que faz o `join` com `mesas`;
 * - por isso uma linha de PF2e gravada antes da `0009` continua **carregando** —
 *   `reconstituir` não revalida —, e é na próxima escrita que a escala é cobrada.
 *   Ficha ilegível seria o pior desfecho possível para o dono dela.
 */
const ROW_PF2E_ANTES_DA_0009 = {
  ...ROW_FORMATO_ANTIGO,
  id: '00000000-0000-4000-9000-0000000000b2',
  nome: 'Seelah',
  classe: 'Paladina',
  nivel: 5,
  // As duas verdades convivendo, como o defeito as gravava: a coluna comum com
  // valores de d20 clássico e a cópia dentro de `dados`, que era a que a ficha
  // lia.
  atributos: {
    forca: 18,
    destreza: 14,
    constituicao: 16,
    inteligencia: 10,
    sabedoria: 12,
    carisma: 10,
  },
  dados: {
    ancestralidade: 'Humana',
    heranca: '',
    antecedente: '',
    modificadorForca: 0,
    modificadorDestreza: 4,
    modificadorConstituicao: 0,
    modificadorInteligencia: 0,
    modificadorSabedoria: 0,
    modificadorCarisma: 0,
    treinamentos: { furtividade: 'treinado' },
    saberes: [],
  },
} satisfies RowPersonagem;

describe('personagem.mapper — linha de PF2e no formato de antes do RV-098', () => {
  it('carrega sem perder nada: a ficha do jogador não fica ilegível', () => {
    const seelah = rowParaPersonagem(ROW_PF2E_ANTES_DA_0009);

    expect(seelah.nome).toBe('Seelah');
    expect(seelah.nivel).toBe(5);
    expect(seelah.atributos).toEqual(ROW_PF2E_ANTES_DA_0009.atributos);
    expect(seelah.dados).toEqual(ROW_PF2E_ANTES_DA_0009.dados);
  });

  it('o mapper atravessa a linha como está — converter escala aqui seria adivinhar o sistema', () => {
    // Um mapper que "consertasse" a escala teria de saber que a mesa é de PF2e, e
    // essa informação não está na tabela `personagens`. Aplicar a fórmula do d20
    // em toda linha destruiria os atributos de D&D 5e.
    const regravada = personagemParaRow(rowParaPersonagem(ROW_PF2E_ANTES_DA_0009));

    expect(regravada).toEqual(ROW_PF2E_ANTES_DA_0009);
  });

  it('a linha de D&D 5e continua idêntica na ida e na volta — nenhuma regressão', () => {
    const antes = { ...ROW_FORMATO_ANTIGO, dados: { ca: 16, pericias: {} } };

    expect(personagemParaRow(rowParaPersonagem(antes))).toEqual(antes);
    expect(rowParaPersonagem(antes).atributos.forca).toBe(16);
  });
});
