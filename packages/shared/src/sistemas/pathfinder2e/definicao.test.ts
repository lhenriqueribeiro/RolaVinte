import { describe, expect, it } from 'vitest';
import { ATRIBUTOS, criarPersonagemSchema, type Atributos } from '../../schemas/personagens';
import {
  dadosIniciaisDaFicha,
  DEFINICOES_SISTEMA,
  definicaoDoSistema,
  validarDadosDaFicha,
} from '../registro';
import type { DadosFicha, FichaCalculavel } from '../tipos';
import { ATRIBUICAO_PF2E } from './atribuicao';
import {
  bonusDeChecagem,
  chaveDoModificador,
  modificadorDeAtributo,
  MODIFICADOR_MAXIMO,
  MODIFICADOR_MINIMO,
  SISTEMA_PATHFINDER2E,
} from './definicao';
// Os graus e o seu schema mudaram de arquivo no RV-153, junto com a tabela de
// perícias que os usa. A exportação de `@rolavinte/shared` é a mesma.
import { GRAUS_TREINAMENTO_PF2E, grauTreinamentoSchema } from './pericias';
import { GRAUS_TREINAMENTO } from './regras';

/**
 * Ficha de Pathfinder 2e (RV-152).
 *
 * Os números esperados estão escritos à mão, e não recalculados a partir da
 * implementação: um teste que refaz a conta do código concorda com o bug.
 *
 * A cobertura genérica — schema estrito, campos das seções existindo na ficha
 * inicial, limites da interface iguais aos do schema, perícia desconhecida
 * devolvendo `null` — já vem de `registro.test.ts`, que percorre `SISTEMAS_RPG`
 * e passou a cobrir este sistema sem uma linha de alteração. Aqui ficam as
 * regras que são **deste** sistema.
 */

/** Colunas comuns cheias: no d20 clássico dariam +5 de modificador. */
const ATRIBUTOS_ALTOS: Atributos = {
  forca: 20,
  destreza: 20,
  constituicao: 20,
  inteligencia: 20,
  sabedoria: 20,
  carisma: 20,
};

const ATRIBUTOS_NEUTROS: Atributos = {
  forca: 10,
  destreza: 10,
  constituicao: 10,
  inteligencia: 10,
  sabedoria: 10,
  carisma: 10,
};

function fichaInicial(): DadosFicha {
  return dadosIniciaisDaFicha('pathfinder2e');
}

function ficha(nivel: number, dados: DadosFicha, atributos = ATRIBUTOS_ALTOS): FichaCalculavel {
  return { nivel, atributos, dados };
}

function erroAoSalvar(dados: DadosFicha): string {
  const r = validarDadosDaFicha('pathfinder2e', dados);
  expect(r.ok, `a ficha aceitou ${JSON.stringify(dados)}`).toBe(false);
  return r.ok ? '' : r.erro;
}

