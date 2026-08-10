import { describe, expect, it } from 'vitest';
import { rolarExpressao, type ResultadoRolagem, type Rng } from '../../dados/motor-dados';
import {
  CDS_SIMPLES,
  GRAUS_SUCESSO,
  GRAUS_TREINAMENTO,
  MARGEM_CRITICA,
  NIVEL_MAXIMO_COM_CD,
  NIVEL_MINIMO_COM_CD,
  TIPOS_MODIFICADOR,
  bonusProficiencia,
  cdPorNivel,
  d20NaturalDe,
  grauSucesso,
  somarModificadores,
  type GrauSucesso,
  type GrauTreinamento,
  type Modificador,
} from './regras';

/**
 * Motor de regras de PF2e (RV-151).
 *
 * Este é o arquivo que todo o resto do épico consome: se a aritmética aqui
 * estiver errada, o erro contamina ficha, rolagem, chat e combate — e ninguém
 * percebe, porque número errado parece número.
 *
 * Por isso a disciplina destes testes: **nenhuma constante é recalculada aqui**.
 * Todo valor esperado está escrito à mão, transcrito da regra. Um teste que
 * reproduz a fórmula da implementação concorda com ela até quando ela está
 * errada — vira eco, não guarda.
 */

describe('bonusProficiencia — tabela completa (5 graus × 4 níveis)', () => {
  // Regra: nível + 2/4/6/8 conforme o grau, e +0 quando destreinado.
  // Os 20 valores abaixo estão escritos à mão, um a um, de propósito.
  const tabela: ReadonlyArray<{
    nivel: number;
    esperado: Readonly<Record<GrauTreinamento, number>>;
  }> = [
    { nivel: 1, esperado: { destreinado: 0, treinado: 3, perito: 5, mestre: 7, lendario: 9 } },
    { nivel: 5, esperado: { destreinado: 0, treinado: 7, perito: 9, mestre: 11, lendario: 13 } },
    { nivel: 10, esperado: { destreinado: 0, treinado: 12, perito: 14, mestre: 16, lendario: 18 } },
    { nivel: 20, esperado: { destreinado: 0, treinado: 22, perito: 24, mestre: 26, lendario: 28 } },
  ];

  for (const { nivel, esperado } of tabela) {
    for (const grau of GRAUS_TREINAMENTO) {
      it(`nível ${nivel}, ${grau} → ${esperado[grau]}`, () => {
        expect(bonusProficiencia(nivel, grau)).toBe(esperado[grau]);
      });
    }
  }

  it('nível 5, perito → 9 (cenário do card)', () => {
    expect(bonusProficiencia(5, 'perito')).toBe(9);
  });

  it('destreinado não soma o nível em nível nenhum — nem no 12 do card', () => {
    // A armadilha nº 1: `bonusProficiencia(12, 'destreinado')` é 0, não 12.
    expect(bonusProficiencia(12, 'destreinado')).toBe(0);
    for (const nivel of [1, 2, 5, 10, 12, 17, 20]) {
      expect(bonusProficiencia(nivel, 'destreinado')).toBe(0);
    }
  });

  it('os cinco graus estão na ordem crescente de poder', () => {
    // Se alguém trocar dois graus de lugar na união, o bônus de um personagem
    // muda sem que nenhum outro teste reclame.
    expect([...GRAUS_TREINAMENTO]).toEqual([
      'destreinado',
      'treinado',
      'perito',
      'mestre',
      'lendario',
    ]);
  });

  it('todo grau declarado tem entrada na tabela de proficiência e na de CD simples', () => {
    // Guarda de cobertura: `npm run test` **não** faz typecheck, então um grau
    // novo sem entrada nos `Record` passaria por aqui em silêncio se ninguém
    // varresse a união em runtime. São duas portas, como no registro de sistemas
    // do RV-091: o `Record<GrauTreinamento, …>` fecha a do `npm run check`
    // (TS2741) e este teste fecha a de quem só roda a suíte. A falha lista os
    // graus órfãos pelo nome — guarda que reprova sem dizer o quê não ajuda.
    const semProficiencia = GRAUS_TREINAMENTO.filter((grau) => {
      try {
        return !Number.isFinite(bonusProficiencia(1, grau));
      } catch {
        return true;
      }
    });
    expect(
      semProficiencia,
      'graus sem entrada em PROFICIENCIA_POR_GRAU, em regras.ts — acrescentar um grau à união ' +
        'obriga a declarar quanto ele soma e se ele soma o nível.',
    ).toEqual([]);

    const semCd = GRAUS_TREINAMENTO.filter((grau) => typeof CDS_SIMPLES[grau] !== 'number');
    expect(semCd, 'graus sem entrada em CDS_SIMPLES, em regras.ts.').toEqual([]);
  });
});

