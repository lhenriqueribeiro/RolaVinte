import { describe, expect, it } from 'vitest';
import type { Atributos } from '../../schemas/personagens';
import {
  bonusPericia,
  expressaoDePericia,
  grauDePericia,
  motivoDeRolagemDePericia,
  periciasDaFicha,
  acoesDePericia,
  type PersonagemCalculavel,
} from '../calculo';
import { dadosIniciaisDaFicha, validarDadosDaFicha } from '../registro';
import type { DadosFicha } from '../tipos';
import { SISTEMA_PATHFINDER2E } from './definicao';
import {
  acrescentarSaber,
  chaveDeSaber,
  definirGrauDeSaber,
  especializacaoDaChave,
  FAMILIA_SABER,
  LIMITE_SABERES,
  PERICIAS_PF2E,
  removerSaber,
  rotuloDeSaber,
  saberesDe,
  TAMANHO_MAXIMO_ESPECIALIZACAO,
} from './pericias';
import { bonusProficiencia, GRAUS_TREINAMENTO, type GrauTreinamento } from './regras';

/**
 * Perícias de Pathfinder 2e (RV-153).
 *
 * A tabela de bônus é conferida contra `bonusProficiencia` (RV-151), que é onde
 * a regra mora e onde ela já está testada com números escritos à mão. Repetir
 * `nível + 2` aqui seria escrever a conta duas vezes: no dia de uma errata, o
 * teste concordaria com o bug. O que **está** escrito à mão são as âncoras — os
 * casos do card e o caso que a armadilha nº 1 produz.
 */

const ATRIBUTOS_NEUTROS: Atributos = {
  forca: 10,
  destreza: 10,
  constituicao: 10,
  inteligencia: 10,
  sabedoria: 10,
  carisma: 10,
};

/** Colunas comuns cheias: no d20 clássico dariam +5, e aqui não valem nada. */
const ATRIBUTOS_ALTOS: Atributos = {
  forca: 20,
  destreza: 20,
  constituicao: 20,
  inteligencia: 20,
  sabedoria: 20,
  carisma: 20,
};

function fichaPf2e(nivel: number, dados: DadosFicha = {}): PersonagemCalculavel {
  return {
    sistema: 'pathfinder2e',
    nivel,
    // De propósito: as colunas comuns altas provariam qualquer queda acidental
    // para `modificadorAtributo()`.
    atributos: ATRIBUTOS_ALTOS,
    dados: { ...dadosIniciaisDaFicha('pathfinder2e'), ...dados },
  };
}

/** Ficha com um modificador e um grau escolhidos, e o resto no padrão. */
function comPericia(
  nivel: number,
  pericia: string,
  grau: GrauTreinamento,
  modificadores: Partial<Record<string, number>> = {},
): PersonagemCalculavel {
  const base = fichaPf2e(nivel, modificadores as DadosFicha);
  return { ...base, dados: SISTEMA_PATHFINDER2E.definirGrauDePericia(base.dados, pericia, grau) };
}

function erroAoSalvar(dados: DadosFicha): string {
  const r = validarDadosDaFicha('pathfinder2e', dados);
  expect(r.ok, `a ficha aceitou ${JSON.stringify(dados)}`).toBe(false);
  return r.ok ? '' : r.erro;
}

