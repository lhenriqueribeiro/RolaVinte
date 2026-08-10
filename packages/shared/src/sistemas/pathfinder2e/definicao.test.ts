import { describe, expect, it } from 'vitest';
import { ATRIBUTOS, criarPersonagemSchema, type Atributos } from '../../schemas/personagens';
import {
  atributosIniciais,
  dadosIniciaisDaFicha,
  DEFINICOES_SISTEMA,
  definicaoDoSistema,
  validarAtributosDoSistema,
  validarDadosDaFicha,
} from '../registro';
import type { DadosFicha, FichaCalculavel } from '../tipos';
import { ATRIBUICAO_PF2E } from './atribuicao';
import {
  bonusDeChecagem,
  CHAVES_MODIFICADOR_LEGADAS,
  ESCALA_ATRIBUTO_PF2E,
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

/** Atributos de PF2e: o número gravado **é** o modificador (RV-098). */
const MODIFICADORES_ZERADOS: Atributos = atributosIniciais('pathfinder2e');

/** Seelah como o card do RV-098 a descreve: Destreza +4, Inteligência +1. */
const MODIFICADORES_DE_SEELAH: Atributos = {
  ...MODIFICADORES_ZERADOS,
  destreza: 4,
  inteligencia: 1,
};

function fichaInicial(): DadosFicha {
  return dadosIniciaisDaFicha('pathfinder2e');
}

function ficha(
  nivel: number,
  dados: DadosFicha,
  atributos = MODIFICADORES_ZERADOS,
): FichaCalculavel {
  return { nivel, atributos, dados };
}

function comModificador(atributo: keyof Atributos, valor: number): Atributos {
  return { ...MODIFICADORES_ZERADOS, [atributo]: valor };
}

function erroAoSalvar(dados: DadosFicha): string {
  const r = validarDadosDaFicha('pathfinder2e', dados);
  expect(r.ok, `a ficha aceitou ${JSON.stringify(dados)}`).toBe(false);
  return r.ok ? '' : r.erro;
}

describe('ficha de PF2e — o esqueleto do sistema (RV-152)', () => {
  it('nasce com identidade vazia e tudo destreinado — e sem modificador nenhum em `dados`', () => {
    // Os seis modificadores saíram daqui no RV-098: eles são o atributo do
    // personagem e moram na coluna comum. Enquanto estavam nos dois lugares, a
    // criação gravava um e a ficha lia o outro.
    expect(fichaInicial()).toEqual({
      ancestralidade: '',
      heranca: '',
      antecedente: '',
      // As entradas informadas das defesas (RV-155). Nenhum número derivado está
      // aqui: CA, salvaguardas, Percepção, CD de classe e PV sugerido são
      // calculados a cada leitura — ver `defesas.test.ts`.
      grauArmadura: 'destreinado',
      grauFortitude: 'destreinado',
      grauReflexos: 'destreinado',
      grauVontade: 'destreinado',
      grauPercepcao: 'destreinado',
      grauCdClasse: 'destreinado',
      bonusItemArmadura: 0,
      // Ausência é diferente de zero: sem armadura não há teto de Destreza.
      limiteDestrezaArmadura: null,
      atributoChaveClasse: '',
      pvDaAncestralidade: 0,
      pvDaClassePorNivel: 0,
      // A lista de ataques nasce vazia (RV-156): nome, bônus de acerto, dano e o
      // traço ágil são informados pelo jogador, e a penalidade de ataques múltiplos
      // **não** é gravada — ela é derivada da ordem que ele escolhe no golpe.
      ataques: [],
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

  it('as seis chaves antigas de modificador estão registradas — é o que a migration 0009 consolida', () => {
    // Escritas à mão de propósito: são as chaves gravadas em `personagens.dados`
    // de todo personagem de PF2e criado antes do RV-098, e a `0009` precisa
    // nomear exatamente estas seis. Uma esquecida é um atributo apagado em
    // silêncio — a guarda offline da migration compara com esta lista.
    expect(CHAVES_MODIFICADOR_LEGADAS).toEqual([
      'modificadorForca',
      'modificadorDestreza',
      'modificadorConstituicao',
      'modificadorInteligencia',
      'modificadorSabedoria',
      'modificadorCarisma',
    ]);
  });

  it('a ficha recusa as chaves antigas em vez de guardar um valor que ninguém lê', () => {
    // Depois do RV-098 elas não são mais campo de ficha. Aceitá-las de novo
    // reabriria a segunda casa do atributo, e é assim que a suíte diz isso.
    for (const chave of CHAVES_MODIFICADOR_LEGADAS) {
      expect(erroAoSalvar({ ...fichaInicial(), [chave]: 4 })).toContain(chave);
    }
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

  it('as seções da metade do sistema são Identidade e Defesas', () => {
    // Perícias não é uma `SecaoFicha`: ela sai da lista `pericias` (RV-153), que
    // tem seção própria na interface, e uma seção homônima duplicaria o título.
    // Atributos saiu no RV-098: ele é o bloco comum da ficha, desenhado pela
    // escala que a definição declara — uma seção aqui significaria seis campos de
    // modificador ao lado dos seis atributos comuns. Defesas (RV-155) é seção
    // porque o que ela tem são campos **informados**; o número derivado não é
    // campo e vive em `defesas(ficha)`.
    expect(SISTEMA_PATHFINDER2E.secoes.map((s) => s.chave)).toEqual(['identidade', 'defesas']);
    expect(SISTEMA_PATHFINDER2E.secoes[0]?.campos.map((c) => c.chave)).toEqual([
      'ancestralidade',
      'heranca',
      'antecedente',
    ]);
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

describe('ficha de PF2e — o atributo é o modificador, e tem uma casa só (RV-098)', () => {
  it('a escala declarada é o modificador direto, sem fórmula do d20', () => {
    expect(SISTEMA_PATHFINDER2E.atributos).toBe(ESCALA_ATRIBUTO_PF2E);
    expect([ESCALA_ATRIBUTO_PF2E.minimo, ESCALA_ATRIBUTO_PF2E.maximo]).toEqual([-5, 8]);
    expect(ESCALA_ATRIBUTO_PF2E.padrao).toBe(0);
    // Identidade: o número gravado já é o modificador. Se algum dia isto virar
    // `(valor - 10) / 2`, todo personagem de PF2e cai para -3.
    for (const valor of [-5, -1, 0, 4, 8]) {
      expect(ESCALA_ATRIBUTO_PF2E.modificador(valor), `modificador de ${valor}`).toBe(valor);
    }
  });

  it('o modificador sai da coluna comum, que é o que a criação grava', () => {
    // Este é o cenário do card: informei +4 de Destreza, e é +4 que a ficha usa.
    // Antes do RV-098 a coluna era ignorada e o número saía de `dados`.
    const f = ficha(5, fichaInicial(), MODIFICADORES_DE_SEELAH);
    expect(modificadorDeAtributo(f, 'destreza')).toBe(4);
    expect(modificadorDeAtributo(f, 'inteligencia')).toBe(1);
    expect(modificadorDeAtributo(f, 'forca')).toBe(0);
  });

  it('modificador negativo atravessa com o sinal, sem virar zero', () => {
    expect(
      modificadorDeAtributo(ficha(3, fichaInicial(), comModificador('forca', -1)), 'forca'),
    ).toBe(-1);
  });

  it('valor estragado vale +0 em vez de tornar a ficha ilegível', () => {
    const estragada = { ...MODIFICADORES_ZERADOS, forca: 'muito' } as unknown as Atributos;
    expect(modificadorDeAtributo(ficha(1, fichaInicial(), estragada), 'forca')).toBe(0);
  });

  it('nenhuma chave de modificador sobra em `dados`', () => {
    const inicial = fichaInicial();
    for (const chave of CHAVES_MODIFICADOR_LEGADAS) {
      expect(chave in inicial, `\`dados.${chave}\` voltou: o atributo tem duas casas de novo`).toBe(
        false,
      );
    }
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
    const atributos = comModificador(atributo, modificador);
    expect(bonusDeChecagem(ficha(nivel, fichaInicial(), atributos), atributo, grau)).toBe(esperado);
  });

  it('toda rolagem padrão que existir usa a escala do sistema, não a do d20', () => {
    // `rolagensPadrao` está vazio (a iniciativa do PF2e é por Percepção e chega no
    // RV-158). A varredura é a rede que impede a iniciativa por Destreza da ficha
    // genérica — `(valor - 10) / 2` — de entrar aqui por descuido: com Destreza
    // +4, a expressão tem de trazer +4.
    const dados = fichaInicial();
    for (const rolagem of SISTEMA_PATHFINDER2E.rolagensPadrao) {
      expect(
        rolagem.expressao({ nivel: 5, atributos: comModificador('destreza', 4), dados }),
        `a rolagem "${rolagem.chave}" não usa o modificador gravado: ela deriva o ` +
          `número por uma fórmula que não é deste sistema.`,
      ).toContain('+4');
    }
  });
});

describe('ficha de PF2e — a escala vai de −5 a +8, e é cobrada (RV-098)', () => {
  it('os limites declarados são os da regra', () => {
    expect([MODIFICADOR_MINIMO, MODIFICADOR_MAXIMO]).toEqual([-5, 8]);
  });

  it.each(ATRIBUTOS)('%s aceita −5 e +8 e recusa −6 e +9', (atributo) => {
    for (const valor of [-5, 8]) {
      expect(validarAtributosDoSistema('pathfinder2e', comModificador(atributo, valor)).ok).toBe(
        true,
      );
    }
    for (const valor of [-6, 9]) {
      const r = validarAtributosDoSistema('pathfinder2e', comModificador(atributo, valor));
      expect(r.ok, `${atributo} = ${valor} passou`).toBe(false);
    }
  });

  it('informar 18 num atributo de PF2e é 400 em PT-BR dizendo qual é a escala', () => {
    // O cenário de borda do card: 18 é um valor de d20 clássico, não um
    // modificador. A mensagem cita o nome exibível do atributo, o número que a
    // pessoa digitou e a faixa — não um "atributos inválidos" seco.
    const r = validarAtributosDoSistema('pathfinder2e', comModificador('forca', 18));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toContain('Força');
    expect(r.erro).toContain('18');
    expect(r.erro).toContain('de -5 a +8');
    expect(r.erro).toContain('Pathfinder 2e');
  });

  it('a recusa não devolve atributo nenhum para gravar por engano', () => {
    const r = validarAtributosDoSistema('pathfinder2e', comModificador('destreza', 9));
    expect(r.ok).toBe(false);
    expect('atributos' in r).toBe(false);
  });

  it('a mesma faixa em D&D 5e continua sendo a do d20 clássico', () => {
    // A prova de que a escala é por sistema, e não uma faixa global trocada de
    // lugar: 18 é válido em D&D 5e e recusado em PF2e, no mesmo campo.
    expect(validarAtributosDoSistema('dnd5e', comValorEmDnd(18)).ok).toBe(true);
    expect(validarAtributosDoSistema('dnd5e', comValorEmDnd(31)).ok).toBe(false);
    expect(validarAtributosDoSistema('dnd5e', comValorEmDnd(0)).ok).toBe(false);
  });
});

/** Os seis atributos de D&D 5e num mesmo valor da escala 1..30. */
function comValorEmDnd(valor: number): Atributos {
  return {
    forca: valor,
    destreza: valor,
    constituicao: valor,
    inteligencia: valor,
    sabedoria: valor,
    carisma: valor,
  };
}

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
    // As chaves são as 16 perícias fixas (RV-153). Aceitar qualquer chave
    // transformaria `treinamentos` numa lixeira sem dono. Percepção é o caso
    // concreto: no PF2e ela **não** é perícia — o grau dela é uma chave de topo
    // (`grauPercepcao`, RV-155), e não uma entrada deste mapa.
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