describe('grauSucesso — 4 faixas × {sem d20 natural, natural 20, natural 1}', () => {
  const CD = 20;

  // Doze casos, todos com o grau esperado escrito à mão. A leitura das colunas é
  // a regra inteira: compara-se com a CD e **depois** o dado natural desloca um
  // grau, sem transbordar nas pontas.
  const tabela: ReadonlyArray<{
    faixa: string;
    total: number;
    sem: GrauSucesso;
    natural20: GrauSucesso;
    natural1: GrauSucesso;
  }> = [
    {
      faixa: 'CD + 10',
      total: 30,
      sem: 'sucesso-critico',
      natural20: 'sucesso-critico',
      natural1: 'sucesso',
    },
    { faixa: 'CD', total: 20, sem: 'sucesso', natural20: 'sucesso-critico', natural1: 'falha' },
    { faixa: 'CD - 1', total: 19, sem: 'falha', natural20: 'sucesso', natural1: 'falha-critica' },
    {
      faixa: 'CD - 10',
      total: 10,
      sem: 'falha-critica',
      natural20: 'falha',
      natural1: 'falha-critica',
    },
  ];

  for (const { faixa, total, sem, natural20, natural1 } of tabela) {
    it(`total ${total} contra CD ${CD} (${faixa}) sem d20 natural → ${sem}`, () => {
      expect(grauSucesso({ total, cd: CD })).toBe(sem);
      expect(grauSucesso({ total, cd: CD, d20Natural: null })).toBe(sem);
    });

    it(`total ${total} contra CD ${CD} (${faixa}) com natural 20 → ${natural20}`, () => {
      expect(grauSucesso({ total, cd: CD, d20Natural: 20 })).toBe(natural20);
    });

    it(`total ${total} contra CD ${CD} (${faixa}) com natural 1 → ${natural1}`, () => {
      expect(grauSucesso({ total, cd: CD, d20Natural: 1 })).toBe(natural1);
    });
  }

  it('20 natural melhora um grau e não garante sucesso: CD 40, total 25 → falha', () => {
    // Caso-limite escrito explicitamente, como o card pede. A falha crítica
    // subiu para falha e **parou aí**. Uma implementação que devolve "sucesso"
    // no 20 natural passa em qualquer teste ingênuo e morre aqui.
    expect(grauSucesso({ total: 25, cd: 40, d20Natural: 20 })).toBe('falha');
    expect(grauSucesso({ total: 25, cd: 40 })).toBe('falha-critica');
  });

  it('1 natural piora um grau e não garante falha: CD 10, total 31 → sucesso', () => {
    expect(grauSucesso({ total: 31, cd: 10, d20Natural: 1 })).toBe('sucesso');
    expect(grauSucesso({ total: 31, cd: 10 })).toBe('sucesso-critico');
  });

  it('d20 natural que não é 20 nem 1 não desloca nada', () => {
    for (const natural of [2, 10, 17, 19]) {
      expect(grauSucesso({ total: 19, cd: 20, d20Natural: natural })).toBe('falha');
    }
  });

  it('a margem de crítico é exatamente 10, para cima e para baixo', () => {
    expect(MARGEM_CRITICA).toBe(10);
    // Fronteiras exatas: 29 ainda é sucesso, 30 vira crítico; 11 ainda é falha,
    // 10 vira falha crítica.
    expect(grauSucesso({ total: 29, cd: 20 })).toBe('sucesso');
    expect(grauSucesso({ total: 30, cd: 20 })).toBe('sucesso-critico');
    expect(grauSucesso({ total: 11, cd: 20 })).toBe('falha');
    expect(grauSucesso({ total: 10, cd: 20 })).toBe('falha-critica');
  });

  it('os quatro graus estão do melhor para o pior', () => {
    expect([...GRAUS_SUCESSO]).toEqual(['sucesso-critico', 'sucesso', 'falha', 'falha-critica']);
  });

  it('CD negativa e total negativo continuam produzindo um grau, sem exceção', () => {
    expect(grauSucesso({ total: -5, cd: 0 })).toBe('falha');
    expect(grauSucesso({ total: -30, cd: 0, d20Natural: 20 })).toBe('falha');
  });
});

