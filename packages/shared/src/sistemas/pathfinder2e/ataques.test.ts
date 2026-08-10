import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validarExpressao } from '../../dados/motor-dados';
import { ataquesDoPersonagem, modeloDeAtaques, type PersonagemCalculavel } from '../calculo';
import { atributosIniciais, dadosIniciaisDaFicha, validarDadosDaFicha } from '../registro';
import type { DadosFicha, ModeloDeAtaques } from '../tipos';
import {
  acrescentarAtaque,
  ataquesDe,
  BONUS_ACERTO_MAXIMO,
  BONUS_ACERTO_MINIMO,
  CAMPOS_DO_ATAQUE,
  CAMPO_AGIL,
  CAMPO_BONUS_ACERTO,
  CAMPO_DANO,
  CAMPO_NOME,
  chaveDeAtaque,
  chaveDoAcerto,
  CHAVE_ATAQUES,
  CHAVE_DANO,
  CHAVE_DANO_DOBRADO,
  definirCampoDoAtaque,
  indiceDaChave,
  LIMITE_ATAQUES,
  montarAtaques,
  removerAtaque,
  TAMANHO_MAXIMO_NOME,
} from './ataques';
import { ORDENS_DE_ATAQUE, penalidadeAtaquesMultiplos } from './regras';

/**
 * Ataques de Pathfinder 2e com a penalidade de ataques múltiplos (RV-156).
 *
 * **Todo número esperado está escrito à mão**, como o jogador o somaria na mesa: um
 * teste que refaz a conta do código concorda com o bug. E o bug que este card mais
 * arrisca é o degrau errado — −5 no terceiro ataque, ou −5 numa arma ágil — que dá
 * um número perfeitamente plausível.
 *
 * A tabela do MAP mora em `regras.ts` (é o Escopo do card) e é testada **aqui**, e
 * não em `regras.test.ts`, para que a regra e as suas consequências fiquem no mesmo
 * arquivo: quem mexer na tabela vê no mesmo lugar o que ela produz na ficha.
 *
 * A cobertura genérica — schema estrito, ficha inicial válida, campos declarados
 * existindo — vem de `registro.test.ts`, que percorre `SISTEMAS_RPG` sem citar
 * sistema nenhum.
 */

const DADO = '1d20';

function fichaInicial(): DadosFicha {
  return dadosIniciaisDaFicha('pathfinder2e');
}

/** Um ataque gravado como a ficha o guarda. */
function ataque(nome: string, bonusAcerto: number | null, dano = '', agil = false) {
  return {
    [CAMPO_NOME]: nome,
    [CAMPO_BONUS_ACERTO]: bonusAcerto,
    [CAMPO_DANO]: dano,
    [CAMPO_AGIL]: agil,
  };
}

function comAtaques(...lista: ReturnType<typeof ataque>[]): DadosFicha {
  return { ...fichaInicial(), [CHAVE_ATAQUES]: lista };
}

/** A ficha calculável de uma personagem de PF2e com aqueles ataques. */
function personagem(dados: DadosFicha): PersonagemCalculavel {
  return {
    sistema: 'pathfinder2e',
    nivel: 3,
    atributos: atributosIniciais('pathfinder2e'),
    dados,
  };
}

function modelo(): ModeloDeAtaques {
  const encontrado = modeloDeAtaques('pathfinder2e');
  expect(encontrado, 'o PF2e deixou de declarar modelo de ataques').not.toBeNull();
  return encontrado as ModeloDeAtaques;
}

function expressoesDeAcerto(dados: DadosFicha, indice = 0): (string | null)[] {
  const ataques = montarAtaques(dados, DADO);
  const alvo = ataques[indice];
  expect(alvo, `não há ataque na posição ${indice}`).toBeDefined();
  return (alvo?.acertos ?? []).map((rolagem) => rolagem.expressao);
}

// ─────────────────────────────────────────────────────────────────────
// A tabela pura
// ─────────────────────────────────────────────────────────────────────