describe('ficha de PF2e — o esqueleto do sistema (RV-152)', () => {
  it('nasce com os seis modificadores em +0, identidade vazia e tudo destreinado', () => {
    expect(fichaInicial()).toEqual({
      ancestralidade: '',
      heranca: '',
      antecedente: '',
      modificadorForca: 0,
      modificadorDestreza: 0,
      modificadorConstituicao: 0,
      modificadorInteligencia: 0,
      modificadorSabedoria: 0,
      modificadorCarisma: 0,
      // As dezesseis perícias de chave fixa nascem destreinadas (RV-153); Saber
      // é família e começa sem nenhuma especialização.
      treinamentos: {
        acrobacia: 'destreinado',
        arcanismo: 'destreinado',
        atletismo: 'destreinado',
        atuacao: 'destreinado',
        diplomacia: 'destreinado',
        enganacao: 'destreinado',
        furtividade: 'destreinado',
        intimidacao: 'destreinado',
        ladinagem: 'destreinado',
        medicina: 'destreinado',
        natureza: 'destreinado',
        ocultismo: 'destreinado',
        oficio: 'destreinado',
        religiao: 'destreinado',
        sobrevivencia: 'destreinado',
        sociedade: 'destreinado',
      },
      saberes: [],
    });
  });

  it('as seis chaves de modificador são exatamente estas — renomeá-las é migração de dados', () => {
    // Escritas à mão de propósito: as chaves ficam gravadas em `personagens.dados`
    // de todo personagem de PF2e, e trocar o gerador de nome sem migration deixa
    // o bônus de todo mundo em zero, em silêncio.
    expect(ATRIBUTOS.map(chaveDoModificador)).toEqual([
      'modificadorForca',
      'modificadorDestreza',
      'modificadorConstituicao',
      'modificadorInteligencia',
      'modificadorSabedoria',
      'modificadorCarisma',
    ]);
  });

  it('classe e nível não se duplicam na metade do sistema — são colunas comuns', () => {
    const inicial = fichaInicial();
    expect('nivel' in inicial, 'nível duplicado: dois campos, duas respostas').toBe(false);
    expect('classe' in inicial, 'classe duplicada: a coluna comum já a guarda').toBe(false);
  });

  it('a faixa de nível 1..20 continua sendo a do schema comum de personagem', () => {
    const base = { nome: 'Seelah' };
    expect(criarPersonagemSchema.safeParse({ ...base, nivel: 1 }).success).toBe(true);
    expect(criarPersonagemSchema.safeParse({ ...base, nivel: 20 }).success).toBe(true);
    expect(criarPersonagemSchema.safeParse({ ...base, nivel: 21 }).success).toBe(false);
    expect(criarPersonagemSchema.safeParse({ ...base, nivel: 0 }).success).toBe(false);
  });

  it('as seções são Identidade e Atributos, nesta ordem', () => {
    // Perícias não é uma `SecaoFicha`: ela sai da lista `pericias` (RV-153), que
    // tem seção própria na interface, e uma seção homônima duplicaria o título.
    // Defesas chega no RV-155.
    expect(SISTEMA_PATHFINDER2E.secoes.map((s) => s.chave)).toEqual(['identidade', 'atributos']);
    expect(SISTEMA_PATHFINDER2E.secoes[0]?.campos.map((c) => c.chave)).toEqual([
      'ancestralidade',
      'heranca',
      'antecedente',
    ]);
    expect(SISTEMA_PATHFINDER2E.secoes[1]?.campos.map((c) => c.chave)).toEqual(
      ATRIBUTOS.map(chaveDoModificador),
    );
  });

  it('identidade é texto livre — a ficha não enumera conteúdo da Paizo', () => {
    // A fronteira de licenciamento (RV-150): listar ancestralidades seria
    // distribuir conteúdo. A lista curada chega com o catálogo (RV-157).
    for (const campo of SISTEMA_PATHFINDER2E.secoes[0]?.campos ?? []) {
      expect(campo.tipo, `${campo.chave} deixou de ser texto livre`).toBe('texto');
    }
  });

  it('texto de identidade acima do limite é recusado em PT-BR, e no limite passa', () => {
    const inicial = fichaInicial();
    expect(validarDadosDaFicha('pathfinder2e', { ...inicial, heranca: 'x'.repeat(60) }).ok).toBe(
      true,
    );
    expect(erroAoSalvar({ ...inicial, heranca: 'x'.repeat(61) })).toContain('Herança');
  });
});

describe('ficha de PF2e — modificador direto, não valor de atributo', () => {
  it('o sistema declara que não usa os atributos comuns', () => {
    expect(SISTEMA_PATHFINDER2E.usaAtributosComuns).toBe(false);
  });

  it('o modificador sai de `dados`, e não das colunas 1..30', () => {
    // Força 20 daria +5 no d20 clássico. Aqui a ficha nunca preencheu o
    // modificador, então ele é +0 — e o +5 não pode aparecer de lugar nenhum.
    // As duas formas importam: a ficha inicial (chave presente, valendo 0) e a
    // ficha gravada antes deste card (chave ausente), que é onde uma queda para
    // `modificadorAtributo()` passaria despercebida.
    for (const dados of [fichaInicial(), {}]) {
      const f = ficha(5, dados, ATRIBUTOS_ALTOS);
      for (const atributo of ATRIBUTOS) {
        expect(modificadorDeAtributo(f, atributo), `modificador de ${atributo}`).toBe(0);
      }
    }
  });

  it('o valor gravado manda, mesmo contra uma coluna comum baixa', () => {
    const dados = { ...fichaInicial(), modificadorDestreza: 4 };
    const magra: Atributos = { ...ATRIBUTOS_NEUTROS, destreza: 1 };
    expect(modificadorDeAtributo(ficha(5, dados, magra), 'destreza')).toBe(4);
  });

  it('modificador ausente ou estragado vale +0 em vez de quebrar a ficha', () => {
    expect(modificadorDeAtributo(ficha(1, {}), 'forca')).toBe(0);
    expect(modificadorDeAtributo(ficha(1, { modificadorForca: 'muito' }), 'forca')).toBe(0);
  });

  it.each([
    ['nível 5, treinado, +4 de Destreza', 5, 'destreza', 'treinado', 4, 11],
    [
      'nível 5, destreinado, +1 de Inteligência (não soma o nível)',
      5,
      'inteligencia',
      'destreinado',
      1,
      1,
    ],
    ['nível 1, treinado, +0', 1, 'carisma', 'treinado', 0, 3],
    ['nível 20, lendário, +4', 20, 'forca', 'lendario', 4, 32],
    ['nível 12, destreinado, +2 (o nível não entra)', 12, 'sabedoria', 'destreinado', 2, 2],
    ['nível 3, perito, −1', 3, 'constituicao', 'perito', -1, 6],
  ] as const)('bônus de checagem — %s', (_rotulo, nivel, atributo, grau, modificador, esperado) => {
    const dados = { ...fichaInicial(), [chaveDoModificador(atributo)]: modificador };
    expect(bonusDeChecagem(ficha(nivel, dados), atributo, grau)).toBe(esperado);
  });

  it('nenhuma rolagem padrão muda quando os atributos comuns mudam', () => {
    // Hoje `rolagensPadrao` está vazio (a iniciativa do PF2e é por Percepção e
    // chega no RV-158), então esta varredura é a rede que impede a iniciativa
    // por Destreza da ficha genérica de entrar aqui por descuido.
    const dados = fichaInicial();
    for (const rolagem of SISTEMA_PATHFINDER2E.rolagensPadrao) {
      expect(
        rolagem.expressao({ nivel: 5, atributos: ATRIBUTOS_NEUTROS, dados }),
        `a rolagem "${rolagem.chave}" muda com as colunas comuns: ela deriva de ` +
          `\`atributos\`, e neste sistema aquele número não vale nada.`,
      ).toBe(rolagem.expressao({ nivel: 5, atributos: ATRIBUTOS_ALTOS, dados }));
    }
  });
});