describe('CDS_SIMPLES', () => {
  it('vale 10 / 15 / 20 / 30 / 40, com o salto de perito para mestre', () => {
    expect(CDS_SIMPLES.destreinado).toBe(10);
    expect(CDS_SIMPLES.treinado).toBe(15);
    expect(CDS_SIMPLES.perito).toBe(20);
    // O salto de 20 para 30 é regra, não engano de digitação: nada de +5 aqui.
    expect(CDS_SIMPLES.mestre).toBe(30);
    expect(CDS_SIMPLES.lendario).toBe(40);
  });
});

describe('cdPorNivel — tabela 0..25', () => {
  // Transcrição à mão da tabela de CDs por nível. Cada linha é um valor lido da
  // regra, não uma conta: a curva tem +1 extra a cada três níveis até o 20 e
  // passa a +2 por nível do 21 em diante, e uma fórmula que "quase" acerta é
  // pior que uma tabela.
  const tabela: ReadonlyArray<[nivel: number, cd: number]> = [
    [0, 14],
    [1, 15],
    [2, 16],
    [3, 18],
    [4, 19],
    [5, 20],
    [6, 22],
    [7, 23],
    [8, 24],
    [9, 26],
    [10, 27],
    [11, 28],
    [12, 30],
    [13, 31],
    [14, 32],
    [15, 34],
    [16, 35],
    [17, 36],
    [18, 38],
    [19, 39],
    [20, 40],
    [21, 42],
    [22, 44],
    [23, 46],
    [24, 48],
    [25, 50],
  ];

  for (const [nivel, cd] of tabela) {
    it(`nível ${nivel} → CD ${cd}`, () => {
      expect(cdPorNivel(nivel)).toBe(cd);
    });
  }

  it('as pontas são 14 e 50, e a faixa exposta bate com a tabela', () => {
    expect(cdPorNivel(NIVEL_MINIMO_COM_CD)).toBe(14);
    expect(cdPorNivel(NIVEL_MAXIMO_COM_CD)).toBe(50);
    expect(NIVEL_MINIMO_COM_CD).toBe(0);
    expect(NIVEL_MAXIMO_COM_CD).toBe(25);
  });

  it('fora da faixa devolve null, sem exceção', () => {
    for (const nivel of [-1, -10, 26, 100]) {
      expect(cdPorNivel(nivel)).toBeNull();
    }
  });

  it('nível fracionário devolve null em vez de arredondar por conta própria', () => {
    expect(cdPorNivel(3.5)).toBeNull();
    expect(cdPorNivel(Number.NaN)).toBeNull();
  });
});

