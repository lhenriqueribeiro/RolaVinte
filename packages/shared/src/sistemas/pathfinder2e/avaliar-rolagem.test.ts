import { describe, expect, it } from 'vitest';
import { rolarExpressao } from '../../dados/motor-dados';
import { definicaoDoSistema } from '../registro';
import { avaliarRolagemPathfinder2e } from './avaliar-rolagem';

/**
 * A avaliação de uma checagem de PF2e (RV-154).
 *
 * **As rolagens são produzidas pelo motor de dados real, com RNG determinístico**,
 * e não por um `ResultadoRolagem` montado à mão. É a mesma disciplina que o
 * RV-151 adotou em `d20NaturalDe` e o motivo é o F3 da taxonomia: um fixture
 * escrito por quem implementa casa com a leitura *dele* do formato, não com o que
 * o motor de fato produz — e `d20NaturalDe` depende de `descartado`, `sinal` e
 * `faces`, três campos fáceis de escrever errado num objeto literal.
 */

/** Rola a expressão com um d20 forçado — o RNG devolve sempre a mesma face. */
function rolarComD20(expressao: string, faceDoD20: number) {
  // `Math.floor(sorteio * faces) + 1` é a conta do motor; para faces = 20 esta
  // fração devolve exatamente a face pedida. Em `1d20+1d6` o mesmo sorteio cai
  // num d6 e dá outra face — irrelevante para o que aquele caso testa (o d20
  // ambíguo), e por isso o dublê é conferido antes de ser usado.
  const saida = rolarExpressao(expressao, () => (faceDoD20 - 1) / 20 + 0.001);
  if (!saida.ok) throw new Error(`expressão inválida no teste: ${expressao} — ${saida.erro}`);
  return saida.resultado;
}

describe('avaliarRolagemPathfinder2e — o dublê de RNG produz o que o teste diz', () => {
  it('a face forçada é a que sai no d20 e no total', () => {
    // Sanidade do próprio dublê, antes de qualquer asserção que dependa dele.
    const resultado = rolarComD20('1d20+11', 17);
    expect(resultado.termos[0]).toMatchObject({ tipo: 'dados', faces: 20 });
    expect(resultado.total).toBe(28);
  });
});

describe('avaliarRolagemPathfinder2e — os quatro graus contra a CD', () => {
  const FAIXAS: ReadonlyArray<[face: number, total: number, grau: string]> = [
    // CD 18, expressão `1d20+11`: o total é a face + 11.
    [17, 28, 'sucesso-critico'],
    [7, 18, 'sucesso'],
    [6, 17, 'falha'],
    [2, 13, 'falha'],
  ];

  it.each(FAIXAS)('face %i (total %i) contra CD 18 é %s', (face, total, grau) => {
    const avaliacao = avaliarRolagemPathfinder2e(rolarComD20('1d20+11', face), 18);
    expect(avaliacao.grau).toBe(grau);
    expect(avaliacao.cd).toBe(18);
    expect(avaliacao.d20Natural).toBe(face);
    // Nenhuma dessas faces é 20 nem 1: a regra do dado natural não se aplica.
    expect(avaliacao.efeitoNatural).toBeNull();
    expect(rolarComD20('1d20+11', face).total).toBe(total);
  });

  it('o cenário do card: 1d20+11 com o d20 em 17 é sucesso crítico contra CD 18', () => {
    const avaliacao = avaliarRolagemPathfinder2e(rolarComD20('1d20+11', 17), 18);
    expect(avaliacao).toEqual({
      cd: 18,
      grau: 'sucesso-critico',
      d20Natural: 17,
      efeitoNatural: null,
    });
  });
});

