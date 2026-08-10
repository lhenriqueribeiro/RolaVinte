import { describe, expect, it } from 'vitest';
import { validarExpressao } from '../dados/motor-dados';
import { SISTEMAS_RPG, type SistemaRpg } from '../schemas/mesas';
import {
  CHAVE_INICIATIVA,
  chaveDeIniciativaPor,
  ehChaveDeIniciativa,
  iniciativaEscolhida,
  opcoesDeIniciativa,
  ROTULO_INICIATIVA,
  rotuloDeIniciativa,
} from './iniciativa';
import {
  atributosIniciais,
  dadosIniciaisDaFicha,
  definicaoDoSistema,
  DEFINICOES_SISTEMA,
} from './registro';
import type { DefinicaoSistema, FichaCalculavel } from './tipos';

/**
 * Contrato da iniciativa (RV-158), e a guarda que fecha a F2 de `rolagensPadrao`.
 *
 * ## Por que este arquivo existe
 *
 * `rolagensPadrao` nasceu declarado por quatro sistemas e lido por **zero** linhas
 * de produção (medido na verificação da v0.7.0). O RV-158 lhe deu o primeiro
 * consumidor — a iniciativa —, e um contrato com consumidor só continua tendo
 * consumidor se algo ficar vermelho quando ele deixar de ter.
 *
 * A guarda central é `toda rolagem padrão declarada é oferecida como iniciativa`:
 * ela percorre o **registro** (a fonte, não uma lista escrita à mão) e cobra, para
 * cada sistema, que cada entrada de `rolagensPadrao` apareça em
 * `opcoesDeIniciativa`. Declarar uma rolagem pronta que nada oferece deixa a suíte
 * vermelha nomeando o sistema e a chave.
 *
 * O que ela **não** alcança: se o caso de uso da api parar de consultar o
 * registro, esta suíte continua verde. Essa metade é medida onde ela mora, por
 * `apps/api/src/aplicacao/jogo/iniciativa-do-sistema.test.ts`, que rola a
 * iniciativa de **todo** sistema do registro sem informar expressão e compara o
 * resultado com o que a definição declara.
 */

function todasAsDefinicoes(): [SistemaRpg, DefinicaoSistema][] {
  return SISTEMAS_RPG.map((chave) => [chave, definicaoDoSistema(chave)]);
}

/** Uma ficha nova daquele sistema — o mínimo para pedir uma expressão. */
function fichaNova(sistema: SistemaRpg, nivel = 1): FichaCalculavel {
  return { nivel, atributos: atributosIniciais(sistema), dados: dadosIniciaisDaFicha(sistema) };
}

describe('convenção de chave da iniciativa', () => {
  it('a chave padrão e o rótulo são os do contrato', () => {
    expect(CHAVE_INICIATIVA).toBe('iniciativa');
    expect(ROTULO_INICIATIVA).toBe('Iniciativa');
  });

  it('a alternativa carrega a perícia dentro da chave', () => {
    expect(chaveDeIniciativaPor('furtividade')).toBe('iniciativa:furtividade');
  });

  it('o rótulo da alternativa diz por que se rola', () => {
    expect(rotuloDeIniciativa('Percepção')).toBe('Iniciativa (Percepção)');
    expect(rotuloDeIniciativa('Furtividade')).toBe('Iniciativa (Furtividade)');
  });

  it('reconhece a padrão e as alternativas, e recusa o que não é iniciativa', () => {
    expect(ehChaveDeIniciativa(CHAVE_INICIATIVA)).toBe(true);
    expect(ehChaveDeIniciativa(chaveDeIniciativaPor('enganacao'))).toBe(true);
    expect(ehChaveDeIniciativa('percepcaoPassiva')).toBe(false);
    // Prefixo parecido não conta: `iniciativas` é outra coisa, e aceitá-la faria
    // uma rolagem alheia entrar no seletor de iniciativa.
    expect(ehChaveDeIniciativa('iniciativas')).toBe(false);
    expect(ehChaveDeIniciativa('')).toBe(false);
  });
});