describe('somarModificadores — empilhamento por tipo', () => {
  function mod(valor: number, tipo: Modificador['tipo'], origem = 'teste'): Modificador {
    return { valor, tipo, origem };
  }

  it('lista vazia soma 0', () => {
    expect(somarModificadores([])).toBe(0);
  });

  it('do mesmo tipo vale o maior: item +1 e item +2 valem +2', () => {
    expect(somarModificadores([mod(1, 'item'), mod(2, 'item')])).toBe(2);
    expect(somarModificadores([mod(2, 'item'), mod(1, 'item')])).toBe(2);
  });

  it('cenário do card: item +1, item +2 e status +1 somam +3', () => {
    expect(
      somarModificadores([
        mod(1, 'item', 'amuleto'),
        mod(2, 'item', 'armadura'),
        mod(1, 'status', 'bênção'),
      ]),
    ).toBe(3);
  });

  it('tipos diferentes somam entre si', () => {
    expect(somarModificadores([mod(1, 'circunstancia'), mod(2, 'item'), mod(3, 'status')])).toBe(6);
  });

  it('penalidades do mesmo tipo: vale a pior, não a soma', () => {
    expect(somarModificadores([mod(-1, 'circunstancia'), mod(-2, 'circunstancia')])).toBe(-2);
  });

  it('bônus e penalidade do mesmo tipo convivem: os dois entram na conta', () => {
    // Item +2 e item -1 não se cancelam por serem do mesmo tipo: o maior bônus e
    // a pior penalidade daquele tipo entram, cada um uma vez.
    expect(somarModificadores([mod(2, 'item'), mod(1, 'item'), mod(-1, 'item')])).toBe(1);
  });

  it('sem-tipo soma com tudo, inclusive com outros sem-tipo', () => {
    expect(somarModificadores([mod(1, 'sem-tipo'), mod(2, 'sem-tipo')])).toBe(3);
    expect(somarModificadores([mod(1, 'sem-tipo'), mod(2, 'item'), mod(1, 'item')])).toBe(3);
    expect(somarModificadores([mod(-1, 'sem-tipo'), mod(-2, 'sem-tipo')])).toBe(-3);
  });

  it('modificador de valor zero não muda o resultado nem ocupa o lugar do maior', () => {
    expect(somarModificadores([mod(0, 'item'), mod(2, 'item')])).toBe(2);
    expect(somarModificadores([mod(0, 'status')])).toBe(0);
  });

  it('caso completo com os quatro tipos de uma vez', () => {
    // circunstância: maior bônus +2, pior penalidade -1 → +1
    // item: maior bônus +3 → +3
    // status: pior penalidade -2 → -2
    // sem-tipo: +1 e -3 somam → -2
    // total escrito à mão: 1 + 3 - 2 - 2 = 0
    expect(
      somarModificadores([
        mod(2, 'circunstancia'),
        mod(1, 'circunstancia'),
        mod(-1, 'circunstancia'),
        mod(3, 'item'),
        mod(-2, 'status'),
        mod(1, 'sem-tipo'),
        mod(-3, 'sem-tipo'),
      ]),
    ).toBe(0);
  });

  it('os quatro tipos previstos pela regra estão declarados', () => {
    expect([...TIPOS_MODIFICADOR]).toEqual(['circunstancia', 'item', 'status', 'sem-tipo']);
  });
});