describe('ficha de PF2e — a faixa do modificador é −5..+8', () => {
  it('os limites declarados são os da regra', () => {
    expect([MODIFICADOR_MINIMO, MODIFICADOR_MAXIMO]).toEqual([-5, 8]);
  });

  it.each(ATRIBUTOS)('%s aceita −5 e +8 e recusa −6 e +9', (atributo) => {
    const chave = chaveDoModificador(atributo);
    const inicial = fichaInicial();

    expect(validarDadosDaFicha('pathfinder2e', { ...inicial, [chave]: -5 }).ok).toBe(true);
    expect(validarDadosDaFicha('pathfinder2e', { ...inicial, [chave]: 8 }).ok).toBe(true);
    expect(erroAoSalvar({ ...inicial, [chave]: -6 })).toContain(chave);
    expect(erroAoSalvar({ ...inicial, [chave]: 9 })).toContain(chave);
  });

  it('destreza +9 é recusada em PT-BR dizendo qual é o teto', () => {
    // Cenário de borda do card, com o nome exibível do atributo na mensagem: o
    // usuário digitou "9" num campo rotulado "Destreza", não em "modificadorDestreza".
    const erro = erroAoSalvar({ ...fichaInicial(), modificadorDestreza: 9 });
    expect(erro).toContain('Modificador de Destreza');
    expect(erro).toContain('o máximo é 8');
    expect(erro).toContain('Pathfinder 2e');
  });

  it('abaixo do piso, fracionário e texto também são recusados em PT-BR', () => {
    expect(erroAoSalvar({ ...fichaInicial(), modificadorForca: -6 })).toContain('o mínimo é -5');
    expect(erroAoSalvar({ ...fichaInicial(), modificadorForca: 1.5 })).toContain('inteiro');
    expect(erroAoSalvar({ ...fichaInicial(), modificadorForca: '3' })).toContain(
      'informe um número',
    );
  });

  it('a recusa não grava nada: o resultado inválido não traz ficha', () => {
    const r = validarDadosDaFicha('pathfinder2e', { ...fichaInicial(), modificadorDestreza: 9 });
    expect(r.ok).toBe(false);
    expect('dados' in r).toBe(false);
  });
});