describe('a iniciativa é do sistema — guarda de contrato de rolagensPadrao (F2)', () => {
  it('a lista de sistemas não está vazia', () => {
    // Rede de segurança do próprio arquivo: com a lista vazia, todo `for` abaixo
    // passaria sem verificar nada.
    expect(SISTEMAS_RPG.length).toBeGreaterThan(0);
  });

  it('toda rolagem padrão declarada é oferecida como opção de iniciativa', () => {
    const orfas: string[] = [];
    for (const [chave, definicao] of todasAsDefinicoes()) {
      const oferecidas = new Set(
        opcoesDeIniciativa(definicao, fichaNova(chave)).map((opcao) => opcao.chave),
      );
      for (const rolagem of definicao.rolagensPadrao) {
        if (!oferecidas.has(rolagem.chave)) orfas.push(`${chave}.${rolagem.chave}`);
      }
    }

    expect(
      orfas,
      `Rolagem(ns) padrão declaradas por um sistema e oferecidas por ninguém: ` +
        `${orfas.join(', ')}. Foi exatamente assim que \`rolagensPadrao\` passou quatro versões ` +
        `sendo contrato sem consumidor (F2): a definição promete a rolagem e nenhuma tela a ` +
        `oferece. Se é iniciativa, use CHAVE_INICIATIVA ou chaveDeIniciativaPor(...); se é outra ` +
        `coisa, dê a ela um consumidor de produção e uma guarda como esta.`,
    ).toEqual([]);
  });

  it('todo sistema que declara rolagem padrão declara qual é a de iniciativa', () => {
    const semPadrao = todasAsDefinicoes()
      .filter(([, definicao]) => definicao.rolagensPadrao.length > 0)
      .filter(([chave, definicao]) => iniciativaEscolhida(definicao, fichaNova(chave)) === null)
      .map(([chave]) => chave);

    expect(
      semPadrao,
      `Sistema(s) com rolagens padrão mas sem a de iniciativa (chave "${CHAVE_INICIATIVA}"): ` +
        `${semPadrao.join(', ')}. O seletor da interface pré-seleciona a padrão; sem ela o ` +
        `mestre abriria a luta com nenhuma opção marcada.`,
    ).toEqual([]);
  });

  it('nenhuma perícia usa a chave da iniciativa — a ambiguidade não existe', () => {
    const colisoes: string[] = [];
    for (const [chave, definicao] of todasAsDefinicoes()) {
      for (const pericia of definicao.pericias) {
        if (ehChaveDeIniciativa(pericia.chave)) colisoes.push(`${chave}.${pericia.chave}`);
      }
    }

    expect(
      colisoes,
      `Perícia(s) com chave de iniciativa: ${colisoes.join(', ')}. A chave endereça as duas ` +
        `coisas, e a rolagem da perícia passaria a ser tratada como a iniciativa do sistema.`,
    ).toEqual([]);
  });

  it('toda opção de iniciativa produz expressão que o motor de dados aceita', () => {
    for (const [chave, definicao] of todasAsDefinicoes()) {
      for (const nivel of [1, 20]) {
        for (const opcao of opcoesDeIniciativa(definicao, fichaNova(chave, nivel))) {
          const validada = validarExpressao(opcao.expressao);
          expect(validada.ok, `${chave}.${opcao.chave} → "${opcao.expressao}"`).toBe(true);
        }
      }
    }
  });

  it('toda opção traz o termo de bônus explícito, e não o dado pelado', () => {
    // A asserção é precisa de propósito: `1d20` sozinho é o que sai quando o bônus
    // não pôde ser lido da ficha, e `1d20+0` é o bônus zero de verdade. Sem esta
    // distinção, uma iniciativa que perdeu o bônus passaria verde parecendo certa.
    const semBonus: string[] = [];
    for (const [chave, definicao] of todasAsDefinicoes()) {
      for (const opcao of opcoesDeIniciativa(definicao, fichaNova(chave, 7))) {
        if (!/[+-]\d+$/.test(opcao.expressao)) semBonus.push(`${chave}.${opcao.chave}`);
      }
    }

    expect(
      semBonus,
      `Opção(ões) de iniciativa sem termo de bônus: ${semBonus.join(', ')}. O bônus da ficha ` +
        `não chegou à expressão, e o participante entra na ordem com o dado puro.`,
    ).toEqual([]);
  });

  it('exatamente uma opção por sistema é a padrão', () => {
    for (const [chave, definicao] of todasAsDefinicoes()) {
      const opcoes = opcoesDeIniciativa(definicao, fichaNova(chave));
      if (opcoes.length === 0) continue;
      expect(opcoes.filter((opcao) => opcao.padrao)).toHaveLength(1);
      // A padrão vem primeiro: é ela que a interface mostra sem o mestre abrir a lista.
      expect(opcoes[0]?.padrao, `sistema "${chave}"`).toBe(true);
    }
  });

  it('a ordem das opções é a ordem declarada, e é estável entre chamadas', () => {
    for (const [chave, definicao] of todasAsDefinicoes()) {
      const ficha = fichaNova(chave);
      const declarada = definicao.rolagensPadrao
        .filter((rolagem) => ehChaveDeIniciativa(rolagem.chave))
        .map((rolagem) => rolagem.chave);

      expect(opcoesDeIniciativa(definicao, ficha).map((o) => o.chave)).toEqual(declarada);
      expect(opcoesDeIniciativa(definicao, ficha).map((o) => o.chave)).toEqual(declarada);
    }
  });
});