describe('d20NaturalDe — nunca adivinha', () => {
  /**
   * RNG determinístico que entrega os valores pedidos, na ordem, para dados das
   * faces informadas. Os resultados vêm do **motor de dados de verdade**, e não
   * de um `ResultadoRolagem` montado à mão: um fixture escrito por mim casaria
   * com a minha leitura do formato, não com o que o motor produz (F3 da
   * taxonomia de falhas).
   */
  function rngDeValores(pares: ReadonlyArray<readonly [valor: number, faces: number]>): Rng {
    // Meio do intervalo do valor desejado — imune a arredondamento.
    const fracoes = pares.map(([valor, faces]) => (valor - 1) / faces + 1 / (faces * 2));
    let indice = 0;
    return () => fracoes[indice++] ?? 0;
  }

  function rolar(
    expressao: string,
    pares: ReadonlyArray<readonly [valor: number, faces: number]>,
  ): ResultadoRolagem {
    const saida = rolarExpressao(expressao, rngDeValores(pares));
    if (!saida.ok) throw new Error(`Expressão inválida no teste: ${saida.erro}`);
    return saida.resultado;
  }

  it('o RNG do teste entrega mesmo os valores pedidos', () => {
    // Sem esta asserção, um erro no dublê passaria por acerto nos testes abaixo.
    const resultado = rolar('1d20+1d6', [
      [17, 20],
      [4, 6],
    ]);
    expect(resultado.total).toBe(21);
  });

  it('1d20 puro devolve o dado', () => {
    expect(d20NaturalDe(rolar('1d20', [[13, 20]]))).toBe(13);
    expect(d20NaturalDe(rolar('1d20', [[20, 20]]))).toBe(20);
    expect(d20NaturalDe(rolar('1d20', [[1, 20]]))).toBe(1);
  });

  it('1d20 com constantes devolve o dado — é o caso normal de uma checagem', () => {
    // `1d20+11` é o formato de toda perícia do RV-153: se constante atrapalhasse,
    // o ajuste de dado natural nunca aconteceria na prática.
    expect(d20NaturalDe(rolar('1d20+11', [[20, 20]]))).toBe(20);
    expect(d20NaturalDe(rolar('1d20-2', [[1, 20]]))).toBe(1);
  });

  it('2d20kh1 devolve o dado mantido, não o descartado', () => {
    const resultado = rolar('2d20kh1', [
      [3, 20],
      [18, 20],
    ]);
    expect(d20NaturalDe(resultado)).toBe(18);
  });

  it('2d20kl1 devolve o mantido, mesmo sendo o pior', () => {
    const resultado = rolar('2d20kl1', [
      [20, 20],
      [1, 20],
    ]);
    expect(d20NaturalDe(resultado)).toBe(1);
  });

  it('1d20+1d6 devolve null: a pergunta é ambígua e o código não chuta', () => {
    // Guarda do card. Um d20 acompanhado de outro dado poderia ser lido como "o
    // d20 é aquele ali", até a expressão virar `1d20+1d20`.
    const resultado = rolar('1d20+1d6', [
      [20, 20],
      [3, 6],
    ]);
    expect(d20NaturalDe(resultado)).toBeNull();
    // E sem d20 identificável não há ajuste nenhum no grau.
    expect(
      grauSucesso({ total: resultado.total, cd: 40, d20Natural: d20NaturalDe(resultado) }),
    ).toBe('falha-critica');
  });

  it('3d6 devolve null: não há d20 na expressão', () => {
    const resultado = rolar('3d6', [
      [6, 6],
      [6, 6],
      [6, 6],
    ]);
    expect(d20NaturalDe(resultado)).toBeNull();
  });

  it('2d20 sem kh devolve null: dois dados mantidos, nenhum é "o" natural', () => {
    const resultado = rolar('2d20', [
      [20, 20],
      [11, 20],
    ]);
    expect(d20NaturalDe(resultado)).toBeNull();
  });

  it('d20 subtraído devolve null: 30-1d20 não é uma checagem', () => {
    const resultado = rolar('30-1d20', [[20, 20]]);
    expect(d20NaturalDe(resultado)).toBeNull();
  });

  it('expressão sem nenhum dado devolve null', () => {
    expect(d20NaturalDe(rolar('7', []))).toBeNull();
  });

  it('o par natural + grau resolve o cenário do RV-154 de ponta a ponta', () => {
    // "1d20+2 cd 40" com o d20 em 20: total 22, falha crítica pela conta, que o
    // 20 natural melhora para falha. Não é sucesso, e é isso que o chat vai
    // precisar dizer sem mentir.
    const resultado = rolar('1d20+2', [[20, 20]]);
    expect(resultado.total).toBe(22);
    expect(
      grauSucesso({ total: resultado.total, cd: 40, d20Natural: d20NaturalDe(resultado) }),
    ).toBe('falha');
  });
});
