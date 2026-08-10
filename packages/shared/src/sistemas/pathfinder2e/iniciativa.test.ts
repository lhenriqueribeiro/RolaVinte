import { describe, expect, it } from 'vitest';
import { defesasDoPersonagem, expressaoDePericia } from '../calculo';
import {
  CHAVE_INICIATIVA,
  chaveDeIniciativaPor,
  iniciativaEscolhida,
  opcoesDeIniciativa,
} from '../iniciativa';
import { atributosIniciais, dadosIniciaisDaFicha } from '../registro';
import type { FichaCalculavel } from '../tipos';
import { CHAVE_PERCEPCAO } from './defesas';
import { SISTEMA_PATHFINDER2E } from './definicao';
import { PERICIAS_PF2E } from './pericias';
import { bonusProficiencia } from './regras';

/**
 * Iniciativa de Pathfinder 2e (RV-158).
 *
 * O que este arquivo mede, e o teste cross-sistema não: que a iniciativa é
 * **exatamente** a Percepção que a ficha mostra, e que a alternativa é
 * **exatamente** a perícia que a ficha mostra. É a defesa contra a armadilha nº 1
 * do briefing — reimplementar a Percepção, com um `+ nivel` ou uma segunda tabela
 * de proficiência, e acabar com dois números para a mesma checagem (F12).
 *
 * A comparação é de **expressão contra expressão**, caractere por caractere, e não
 * de "o número está numa faixa plausível": um `+ nivel` a mais dá um número
 * plausível.
 */

const SISTEMA = 'pathfinder2e';

/** Ficha do cenário do card: Percepção +9 = proficiência de perito no nível 3 + Sabedoria +2. */
function fichaComPercepcaoDeNove(): FichaCalculavel {
  return {
    nivel: 3,
    atributos: { ...atributosIniciais(SISTEMA), sabedoria: 2, destreza: 3 },
    dados: {
      ...dadosIniciaisDaFicha(SISTEMA),
      grauPercepcao: 'perito',
      treinamentos: { furtividade: 'treinado' },
    },
  };
}

describe('iniciativa de Pathfinder 2e — a Percepção da ficha, e nada recalculado', () => {
  it('o cenário do card: Percepção +9 rola 1d20+9', () => {
    // A conta que o card descreve, conferida de fora: perito no nível 3 são 3 + 4 = 7,
    // mais Sabedoria +2 → +9. `bonusProficiencia` é o dono da primeira metade.
    expect(bonusProficiencia(3, 'perito')).toBe(7);

    const escolhida = iniciativaEscolhida(SISTEMA_PATHFINDER2E, fichaComPercepcaoDeNove());

    expect(escolhida?.chave).toBe(CHAVE_INICIATIVA);
    expect(escolhida?.rotulo).toBe('Iniciativa (Percepção)');
    expect(escolhida?.expressao).toBe('1d20+9');
  });

  it('a expressão da iniciativa é idêntica à da Percepção que a ficha mostra', () => {
    const ficha = fichaComPercepcaoDeNove();
    const personagem = { ...ficha, sistema: SISTEMA } as const;
    const percepcao = defesasDoPersonagem(personagem, 'Seelah').find(
      (defesa) => defesa.chave === CHAVE_PERCEPCAO,
    );

    // Se algum dia estas duas divergirem, existem duas contas de Percepção no
    // repositório — que é o defeito que este card foi escrito para não produzir.
    expect(percepcao?.expressao).toBe('1d20+9');
    expect(iniciativaEscolhida(SISTEMA_PATHFINDER2E, ficha)?.expressao).toBe(percepcao?.expressao);
  });

  it('destreinado em Percepção não soma o nível — a armadilha do sistema', () => {
    // Nível 20 destreinado com Sabedoria +0 tem Percepção +0, não +20. A regra é de
    // `bonusProficiencia`; o que se prova aqui é que a iniciativa não a contorna.
    const ficha: FichaCalculavel = {
      nivel: 20,
      atributos: atributosIniciais(SISTEMA),
      dados: dadosIniciaisDaFicha(SISTEMA),
    };

    expect(iniciativaEscolhida(SISTEMA_PATHFINDER2E, ficha)?.expressao).toBe('1d20+0');
  });

  it('subir de nível muda a iniciativa sem ninguém gravar nada', () => {
    const base = fichaComPercepcaoDeNove();
    const subiu = { ...base, nivel: 4 };

    expect(iniciativaEscolhida(SISTEMA_PATHFINDER2E, base)?.expressao).toBe('1d20+9');
    expect(iniciativaEscolhida(SISTEMA_PATHFINDER2E, subiu)?.expressao).toBe('1d20+10');
  });

  it('Sabedoria negativa penaliza a iniciativa em vez de ser ignorada', () => {
    const ficha: FichaCalculavel = {
      nivel: 1,
      atributos: { ...atributosIniciais(SISTEMA), sabedoria: -2 },
      dados: { ...dadosIniciaisDaFicha(SISTEMA), grauPercepcao: 'treinado' },
    };

    // Treinado no nível 1 são 1 + 2 = 3, menos 2 de Sabedoria → +1.
    expect(iniciativaEscolhida(SISTEMA_PATHFINDER2E, ficha)?.expressao).toBe('1d20+1');
  });
});