describe('penalidadeAtaquesMultiplos — a tabela, com todo valor escrito à mão', () => {
  it.each([
    [1, false, 0],
    [2, false, -5],
    [3, false, -10],
    [1, true, 0],
    [2, true, -4],
    [3, true, -8],
  ] as const)('ordem %i, ágil %s → %i', (ordem, agil, esperado) => {
    expect(penalidadeAtaquesMultiplos(ordem, agil)).toBe(esperado);
  });

  it('o segundo ataque não tem a penalidade do terceiro — e a ágil não é "um a menos"', () => {
    // As duas asserções que um `if` mal escrito passa: derivar o terceiro do segundo
    // (−5 → −10 é o dobro, mas −4 → −8 também) ou tratar "ágil" como redução fixa de
    // 1 (verdade no segundo, falso no terceiro, onde a diferença é 2).
    expect(penalidadeAtaquesMultiplos(2, false)).not.toBe(penalidadeAtaquesMultiplos(3, false));
    expect(
      (penalidadeAtaquesMultiplos(2, false) ?? 0) - (penalidadeAtaquesMultiplos(2, true) ?? 0),
    ).toBe(-1);
    expect(
      (penalidadeAtaquesMultiplos(3, false) ?? 0) - (penalidadeAtaquesMultiplos(3, true) ?? 0),
    ).toBe(-2);
  });

  it.each([0, 4, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'ordem %s devolve null em vez de extrapolar a regra',
    (ordem) => {
      expect(penalidadeAtaquesMultiplos(ordem, false)).toBeNull();
      expect(penalidadeAtaquesMultiplos(ordem, true)).toBeNull();
    },
  );

  it('as ordens declaradas são exatamente três, e o terceiro degrau é "ou mais"', () => {
    // Uma quarta entrada aqui sugeriria que o 4º ataque tem penalidade própria. Ele
    // não tem: usa a do terceiro, e é por isso que o rótulo diz "ou mais".
    expect([...ORDENS_DE_ATAQUE]).toEqual([1, 2, 3]);
    expect(montarAtaques(comAtaques(ataque('Espada longa', 9)), DADO)[0]?.acertos).toHaveLength(3);
    expect(montarAtaques(comAtaques(ataque('Espada longa', 9)), DADO)[0]?.acertos[2]?.rotulo).toBe(
      '3º ataque ou mais (-10)',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// As três expressões de acerto
// ─────────────────────────────────────────────────────────────────────

describe('as três rolagens de acerto (cenários do card)', () => {
  it('"Espada longa" com +9 e sem ágil produz 1d20+9, 1d20+4 e 1d20-1', () => {
    expect(expressoesDeAcerto(comAtaques(ataque('Espada longa', 9)))).toEqual([
      '1d20+9',
      '1d20+4',
      '1d20-1',
    ]);
  });

  it('"Adaga" com +9 e ágil produz 1d20+9, 1d20+5 e 1d20+1', () => {
    expect(expressoesDeAcerto(comAtaques(ataque('Adaga', 9, '1d4+4', true)))).toEqual([
      '1d20+9',
      '1d20+5',
      '1d20+1',
    ]);
  });

  it('a penalidade é da arma daquele ataque, não da anterior', () => {
    // O cenário do card: o primeiro golpe foi com a espada; ao escolher "2º ataque"
    // na adaga ágil, a penalidade é −4, e não −5. Como não há contador, isto é
    // consequência de a penalidade ser calculada pela arma da chamada — as duas
    // convivem na mesma ficha com penalidades diferentes na mesma ordem.
    const dados = comAtaques(ataque('Espada longa', 9), ataque('Adaga', 9, '1d4+4', true));
    expect(expressoesDeAcerto(dados, 0)[1]).toBe('1d20+4');
    expect(expressoesDeAcerto(dados, 1)[1]).toBe('1d20+5');
  });

  it('bônus negativo depois da penalidade continua saindo com o sinal certo', () => {
    // +2 no terceiro golpe de uma arma comum é −8. Um `formatarBonus` esquecido aqui
    // produziria "1d20+-8", que o motor de dados recusa.
    expect(expressoesDeAcerto(comAtaques(ataque('Manopla', 2)))).toEqual([
      '1d20+2',
      '1d20-3',
      '1d20-8',
    ]);
    for (const expressao of expressoesDeAcerto(comAtaques(ataque('Manopla', 2)))) {
      expect(validarExpressao(expressao ?? '').ok, `expressão inválida: ${expressao}`).toBe(true);
    }
  });

  it('o rótulo diz a ordem e a penalidade, e o primeiro não finge ter penalidade', () => {
    const rotulos = (
      montarAtaques(comAtaques(ataque('Espada longa', 9)), DADO)[0]?.acertos ?? []
    ).map((rolagem) => rolagem.rotulo);
    expect(rotulos).toEqual(['1º ataque', '2º ataque (-5)', '3º ataque ou mais (-10)']);
  });

  it('o detalhe explica a conta em texto, e nomeia a arma ágil', () => {
    const comum = montarAtaques(comAtaques(ataque('Espada longa', 9)), DADO)[0];
    expect(comum?.acertos[0]?.detalhe).toBe(
      '+9 informado. Primeiro ataque do turno: sem penalidade.',
    );
    expect(comum?.acertos[1]?.detalhe).toBe('+9 informado, penalidade -5 do 2º ataque = +4.');

    const agil = montarAtaques(comAtaques(ataque('Adaga', 9, '1d4+4', true)), DADO)[0];
    expect(agil?.acertos[1]?.detalhe).toContain('-4 (arma ágil)');
  });

  it('o dado do teste vem de fora: nenhum "1d20" está escrito no módulo de ataques', () => {
    // A mesma disciplina de `montarDefesas` receber o modificador: o módulo não pode
    // supor o dado do sistema. Trocá-lo troca as três expressões.
    expect(expressoesDeAcerto(comAtaques(ataque('Espada longa', 9)))[0]).toBe('1d20+9');
    expect(
      montarAtaques(comAtaques(ataque('Espada longa', 9)), '1d12')[0]?.acertos[1]?.expressao,
    ).toBe('1d12+4');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Dano: duas rolagens, nunca uma — e nunca com grau
// ─────────────────────────────────────────────────────────────────────

describe('as rolagens de dano', () => {
  it('acerto e dano são rolagens separadas, cada uma com o nome do ataque no chat', () => {
    const [ataqueCalculado] = ataquesDoPersonagem(
      personagem(comAtaques(ataque('Espada longa', 9, '1d8+4'))),
      'Seelah',
    );

    expect(ataqueCalculado?.acertos).toHaveLength(3);
    expect(ataqueCalculado?.danos).toHaveLength(2);
    expect(ataqueCalculado?.acertos[1]?.motivo).toBe('Espada longa (2º ataque (-5)) — Seelah');
    expect(ataqueCalculado?.danos[0]?.motivo).toBe('Dano de Espada longa — Seelah');
    // Nenhuma expressão de acerto carrega o dano, e nenhuma de dano carrega o d20:
    // juntá-las daria um total que não é nem um nem outro.
    expect(ataqueCalculado?.acertos[0]?.expressao).toBe('1d20+9');
    expect(ataqueCalculado?.danos[0]?.expressao).toBe('1d8+4');
  });

  it('o dano diz em texto que não tem grau de sucesso', () => {
    const [alvo] = montarAtaques(comAtaques(ataque('Espada longa', 9, '1d8+4')), DADO);
    for (const rolagem of alvo?.danos ?? []) {
      expect(rolagem.detalhe, rolagem.chave).toContain('não é checado contra CD');
    }
    // E o acerto **não** diz isso: ele é uma checagem, e com a CA do alvo informada
    // o chat anuncia o grau (RV-154).
    expect(alvo?.acertos[0]?.detalhe).not.toContain('não é checado');
  });

  it('a variante dobrada é a expressão somada a si mesma, e diz qual leitura da regra usou', () => {
    const [alvo] = montarAtaques(comAtaques(ataque('Espada longa', 9, '1d8+4')), DADO);
    const dobrado = alvo?.danos[1];

    expect(dobrado?.chave).toBe(CHAVE_DANO_DOBRADO);
    expect(dobrado?.expressao).toBe('1d8+4+1d8+4');
    expect(validarExpressao(dobrado?.expressao ?? '').ok).toBe(true);
    // A escolha vai escrita: os dados duas vezes e os modificadores dobrados é a
    // variante que a regra permite; o padrão do livro é dobrar o total, que o motor
    // de dados não sabe fazer. Sem esta frase a mesa não saberia qual foi usada.
    expect(dobrado?.rotulo).toBe('Dano dobrado (crítico)');
    expect(dobrado?.detalhe).toContain('os dados duas vezes e os modificadores dobrados');
    expect(dobrado?.detalhe).toContain('dobrar o total');
  });

  it('dano de um dado só e dano com subtração dobram sem produzir expressão inválida', () => {
    for (const dano of ['1d6', '2d6+3', '1d8-1', '1d4+1d6+2', '7']) {
      const [alvo] = montarAtaques(comAtaques(ataque('Golpe', 5, dano)), DADO);
      expect(alvo?.danos[0]?.expressao, dano).toBe(dano);
      expect(alvo?.danos[1]?.expressao, dano).toBe(`${dano}+${dano}`);
      expect(validarExpressao(alvo?.danos[1]?.expressao ?? '').ok, dano).toBe(true);
    }
  });

  it('expressão de dano que não caberia dobrada desabilita só a variante, com o motivo', () => {
    // Onze termos passam no motor; dobrados são vinte e dois, acima do teto de vinte.
    // O dano normal continua rolável — desabilitar os dois seria punir o jogador por
    // um limite que só a variante encosta.
    const dano = '1d4+1+1+1+1+1+1+1+1+1+1';
    expect(validarExpressao(dano).ok).toBe(true);
    const [alvo] = montarAtaques(comAtaques(ataque('Golpe estranho', 5, dano)), DADO);

    expect(alvo?.danos[0]?.expressao).toBe(dano);
    expect(alvo?.danos[1]?.expressao).toBeNull();
    expect(alvo?.danos[1]?.detalhe).toContain('não é aceita pelo motor de dados');
  });
});

// ─────────────────────────────────────────────────────────────────────
// Bordas do card
// ─────────────────────────────────────────────────────────────────────

describe('bordas: o que falta é dito, não escondido', () => {
  it('ataque sem bônus informado não tem expressão de acerto, e diz o que falta', () => {
    const [alvo] = montarAtaques(comAtaques(ataque('Espada longa', null, '1d8+4')), DADO);

    for (const acerto of alvo?.acertos ?? []) {
      expect(acerto.expressao, acerto.chave).toBeNull();
      expect(acerto.detalhe, acerto.chave).toContain('Informe o bônus de acerto');
    }
    // O dano continua rolável: são coisas independentes.
    expect(alvo?.danos[0]?.expressao).toBe('1d8+4');
  });

  it('ataque sem dano informado não tem expressão de dano, e diz o que falta', () => {
    const [alvo] = montarAtaques(comAtaques(ataque('Espada longa', 9)), DADO);

    for (const dano of alvo?.danos ?? []) {
      expect(dano.expressao, dano.chave).toBeNull();
      expect(dano.detalhe, dano.chave).toContain('Informe a expressão de dano');
    }
    expect(alvo?.acertos[0]?.expressao).toBe('1d20+9');
  });

  it('rolagem sem expressão não ganha motivo — nada a publicar, nada a nomear', () => {
    const [alvo] = ataquesDoPersonagem(
      personagem(comAtaques(ataque('Espada longa', null))),
      'Seelah',
    );
    for (const rolagem of [...(alvo?.acertos ?? []), ...(alvo?.danos ?? [])]) {
      expect(rolagem.motivo, rolagem.chave).toBeNull();
    }
  });

  it('bônus +0 é informado, e é diferente de não informado', () => {
    // A distinção que um `if (!bonusAcerto)` apagaria: zero é um bônus legítimo.
    const [alvo] = montarAtaques(comAtaques(ataque('Desarmado', 0)), DADO);
    expect(alvo?.acertos[0]?.expressao).toBe('1d20+0');
    expect(alvo?.acertos[1]?.expressao).toBe('1d20-5');
  });

  it('ficha sem a chave de ataques — toda ficha de PF2e criada antes deste card — devolve lista vazia', () => {
    const antiga: DadosFicha = {
      ancestralidade: 'Humana',
      heranca: 'Versátil',
      antecedente: 'Guarda',
      treinamentos: {},
      saberes: [],
    };
    expect(ataquesDe(antiga)).toEqual([]);
    expect(montarAtaques(antiga, DADO)).toEqual([]);
    // E ela continua válida para o sistema: o schema aplica `[]`.
    const validada = validarDadosDaFicha('pathfinder2e', antiga);
    expect(validada.ok).toBe(true);
    expect(validada.ok && validada.dados[CHAVE_ATAQUES]).toEqual([]);
  });

  it('linha estragada na lista é descartada na leitura, sem derrubar a ficha', () => {
    const dados: DadosFicha = {
      ...fichaInicial(),
      [CHAVE_ATAQUES]: [
        null,
        'Espada',
        { [CAMPO_NOME]: '   ' },
        {
          [CAMPO_NOME]: 'Adaga',
          [CAMPO_BONUS_ACERTO]: 'muito',
          [CAMPO_DANO]: 7,
          [CAMPO_AGIL]: 'sim',
        },
      ],
    };

    expect(ataquesDe(dados)).toEqual([ataque('Adaga', null, '', false)]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Edição da lista — pura
// ─────────────────────────────────────────────────────────────────────

describe('acrescentar, remover e editar — sempre puro', () => {
  it('acrescenta um ataque em branco com o nome informado, sem mutar a entrada', () => {
    const antes = fichaInicial();
    const depois = acrescentarAtaque(antes, '  Espada longa  ');

    expect(antes[CHAVE_ATAQUES]).toEqual([]);
    expect(ataquesDe(depois)).toEqual([ataque('Espada longa', null, '', false)]);
    // O resultado tem de sobreviver ao schema do sistema, senão a tela cria um
    // estado que a API recusa.
    expect(validarDadosDaFicha('pathfinder2e', depois).ok).toBe(true);
  });

  it('nome vazio, longo demais ou lista cheia devolvem `dados` inalterado', () => {
    const base = fichaInicial();
    expect(acrescentarAtaque(base, '   ')).toBe(base);
    expect(acrescentarAtaque(base, 'x'.repeat(TAMANHO_MAXIMO_NOME + 1))).toBe(base);

    let cheia = base;
    for (let i = 0; i < LIMITE_ATAQUES; i += 1) cheia = acrescentarAtaque(cheia, `Golpe ${i}`);
    expect(ataquesDe(cheia)).toHaveLength(LIMITE_ATAQUES);
    expect(acrescentarAtaque(cheia, 'Um a mais')).toBe(cheia);
    // O teto também é cobrado pelo schema, que é a defesa de verdade.
    const acima = { ...cheia, [CHAVE_ATAQUES]: [...ataquesDe(cheia), ataque('Um a mais', 1)] };
    const r = validarDadosDaFicha('pathfinder2e', acima);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toContain(`o máximo é ${LIMITE_ATAQUES}`);
  });

  it('remove pela chave posicional e preserva os vizinhos', () => {
    const dados = comAtaques(ataque('A', 1), ataque('B', 2), ataque('C', 3));
    const depois = removerAtaque(dados, chaveDeAtaque(1));

    expect(ataquesDe(depois).map((a) => a[CAMPO_NOME])).toEqual(['A', 'C']);
    expect(removerAtaque(dados, 'ataque:9')).toBe(dados);
    expect(removerAtaque(dados, 'saber:Guerra')).toBe(dados);
    expect(removerAtaque(dados, 'ataque:abc')).toBe(dados);
  });

  it('a chave é posicional, e ida e volta são consistentes', () => {
    // Ela é posicional para que o nome possa mudar a cada tecla sem remontar a linha
    // — o que faria o campo perder o foco no meio da palavra.
    expect(chaveDeAtaque(2)).toBe('ataque:2');
    expect(indiceDaChave('ataque:2')).toBe(2);
    expect(indiceDaChave('ataque:-1')).toBeNull();
    expect(indiceDaChave('ataque:1.5')).toBeNull();
    expect(indiceDaChave('acerto:1')).toBeNull();
  });

  it('dois ataques de nome igual convivem, com bônus diferentes', () => {
    const dados = comAtaques(ataque('Adaga', 9, '1d4+4', true), ataque('Adaga', 4, '1d4+2', true));
    expect(expressoesDeAcerto(dados, 0)[0]).toBe('1d20+9');
    expect(expressoesDeAcerto(dados, 1)[0]).toBe('1d20+4');
    expect(montarAtaques(dados, DADO).map((a) => a.chave)).toEqual(['ataque:0', 'ataque:1']);
  });

  it('definirCampo troca um campo só, sem mutar e sem tocar nos outros ataques', () => {
    const dados = comAtaques(ataque('Espada longa', 9), ataque('Adaga', 4));
    const depois = definirCampoDoAtaque(dados, chaveDeAtaque(0), CAMPO_AGIL, true);

    expect(ataquesDe(depois)[0]?.[CAMPO_AGIL]).toBe(true);
    expect(ataquesDe(depois)[1]).toEqual(ataque('Adaga', 4, '', false));
    expect(ataquesDe(dados)[0]?.[CAMPO_AGIL]).toBe(false);
    // Tornar a arma ágil muda a penalidade na hora — é por isso que ela não é
    // gravada junto do bônus.
    expect(expressoesDeAcerto(depois, 0)).toEqual(['1d20+9', '1d20+5', '1d20+1']);
  });

  it("campo esvaziado na interface atravessa como `''` e o schema o traduz em ausência", () => {
    const dados = definirCampoDoAtaque(
      comAtaques(ataque('Espada longa', 9)),
      chaveDeAtaque(0),
      CAMPO_BONUS_ACERTO,
      '',
    );

    const r = validarDadosDaFicha('pathfinder2e', dados);
    expect(r.ok).toBe(true);
    expect(r.ok && ataquesDe(r.dados)[0]?.[CAMPO_BONUS_ACERTO]).toBeNull();
  });

  it('chave de ataque ou de campo desconhecidas não mudam nada', () => {
    const dados = comAtaques(ataque('Espada longa', 9));
    expect(definirCampoDoAtaque(dados, 'ataque:7', CAMPO_NOME, 'X')).toBe(dados);
    expect(definirCampoDoAtaque(dados, chaveDeAtaque(0), 'penalidade', -5)).toBe(dados);
    expect(definirCampoDoAtaque(dados, 'nada', CAMPO_NOME, 'X')).toBe(dados);
  });
});

// ─────────────────────────────────────────────────────────────────────
// O schema: o que é gravado, e o que nunca é
// ─────────────────────────────────────────────────────────────────────

describe('schema dos ataques', () => {
  it('a ficha nova nasce sem ataque nenhum', () => {
    expect(fichaInicial()[CHAVE_ATAQUES]).toEqual([]);
  });

  it('nenhum número derivado é gravável: a penalidade e o bônus já penalizado são recusados', () => {
    // É o ponto do card: gravar `-5` congelaria a penalidade de um ataque que amanhã
    // vira ágil, e gravar o bônus penalizado daria duas verdades para o mesmo número.
    for (const chave of ['penalidade', 'acerto2', 'bonusComPenalidade', 'ordem']) {
      const r = validarDadosDaFicha('pathfinder2e', {
        ...fichaInicial(),
        [CHAVE_ATAQUES]: [{ ...ataque('Espada longa', 9, '1d8+4'), [chave]: -5 }],
      });
      expect(r.ok, chave).toBe(false);
      expect(!r.ok && r.erro, chave).toContain(chave);
    }
  });

  it('a expressão de dano é validada pelo motor de dados, com o erro dele na mensagem', () => {
    const r = validarDadosDaFicha('pathfinder2e', {
      ...fichaInicial(),
      [CHAVE_ATAQUES]: [ataque('Espada longa', 9, '1d8++4')],
    });

    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toContain('Dano: expressão inválida');
    // Sem o erro do motor, "expressão inválida" não diz o que consertar.
    expect(!r.ok && r.erro).toContain('sem termo antes');
  });

  it('dano vazio é aceito — é o estado de um ataque recém-criado', () => {
    const r = validarDadosDaFicha('pathfinder2e', {
      ...fichaInicial(),
      [CHAVE_ATAQUES]: [ataque('Espada longa', 9, '')],
    });
    expect(r.ok).toBe(true);
  });

  it.each([
    [CAMPO_NOME, '', 'informe o nome'],
    [CAMPO_NOME, 'x'.repeat(TAMANHO_MAXIMO_NOME + 1), 'máximo do nome'],
    [CAMPO_BONUS_ACERTO, BONUS_ACERTO_MINIMO - 1, `o mínimo é ${BONUS_ACERTO_MINIMO}`],
    [CAMPO_BONUS_ACERTO, BONUS_ACERTO_MAXIMO + 1, `o máximo é ${BONUS_ACERTO_MAXIMO}`],
    [CAMPO_BONUS_ACERTO, 1.5, 'número inteiro'],
    [CAMPO_DANO, 'x'.repeat(70), 'máximo é'],
    [CAMPO_AGIL, 'sim', 'informe sim ou não'],
  ] as const)('%s = %s é recusado em PT-BR', (campo, valor, trecho) => {
    const r = validarDadosDaFicha('pathfinder2e', {
      ...fichaInicial(),
      [CHAVE_ATAQUES]: [{ ...ataque('Espada longa', 9, '1d8+4'), [campo]: valor }],
    });

    expect(r.ok).toBe(false);
    expect((!r.ok && r.erro.toLocaleLowerCase('pt-BR')) || '').toContain(
      trecho.toLocaleLowerCase('pt-BR'),
    );
  });

  it('as duas pontas da faixa do bônus passam', () => {
    for (const valor of [BONUS_ACERTO_MINIMO, BONUS_ACERTO_MAXIMO]) {
      const r = validarDadosDaFicha('pathfinder2e', {
        ...fichaInicial(),
        [CHAVE_ATAQUES]: [ataque('Espada longa', valor, '1d8+4')],
      });
      expect(r.ok, String(valor)).toBe(true);
    }
  });

  it('todo campo declarado existe no ataque que `acrescentar` cria, e é o conjunto exato', () => {
    // Se um campo declarado não existir no objeto criado, a interface renderiza um
    // controle sem valor; se existir um campo gravado sem declaração, ele fica
    // ineditável e invisível.
    const criado = ataquesDe(acrescentarAtaque(fichaInicial(), 'Espada longa'))[0];
    expect(new Set(Object.keys(criado ?? {}))).toEqual(
      new Set(CAMPOS_DO_ATAQUE.map((campo) => campo.chave)),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// O modelo, como o registro o entrega
// ─────────────────────────────────────────────────────────────────────

describe('o modelo de ataques no registro', () => {
  it('só o PF2e declara modelo de ataques; os outros quatro declaram `null`', () => {
    expect(modeloDeAtaques('pathfinder2e')).not.toBeNull();
    for (const sistema of ['dnd5e', 'tormenta20', 'ordem-paranormal', 'generico'] as const) {
      expect(modeloDeAtaques(sistema), sistema).toBeNull();
      // E `ataquesDoPersonagem` responde `[]` em vez de explodir: ausência é
      // resposta, não erro.
      expect(
        ataquesDoPersonagem(
          {
            sistema,
            nivel: 3,
            atributos: atributosIniciais(sistema),
            dados: dadosIniciaisDaFicha(sistema),
          },
          'Thorin',
        ),
      ).toEqual([]);
    }
  });

  it('todo texto que a seção mostra vem do modelo, e a ordem é dita como escolha do jogador', () => {
    const m = modelo();
    expect(m.rotulo.trim().length).toBeGreaterThan(0);
    expect(m.rotuloNovo.trim().length).toBeGreaterThan(0);
    expect(m.rotuloCdAlvo).toBe('CA do alvo');
    expect(m.ajudaCdAlvo).toContain('não é gravada');
    // O DoD do card: em lugar nenhum se diz que a contagem é automática, e a frase
    // afirma que quem escolhe é o jogador (F6 — a interface não promete o que o
    // backend não faz, e aqui o backend não conta nada).
    expect(m.ajuda).toContain('Você escolhe');
    expect(m.ajuda).toContain('não conta os seus ataques');
    expect(m.ajuda.toLocaleLowerCase('pt-BR')).not.toContain('automátic');
    expect(m.limite).toBe(LIMITE_ATAQUES);
  });

  it('a chave de cada variante é estável e única dentro do ataque', () => {
    const [alvo] = montarAtaques(comAtaques(ataque('Espada longa', 9, '1d8+4')), DADO);
    expect((alvo?.acertos ?? []).map((r) => r.chave)).toEqual([
      chaveDoAcerto(1),
      chaveDoAcerto(2),
      chaveDoAcerto(3),
    ]);
    expect((alvo?.danos ?? []).map((r) => r.chave)).toEqual([CHAVE_DANO, CHAVE_DANO_DOBRADO]);
  });

  it('`valores` traz o que está gravado, para a interface editar sem saber onde mora', () => {
    const [alvo] = montarAtaques(comAtaques(ataque('Adaga', 4, '1d4+2', true)), DADO);
    expect(alvo?.valores).toEqual(ataque('Adaga', 4, '1d4+2', true));
    // Cópia, e não a linha gravada: mexer nela não pode alterar a ficha.
    expect(alvo?.valores).not.toBe(ataquesDe(comAtaques(ataque('Adaga', 4, '1d4+2', true)))[0]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Guarda: nenhum contador de MAP no servidor
// ─────────────────────────────────────────────────────────────────────

/**
 * A guarda do DoD "nenhum contador de MAP no servidor, em memória ou no banco".
 *
 * Ela é uma **varredura em disco**, e não uma promessa em comentário: a api não
 * pode nem conhecer o vocabulário de ataques deste épico, porque a única coisa que
 * ela recebe é `POST /mesas/:id/rolagens` com uma expressão pronta. No dia em que
 * alguém quiser contar ataques no servidor, é este arquivo que fica vermelho, e a
 * mensagem diz por quê.
 *
 * O que ela **não** prova: que não existe contador em outro lugar (o navegador, por
 * exemplo). A ordem é escolha do jogador, então não há estado a guardar em lado
 * nenhum — e a ausência do lado do cliente é verificada pelos testes de front, que
 * conferem que dois cliques no mesmo botão produzem a mesma expressão.
 */
describe('guarda: o MAP não é estado do servidor (DoD do RV-156)', () => {
  /** Sobe do arquivo até achar a raiz do monorepo — falha alto se não achar. */
  function raizDoRepositorio(): string {
    let diretorio = resolve(fileURLToPath(import.meta.url), '..');
    for (let passo = 0; passo < 8; passo += 1) {
      if (existsSync(join(diretorio, 'apps', 'api', 'src'))) return diretorio;
      diretorio = resolve(diretorio, '..');
    }
    throw new Error(
      'não achei `apps/api/src` subindo a partir deste teste: a varredura ficaria vazia e a ' +
        'guarda passaria sem verificar nada.',
    );
  }

  function arquivosDe(diretorio: string, extensoes: readonly string[]): string[] {
    return readdirSync(diretorio).flatMap((nome) => {
      const caminho = join(diretorio, nome);
      if (statSync(caminho).isDirectory()) return arquivosDe(caminho, extensoes);
      return extensoes.some((extensao) => nome.endsWith(extensao)) ? [caminho] : [];
    });
  }

  /**
   * O vocabulário deste card. Nenhum destes nomes tem motivo para aparecer na api:
   * ela não sabe o que é um ataque, uma ordem de golpe ou uma penalidade.
   */
  const VOCABULARIO_DE_ATAQUE = [
    'penalidadeAtaquesMultiplos',
    'ORDENS_DE_ATAQUE',
    'ataquesDoPersonagem',
    'montarAtaques',
    'modeloDeAtaques',
    'CHAVE_ATAQUES',
  ] as const;

  it('nenhum arquivo de `apps/api/src` conhece o vocabulário de ataques', () => {
    const raiz = raizDoRepositorio();
    const arquivos = arquivosDe(join(raiz, 'apps', 'api', 'src'), ['.ts']);
    expect(arquivos.length, 'a varredura não encontrou fonte nenhuma na api').toBeGreaterThan(10);

    const culpados = arquivos.flatMap((caminho) => {
      const conteudo = readFileSync(caminho, 'utf8');
      const achados = VOCABULARIO_DE_ATAQUE.filter((termo) => conteudo.includes(termo));
      return achados.length === 0
        ? []
        : [`${caminho.slice(raiz.length + 1)} → ${achados.join(', ')}`];
    });

    expect(
      culpados,
      'a api passou a conhecer o MAP. Ela não deve: saber de quem é o turno (RV-062, entregue) ' +
        'não é saber quais ataques contam — reação fora do turno é isenta, Golpe Duplo gasta duas ' +
        'entradas — e um contador que mente é pior que nenhum. O contador é o RV-162, com a regra ' +
        'escrita antes do código. Arquivos:\n' +
        culpados.join('\n'),
    ).toEqual([]);
  });

  it('nenhuma migration cria coluna de ataque ou de contador de penalidade', () => {
    const raiz = raizDoRepositorio();
    const migrations = join(raiz, 'apps', 'api', 'supabase', 'migrations');
    const arquivos = arquivosDe(migrations, ['.sql']);
    expect(arquivos.length, 'nenhuma migration encontrada em disco').toBeGreaterThan(0);

    const culpados = arquivos.filter((caminho) =>
      /ataque|penalidade|ordem_de_golpe/i.test(readFileSync(caminho, 'utf8')),
    );

    expect(
      culpados.map((caminho) => caminho.slice(raiz.length + 1)),
      'uma migration passou a falar de ataque. O MAP não é estado persistido: a ordem do golpe é ' +
        'escolha do jogador no momento da rolagem, e não há nada a gravar.',
    ).toEqual([]);
  });
});