describe('avaliarRolagemPathfinder2e — 20/1 natural desloca um grau, e não garante nada', () => {
  it('20 natural contra CD 40 sobe de falha crítica para falha, e para aí', () => {
    // O cenário de aceite do card: `1d20+2 cd 40` com o d20 em 20 → total 22.
    const avaliacao = avaliarRolagemPathfinder2e(rolarComD20('1d20+2', 20), 40);
    expect(avaliacao.grau).toBe('falha');
    expect(avaliacao.efeitoNatural).toBe('melhorou');
    expect(avaliacao.d20Natural).toBe(20);
  });

  it('1 natural com bônus enorme desce de sucesso crítico para sucesso', () => {
    const avaliacao = avaliarRolagemPathfinder2e(rolarComD20('1d20+30', 1), 10);
    expect(avaliacao.grau).toBe('sucesso');
    expect(avaliacao.efeitoNatural).toBe('piorou');
  });

  it('20 natural que já era sucesso crítico não "melhora": o efeito é sem-efeito', () => {
    // Sem este valor a tela diria "o 20 natural melhorou um grau" numa rolagem
    // em que nada melhorou — mentira pequena e verificável.
    const avaliacao = avaliarRolagemPathfinder2e(rolarComD20('1d20+11', 20), 18);
    expect(avaliacao.grau).toBe('sucesso-critico');
    expect(avaliacao.efeitoNatural).toBe('sem-efeito');
  });

  it('1 natural que já era falha crítica também é sem-efeito', () => {
    const avaliacao = avaliarRolagemPathfinder2e(rolarComD20('1d20+0', 1), 40);
    expect(avaliacao.grau).toBe('falha-critica');
    expect(avaliacao.efeitoNatural).toBe('sem-efeito');
  });
});

describe('avaliarRolagemPathfinder2e — d20 ambíguo não recebe ajuste', () => {
  it('1d20+1d6 avalia o total, mas sem dado natural e sem efeito', () => {
    // `d20NaturalDe` devolve `null` aqui de propósito (RV-151): com dois termos
    // de dados não há resposta segura para "qual foi o d20?", e chutar produziria
    // um crítico fantasma.
    const resultado = rolarComD20('1d20+1d6', 20);
    const avaliacao = avaliarRolagemPathfinder2e(resultado, 18);
    expect(avaliacao.d20Natural).toBeNull();
    expect(avaliacao.efeitoNatural).toBeNull();
    // O grau continua saindo da comparação com a CD — perde-se o ajuste, não a
    // avaliação. E é justamente aqui que o número prova o ponto: o total 26
    // contra CD 18 é **sucesso**; se o d20 tivesse sido adivinhado como 20, o
    // ajuste teria produzido "sucesso crítico" — o crítico fantasma que a regra
    // estreita do RV-151 existe para não inventar.
    expect(resultado.total).toBe(26);
    expect(avaliacao.grau).toBe('sucesso');
  });

  it('3d6 contra uma CD avalia sem ajuste nenhum', () => {
    const avaliacao = avaliarRolagemPathfinder2e(rolarComD20('3d6', 6), 10);
    expect(avaliacao.d20Natural).toBeNull();
    expect(avaliacao.efeitoNatural).toBeNull();
  });

  it('2d20kh1 usa o dado mantido, e o descartado não conta', () => {
    // Total 25 contra CD 18 é sucesso; o 20 natural sobe para sucesso crítico.
    const avaliacao = avaliarRolagemPathfinder2e(rolarComD20('2d20kh1+5', 20), 18);
    expect(avaliacao.d20Natural).toBe(20);
    expect(avaliacao.grau).toBe('sucesso-critico');
    expect(avaliacao.efeitoNatural).toBe('melhorou');
  });
});

describe('o registro pluga a avaliação no sistema, e só nele', () => {
  it('pathfinder2e avalia; os demais sistemas declaram null', () => {
    // O que faz o caso de uso funcionar sem `switch (sistema)`.
    expect(definicaoDoSistema('pathfinder2e').avaliarRolagem).toBe(avaliarRolagemPathfinder2e);
    for (const sistema of ['dnd5e', 'tormenta20', 'ordem-paranormal', 'generico'] as const) {
      expect(definicaoDoSistema(sistema).avaliarRolagem).toBeNull();
    }
  });

  it('a avaliação do registro é a mesma função, com o mesmo resultado', () => {
    const avaliar = definicaoDoSistema('pathfinder2e').avaliarRolagem;
    expect(avaliar).not.toBeNull();
    if (!avaliar) return;
    expect(avaliar(rolarComD20('1d20+11', 17), 18).grau).toBe('sucesso-critico');
  });
});