describe('ficha de PF2e — graus de treinamento', () => {
  it('os cinco graus têm rótulo exibível, na ordem do menor para o maior', () => {
    expect(GRAUS_TREINAMENTO_PF2E.map((g) => g.chave)).toEqual([...GRAUS_TREINAMENTO]);
    expect(GRAUS_TREINAMENTO_PF2E.map((g) => g.rotulo)).toEqual([
      'Destreinado',
      'Treinado',
      'Perito',
      'Mestre',
      'Lendário',
    ]);
    expect(SISTEMA_PATHFINDER2E.grausPericia).toBe(GRAUS_TREINAMENTO_PF2E);
  });

  it('todo grau de GRAUS_TREINAMENTO tem rótulo — grau novo não passa despercebido', () => {
    const semRotulo = GRAUS_TREINAMENTO.filter(
      (grau) => !GRAUS_TREINAMENTO_PF2E.some((g) => g.chave === grau),
    );
    expect(
      semRotulo,
      `Grau(s) de treinamento sem rótulo na ficha: ${semRotulo.join(', ')}. ` +
        `A interface mostraria um select sem a opção, e o jogador não conseguiria escolher.`,
    ).toEqual([]);
  });

  it('o schema de grau aceita os cinco e recusa o resto em PT-BR', () => {
    for (const grau of GRAUS_TREINAMENTO) {
      expect(grauTreinamentoSchema.safeParse(grau).success, grau).toBe(true);
    }
    const r = grauTreinamentoSchema.safeParse('semi-treinado');
    expect(r.success).toBe(false);
    expect(r.success ? '' : r.error.issues[0]?.message).toContain('Grau de treinamento inválido');
  });

  it('treinamento de uma chave que o sistema não conhece é recusado nomeando a chave', () => {
    // As chaves são as 16 perícias fixas (RV-153); as defesas chegam no RV-155.
    // Aceitar qualquer chave transformaria `treinamentos` numa lixeira sem dono.
    // Percepção é o caso concreto: no PF2e ela **não** é perícia.
    expect(erroAoSalvar({ ...fichaInicial(), treinamentos: { percepcao: 'treinado' } })).toContain(
      'percepcao',
    );
  });

  it('perícia inexistente devolve null em vez de um número inventado', () => {
    const f = ficha(5, fichaInicial());
    // Percepção não é perícia no PF2e (RV-153): ela mora nas defesas (RV-155).
    // `saber` sozinho é a família, e família não se rola: rola-se a instância.
    for (const chave of ['percepcao', 'saber', 'nao-existe']) {
      expect(SISTEMA_PATHFINDER2E.bonusPericia(f, chave), chave).toBeNull();
      expect(SISTEMA_PATHFINDER2E.grauDePericia(f, chave), chave).toBeNull();
    }
  });

  it('definir o grau de uma perícia desconhecida não inventa entrada em `dados`', () => {
    const inicial = fichaInicial();
    expect(SISTEMA_PATHFINDER2E.definirGrauDePericia(inicial, 'percepcao', 'treinado')).toBe(
      inicial,
    );
    expect(SISTEMA_PATHFINDER2E.definirGrauDePericia(inicial, 'furtividade', 'genial')).toBe(
      inicial,
    );
  });
});

describe('ficha de PF2e — a atribuição viaja com o sistema', () => {
  it('a definição carrega a atribuição de PF2e, e não uma cópia do texto', () => {
    expect(SISTEMA_PATHFINDER2E.atribuicao).toBe(ATRIBUICAO_PF2E);
  });

  it('toda atribuição declarada tem texto e ao menos um link', () => {
    for (const definicao of DEFINICOES_SISTEMA) {
      const { atribuicao } = definicao;
      if (atribuicao === null) continue;
      expect(atribuicao.texto.trim().length, `atribuição de "${definicao.chave}"`).toBeGreaterThan(
        0,
      );
      expect(atribuicao.links.length, `links de "${definicao.chave}"`).toBeGreaterThan(0);
      for (const link of atribuicao.links) {
        expect(link.href, `link "${link.rotulo}" de "${definicao.chave}"`).toMatch(/^https?:\/\//);
      }
    }
  });
});

describe('ficha de PF2e — os outros sistemas continuam intactos', () => {
  it('a ficha genérica continua vazia e válida', () => {
    expect(dadosIniciaisDaFicha('generico')).toEqual({});
    expect(validarDadosDaFicha('generico', {}).ok).toBe(true);
  });

  it('a ficha de PF2e não é aceita por outro sistema, nem a de outro sistema por ela', () => {
    // Armadilha do card: `z.object({}).strict()` da ficha genérica torna toda
    // linha antiga válida. O schema novo só vale para a mesa de PF2e.
    const pf2e = fichaInicial();
    expect(validarDadosDaFicha('generico', pf2e).ok).toBe(false);
    expect(validarDadosDaFicha('dnd5e', pf2e).ok).toBe(false);
    expect(erroAoSalvar(dadosIniciaisDaFicha('dnd5e'))).toContain('ca');
  });

  it('o nome exibível do sistema é o que a interface mostra', () => {
    expect(definicaoDoSistema('pathfinder2e')).toBe(SISTEMA_PATHFINDER2E);
    expect(SISTEMA_PATHFINDER2E.nome).toBe('Pathfinder 2e');
  });
});