describe('iniciativa de Pathfinder 2e — a perícia que a cena pedir', () => {
  it('as opções são a Percepção e as dezesseis perícias, nesta ordem', () => {
    const opcoes = opcoesDeIniciativa(SISTEMA_PATHFINDER2E, fichaComPercepcaoDeNove());

    expect(opcoes.map((opcao) => opcao.chave)).toEqual([
      CHAVE_INICIATIVA,
      ...PERICIAS_PF2E.map((pericia) => chaveDeIniciativaPor(pericia.chave)),
    ]);
    expect(opcoes).toHaveLength(1 + PERICIAS_PF2E.length);
  });

  it('a emboscada do card: Furtividade treinada rola o bônus de Furtividade', () => {
    const ficha = fichaComPercepcaoDeNove();

    const escolhida = iniciativaEscolhida(
      SISTEMA_PATHFINDER2E,
      ficha,
      chaveDeIniciativaPor('furtividade'),
    );

    // Treinado no nível 3 são 3 + 2 = 5, mais Destreza +3 → +8. E o número é o mesmo
    // que a seção Perícias mostra: uma conta só.
    expect(escolhida?.expressao).toBe('1d20+8');
    expect(escolhida?.expressao).toBe(
      expressaoDePericia({ ...ficha, sistema: SISTEMA }, 'furtividade'),
    );
    expect(escolhida?.rotulo).toBe('Iniciativa (Furtividade)');
  });

  it('toda alternativa concorda com a perícia correspondente da ficha', () => {
    const ficha = fichaComPercepcaoDeNove();
    const personagem = { ...ficha, sistema: SISTEMA } as const;
    const opcoes = opcoesDeIniciativa(SISTEMA_PATHFINDER2E, ficha);

    const divergentes = PERICIAS_PF2E.filter((pericia) => {
      const opcao = opcoes.find((o) => o.chave === chaveDeIniciativaPor(pericia.chave));
      return opcao?.expressao !== expressaoDePericia(personagem, pericia.chave);
    }).map((pericia) => pericia.chave);

    expect(
      divergentes,
      `Perícia(s) cuja iniciativa não bate com o bônus que a ficha mostra: ` +
        `${divergentes.join(', ')}. Há duas contas para a mesma checagem.`,
    ).toEqual([]);
  });

  it('o rótulo de toda alternativa nomeia a perícia — o chat diz por que o número é aquele', () => {
    const opcoes = opcoesDeIniciativa(SISTEMA_PATHFINDER2E, fichaComPercepcaoDeNove());

    for (const pericia of PERICIAS_PF2E) {
      const opcao = opcoes.find((o) => o.chave === chaveDeIniciativaPor(pericia.chave));
      expect(opcao?.rotulo, pericia.chave).toBe(`Iniciativa (${pericia.rotulo})`);
      expect(opcao?.padrao, pericia.chave).toBe(false);
    }
  });

  it('o Saber não entra: as instâncias dele são da ficha, e a lista é estática', () => {
    const ficha: FichaCalculavel = {
      ...fichaComPercepcaoDeNove(),
      dados: {
        ...fichaComPercepcaoDeNove().dados,
        saberes: [{ especializacao: 'Guerra', grau: 'treinado' }],
      },
    };

    const comSaber = opcoesDeIniciativa(SISTEMA_PATHFINDER2E, ficha).filter((opcao) =>
      opcao.chave.includes('saber'),
    );
    expect(comSaber).toEqual([]);
  });
});