describe('iniciativaEscolhida', () => {
  it('sem chave devolve a padrão do sistema', () => {
    for (const [chave, definicao] of todasAsDefinicoes()) {
      const escolhida = iniciativaEscolhida(definicao, fichaNova(chave));
      if (definicao.rolagensPadrao.length === 0) {
        expect(escolhida).toBeNull();
        continue;
      }
      expect(escolhida?.chave).toBe(CHAVE_INICIATIVA);
      expect(escolhida?.padrao).toBe(true);
    }
  });

  it('chave vazia é tratada como ausente — o campo em branco não é recusa', () => {
    const definicao = definicaoDoSistema('dnd5e');
    expect(iniciativaEscolhida(definicao, fichaNova('dnd5e'), '')?.chave).toBe(CHAVE_INICIATIVA);
  });

  it('chave desconhecida devolve null em vez da padrão', () => {
    // Cair na padrão em silêncio seria pior que recusar: o mestre pediria
    // Furtividade, veria "Iniciativa (Percepção)" no chat e não entenderia por quê.
    const definicao = definicaoDoSistema('pathfinder2e');
    expect(iniciativaEscolhida(definicao, fichaNova('pathfinder2e'), 'iniciativa:voar')).toBeNull();
  });

  it('a alternativa pedida é a devolvida, com o rótulo dela', () => {
    const definicao = definicaoDoSistema('pathfinder2e');
    const escolhida = iniciativaEscolhida(
      definicao,
      fichaNova('pathfinder2e'),
      chaveDeIniciativaPor('furtividade'),
    );

    expect(escolhida?.chave).toBe('iniciativa:furtividade');
    expect(escolhida?.rotulo).toBe('Iniciativa (Furtividade)');
    expect(escolhida?.padrao).toBe(false);
  });

  it('D&D 5e oferece uma opção só, e é a Destreza da ficha', () => {
    // O ponto da armadilha do card: uma mesa de D&D **não** passa a rolar Percepção
    // nem ganha alternativas por perícia porque o PF2e entrou no repositório.
    const definicao = definicaoDoSistema('dnd5e');
    const ficha: FichaCalculavel = {
      nivel: 3,
      atributos: { ...atributosIniciais('dnd5e'), destreza: 16 },
      dados: dadosIniciaisDaFicha('dnd5e'),
    };
    const opcoes = opcoesDeIniciativa(definicao, ficha);

    expect(opcoes.map((o) => o.chave)).toEqual([CHAVE_INICIATIVA]);
    expect(opcoes[0]?.rotulo).toBe(ROTULO_INICIATIVA);
    expect(opcoes[0]?.expressao).toBe('1d20+3');
  });

  it('a ficha genérica mantém a iniciativa por Destreza — decisão do RV-158', () => {
    // Tormenta 20 e Ordem Paranormal reusam esta definição e são d20: deixá-las sem
    // iniciativa obrigaria o mestre a digitar o bônus de cada participante à mão.
    for (const sistema of ['generico', 'tormenta20', 'ordem-paranormal'] as const) {
      const ficha: FichaCalculavel = {
        nivel: 1,
        atributos: { ...atributosIniciais(sistema), destreza: 14 },
        dados: dadosIniciaisDaFicha(sistema),
      };
      const escolhida = iniciativaEscolhida(definicaoDoSistema(sistema), ficha);
      expect(escolhida?.expressao, sistema).toBe('1d20+2');
    }
  });

  it('DEFINICOES_SISTEMA e o registro concordam sobre as opções', () => {
    for (const definicao of DEFINICOES_SISTEMA) {
      const ficha = fichaNova(definicao.chave);
      expect(opcoesDeIniciativa(definicao, ficha)).toEqual(
        opcoesDeIniciativa(definicaoDoSistema(definicao.chave), ficha),
      );
    }
  });
});