describe('a tabela das perícias de PF2e', () => {
  it('são dezesseis de chave fixa mais a família Saber — dezessete no total', () => {
    expect(PERICIAS_PF2E).toHaveLength(16);
    expect(SISTEMA_PATHFINDER2E.familiasPericia.map((f) => f.chave)).toEqual(['saber']);
    expect(SISTEMA_PATHFINDER2E.pericias).toBe(PERICIAS_PF2E);
  });

  it('cada perícia sai do atributo da regra', () => {
    // Escrito à mão: é a tabela do sistema, e um atributo trocado dá um bônus
    // plausível e errado — o tipo de defeito que ninguém percebe em jogo.
    expect(PERICIAS_PF2E.map((p) => [p.chave, p.atributo])).toEqual([
      ['acrobacia', 'destreza'],
      ['arcanismo', 'inteligencia'],
      ['atletismo', 'forca'],
      ['atuacao', 'carisma'],
      ['diplomacia', 'carisma'],
      ['enganacao', 'carisma'],
      ['furtividade', 'destreza'],
      ['intimidacao', 'carisma'],
      ['ladinagem', 'destreza'],
      ['medicina', 'sabedoria'],
      ['natureza', 'sabedoria'],
      ['ocultismo', 'inteligencia'],
      ['oficio', 'inteligencia'],
      ['religiao', 'sabedoria'],
      ['sobrevivencia', 'sabedoria'],
      ['sociedade', 'inteligencia'],
    ]);
  });

  it('Percepção não é perícia no PF2e — nem na lista, nem como rolagem', () => {
    // DoD do card. Percepção é defesa (RV-155) e rola iniciativa (RV-158);
    // colocá-la aqui daria dois lugares para o mesmo número.
    expect(PERICIAS_PF2E.some((p) => p.chave === 'percepcao')).toBe(false);
    expect(PERICIAS_PF2E.some((p) => p.rotulo === 'Percepção')).toBe(false);
    const ficha = fichaPf2e(5);
    expect(bonusPericia(ficha, 'percepcao')).toBeNull();
    expect(expressaoDePericia(ficha, 'percepcao')).toBeNull();
    expect(motivoDeRolagemDePericia('pathfinder2e', 'percepcao', 'Seelah')).toBeNull();
  });

  it('as chaves não se repetem e todo rótulo é preenchido', () => {
    const chaves = PERICIAS_PF2E.map((p) => p.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    for (const pericia of PERICIAS_PF2E) {
      expect(pericia.rotulo.trim().length, pericia.chave).toBeGreaterThan(0);
    }
  });
});

describe('bônus de perícia — as 16 × {destreinado, treinado, lendário} nos níveis 1 e 20', () => {
  const GRAUS_DA_TABELA = ['destreinado', 'treinado', 'lendario'] as const;
  const NIVEIS = [1, 20] as const;
  const MODIFICADOR = 3;

  const casos = PERICIAS_PF2E.flatMap((pericia) =>
    NIVEIS.flatMap((nivel) =>
      GRAUS_DA_TABELA.map((grau) => [pericia.chave, pericia.atributo, nivel, grau] as const),
    ),
  );

  it('a tabela cobre 96 combinações — se encolher, o laço parou de provar', () => {
    expect(casos).toHaveLength(96);
  });

  it.each(casos)(
    '%s (nível %s, %s) soma modificador + proficiência',
    (chave, _atr, nivel, grau) => {
      const pericia = PERICIAS_PF2E.find((p) => p.chave === chave);
      if (!pericia) throw new Error(`perícia sumiu da tabela: ${chave}`);
      const ficha = comPericia(nivel, chave, grau, {
        [`modificador${pericia.atributo.charAt(0).toUpperCase()}${pericia.atributo.slice(1)}`]:
          MODIFICADOR,
      });

      expect(grauDePericia(ficha, chave)).toBe(grau);
      expect(bonusPericia(ficha, chave)).toBe(MODIFICADOR + bonusProficiencia(nivel, grau));
    },
  );

  it('destreinado no nível 20 vale o modificador, e só — o nível não entra', () => {
    // A armadilha nº 1, escrita com número: Destreza +4, nível 20, destreinado
    // em Furtividade é +4. Se algum dia isto virar +24, todo destreinado do
    // sistema inflou em silêncio.
    const ficha = comPericia(20, 'furtividade', 'destreinado', { modificadorDestreza: 4 });
    expect(bonusPericia(ficha, 'furtividade')).toBe(4);
    expect(expressaoDePericia(ficha, 'furtividade')).toBe('1d20+4');
  });

  it('o cenário do card: nível 5, treinado em Furtividade, Destreza +4 → +11', () => {
    const ficha = comPericia(5, 'furtividade', 'treinado', { modificadorDestreza: 4 });
    expect(bonusPericia(ficha, 'furtividade')).toBe(11);
    expect(expressaoDePericia(ficha, 'furtividade')).toBe('1d20+11');
    expect(motivoDeRolagemDePericia('pathfinder2e', 'furtividade', 'Seelah')).toBe(
      'Furtividade — Seelah',
    );
  });

  it('o outro cenário do card: destreinado em Arcanismo com Inteligência +1 → +1', () => {
    const ficha = comPericia(5, 'arcanismo', 'destreinado', { modificadorInteligencia: 1 });
    expect(bonusPericia(ficha, 'arcanismo')).toBe(1);
    expect(expressaoDePericia(ficha, 'arcanismo')).toBe('1d20+1');
  });

  it('modificador negativo sai com sinal, sem virar "+-1"', () => {
    const ficha = comPericia(3, 'atletismo', 'treinado', { modificadorForca: -1 });
    expect(bonusPericia(ficha, 'atletismo')).toBe(4);
    const desastrado = comPericia(1, 'atletismo', 'destreinado', { modificadorForca: -2 });
    expect(expressaoDePericia(desastrado, 'atletismo')).toBe('1d20-2');
  });

  it('nenhum bônus muda quando as colunas comuns 1..30 mudam', () => {
    // Rede contra a queda para `modificadorAtributo()`: a ficha de PF2e ignora
    // `atributos`, e um `(valor - 10) / 2` escondido apareceria aqui.
    const alta = comPericia(5, 'furtividade', 'treinado');
    const baixa: PersonagemCalculavel = { ...alta, atributos: ATRIBUTOS_NEUTROS };
    for (const pericia of PERICIAS_PF2E) {
      expect(bonusPericia(alta, pericia.chave), pericia.chave).toBe(
        bonusPericia(baixa, pericia.chave),
      );
    }
  });
});

describe('Saber é uma família, não uma chave', () => {
  function fichaComSaberes(): PersonagemCalculavel {
    const base = fichaPf2e(5, { modificadorInteligencia: 2 });
    let dados = acrescentarSaber(base.dados, 'Guerra');
    dados = acrescentarSaber(dados, 'Náutico');
    dados = definirGrauDeSaber(dados, chaveDeSaber('Guerra'), 'treinado');
    return { ...base, dados };
  }

  it('duas especializações convivem, em linhas separadas e com bônus diferentes', () => {
    // O cenário de borda do card. Guerra é treinada (nível 5 → +2 de nível + 2)
    // e Náutico é destreinado (o nível não entra): +9 contra +2.
    const ficha = fichaComSaberes();
    const guerra = chaveDeSaber('Guerra');
    const nautico = chaveDeSaber('Náutico');

    expect(grauDePericia(ficha, guerra)).toBe('treinado');
    expect(grauDePericia(ficha, nautico)).toBe('destreinado');
    expect(bonusPericia(ficha, guerra)).toBe(2 + bonusProficiencia(5, 'treinado'));
    expect(bonusPericia(ficha, nautico)).toBe(2);
    expect(bonusPericia(ficha, guerra)).toBe(9);
    expect(expressaoDePericia(ficha, guerra)).toBe('1d20+9');
    expect(expressaoDePericia(ficha, nautico)).toBe('1d20+2');
  });

  it('as instâncias entram na lista da ficha, depois das dezesseis fixas', () => {
    const ficha = fichaComSaberes();
    const chaves = periciasDaFicha(ficha).map((p) => p.chave);

    expect(chaves.slice(0, 16)).toEqual(PERICIAS_PF2E.map((p) => p.chave));
    expect(chaves.slice(16)).toEqual([chaveDeSaber('Guerra'), chaveDeSaber('Náutico')]);
    // A ficha sem nenhum Saber mostra exatamente as dezesseis.
    expect(periciasDaFicha(fichaPf2e(1))).toHaveLength(16);
  });

  it('o rótulo e o motivo da rolagem trazem a especialização', () => {
    const chave = chaveDeSaber('Guerra');
    expect(rotuloDeSaber(chave)).toBe('Saber (Guerra)');
    expect(FAMILIA_SABER.rotuloDeInstancia(chave)).toBe('Saber (Guerra)');
    expect(motivoDeRolagemDePericia('pathfinder2e', chave, 'Seelah')).toBe(
      'Saber (Guerra) — Seelah',
    );
    // Chave que não é da família não vira Saber nenhum.
    expect(rotuloDeSaber('furtividade')).toBeNull();
    expect(especializacaoDaChave('saber:')).toBeNull();
  });

  it('a família não é rolável, e instância que a ficha não tem também não', () => {
    const ficha = fichaComSaberes();
    expect(bonusPericia(ficha, 'saber')).toBeNull();
    expect(grauDePericia(ficha, chaveDeSaber('Culinária'))).toBeNull();
    expect(bonusPericia(ficha, chaveDeSaber('Culinária'))).toBeNull();
  });

  it('acrescentar, trocar o grau e remover são puros e sobrevivem ao schema', () => {
    const inicial = dadosIniciaisDaFicha('pathfinder2e');
    const comGuerra = acrescentarSaber(inicial, '  Guerra  ');

    expect(saberesDe(inicial)).toEqual([]);
    expect(saberesDe(comGuerra)).toEqual([{ especializacao: 'Guerra', grau: 'destreinado' }]);
    expect(validarDadosDaFicha('pathfinder2e', comGuerra).ok).toBe(true);

    const perita = definirGrauDeSaber(comGuerra, chaveDeSaber('Guerra'), 'perito');
    expect(saberesDe(comGuerra)[0]?.grau, 'a entrada foi mutada').toBe('destreinado');
    expect(saberesDe(perita)).toEqual([{ especializacao: 'Guerra', grau: 'perito' }]);
    expect(validarDadosDaFicha('pathfinder2e', perita).ok).toBe(true);

    expect(saberesDe(removerSaber(perita, chaveDeSaber('Guerra')))).toEqual([]);
    expect(removerSaber(perita, chaveDeSaber('Inexistente'))).toBe(perita);
    expect(removerSaber(perita, 'furtividade')).toBe(perita);
  });

  it('a mesma especialização não entra duas vezes, mesmo com outra caixa', () => {
    const dados = acrescentarSaber(dadosIniciaisDaFicha('pathfinder2e'), 'Guerra');
    expect(acrescentarSaber(dados, 'guerra')).toBe(dados);
    expect(acrescentarSaber(dados, '   ')).toBe(dados);
    // E pela API, onde ninguém passou pela interface, o schema recusa em PT-BR.
    const erro = erroAoSalvar({
      ...dados,
      saberes: [
        { especializacao: 'Guerra', grau: 'treinado' },
        { especializacao: 'guerra', grau: 'perito' },
      ],
    });
    expect(erro).toContain('repetida');
  });

  it('especialização vazia é recusada em PT-BR, e nada é gravado', () => {
    // Cenário de borda do card. A interface nem deixa clicar em "Adicionar" com
    // o campo vazio, mas a defesa que vale é a do schema.
    const inicial = dadosIniciaisDaFicha('pathfinder2e');
    const erro = erroAoSalvar({
      ...inicial,
      saberes: [{ especializacao: '   ', grau: 'treinado' }],
    });
    expect(erro).toContain('informe a especialização');
    expect(erro).toContain('Pathfinder 2e');
    expect(acrescentarSaber(inicial, '')).toBe(inicial);
  });

  it('a lista tem teto, e a especialização também', () => {
    const inicial = dadosIniciaisDaFicha('pathfinder2e');
    const acima = {
      ...inicial,
      saberes: Array.from({ length: LIMITE_SABERES + 1 }, (_v, i) => ({
        especializacao: `Assunto ${i}`,
        grau: 'treinado' as const,
      })),
    };
    expect(erroAoSalvar(acima)).toContain(String(LIMITE_SABERES));

    const nomeGigante = 'x'.repeat(TAMANHO_MAXIMO_ESPECIALIZACAO + 1);
    expect(erroAoSalvar({ ...inicial, saberes: [{ especializacao: nomeGigante }] })).toContain(
      String(TAMANHO_MAXIMO_ESPECIALIZACAO),
    );
    expect(
      validarDadosDaFicha('pathfinder2e', {
        ...inicial,
        saberes: [{ especializacao: 'x'.repeat(TAMANHO_MAXIMO_ESPECIALIZACAO) }],
      }).ok,
    ).toBe(true);

    let cheia = inicial;
    for (let i = 0; i < LIMITE_SABERES; i += 1) cheia = acrescentarSaber(cheia, `Assunto ${i}`);
    expect(saberesDe(cheia)).toHaveLength(LIMITE_SABERES);
    expect(acrescentarSaber(cheia, 'Mais um')).toBe(cheia);
  });

  it('ficha gravada com lista estragada é lida como lista vazia, sem quebrar', () => {
    expect(saberesDe({ saberes: 'nada disso' })).toEqual([]);
    expect(
      saberesDe({ saberes: [null, 7, { grau: 'treinado' }, { especializacao: '  ' }] }),
    ).toEqual([]);
    expect(saberesDe({ saberes: [{ especializacao: 'Guerra', grau: 'genial' }] })).toEqual([
      { especializacao: 'Guerra', grau: 'destreinado' },
    ]);
  });
});

describe('ações que exigem treinamento', () => {
  it('destreinado em Medicina vê a ação indisponível com o motivo, não escondida', () => {
    // Cenário de borda do card: esconder o botão é F4/F6 — quem é destreinado
    // precisa saber que a ação existe e o que falta para usá-la.
    const ficha = comPericia(5, 'medicina', 'destreinado');
    const acoes = acoesDePericia(ficha, 'medicina');

    expect(acoes.length).toBeGreaterThan(0);
    expect(acoes.map((a) => a.nome)).toContain('Tratar Ferimentos');
    for (const acao of acoes) {
      expect(acao.disponivel, acao.nome).toBe(false);
      expect(acao.motivo, acao.nome).toBe('Exige ao menos treinado em Medicina.');
    }
  });

  it.each(GRAUS_TREINAMENTO.filter((g) => g !== 'destreinado'))(
    'com %s a ação libera e o motivo some',
    (grau) => {
      const acoes = acoesDePericia(comPericia(5, 'medicina', grau), 'medicina');
      for (const acao of acoes) {
        expect(acao.disponivel, acao.nome).toBe(true);
        expect(acao.motivo, acao.nome).toBeNull();
      }
    },
  );

  it('perícia sem ação de treinado devolve lista vazia, e perícia inexistente também', () => {
    expect(acoesDePericia(comPericia(5, 'furtividade', 'destreinado'), 'furtividade')).toEqual([]);
    expect(acoesDePericia(fichaPf2e(5), 'percepcao')).toEqual([]);
  });

  it('a instância de Saber herda as ações da família', () => {
    const base = fichaPf2e(5);
    const dados = acrescentarSaber(base.dados, 'Guerra');
    const ficha: PersonagemCalculavel = { ...base, dados };
    const acoes = acoesDePericia(ficha, chaveDeSaber('Guerra'));

    expect(acoes.map((a) => a.nome)).toEqual(['Ganhar Renda']);
    expect(acoes[0]?.motivo).toBe('Exige ao menos treinado em Saber (Guerra).');
  });

  it('nenhum outro sistema ganhou ações por acidente', () => {
    const thorin: PersonagemCalculavel = {
      sistema: 'dnd5e',
      nivel: 3,
      atributos: ATRIBUTOS_NEUTROS,
      dados: dadosIniciaisDaFicha('dnd5e'),
    };
    expect(acoesDePericia(thorin, 'furtividade')).toEqual([]);
  });
});
