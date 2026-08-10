import { describe, expect, it } from 'vitest';
import { GRAUS_SUCESSO } from '../sistemas/pathfinder2e/regras';
import {
  CD_MAXIMA,
  CD_MINIMA,
  cdValida,
  descreverAvaliacao,
  EFEITOS_DADO_NATURAL,
  mensagemSistemaSemAvaliacao,
  MENSAGEM_CD_INVALIDA,
  type AvaliacaoRolagem,
} from './avaliacao';

/**
 * O vocabulário do selo de grau (RV-154).
 *
 * O que estes testes protegem é o DoD do card — **o selo é legível sem cor** —
 * e ele só é verificável aqui: no componente a cor é uma classe de CSS que o
 * jsdom não interpreta, então quem garante que existe *texto* para cada grau é
 * esta função pura.
 */

function avaliacao(parcial: Partial<AvaliacaoRolagem> = {}): AvaliacaoRolagem {
  return { cd: 18, grau: 'sucesso', d20Natural: 12, efeitoNatural: null, ...parcial };
}

describe('descreverAvaliacao — todo grau tem texto próprio', () => {
  it('os quatro graus têm rótulo em PT-BR, e nenhum repete o do outro', () => {
    const rotulos = GRAUS_SUCESSO.map((grau) => descreverAvaliacao(avaliacao({ grau })).rotulo);
    expect(rotulos).toEqual(['Sucesso crítico', 'Sucesso', 'Falha', 'Falha crítica']);
    // Rótulo repetido tornaria dois resultados diferentes indistinguíveis para
    // quem lê — que é exatamente o defeito que "nada só por cor" evita.
    expect(new Set(rotulos).size).toBe(GRAUS_SUCESSO.length);
  });

  it('nenhum grau fica sem rótulo, e o tom nunca é a única diferença', () => {
    for (const grau of GRAUS_SUCESSO) {
      const descricao = descreverAvaliacao(avaliacao({ grau }));
      expect(descricao.rotulo.trim().length).toBeGreaterThan(0);
      expect(descricao.icone.trim().length).toBeGreaterThan(0);
    }
  });

  it('crítico e comum não se distinguem só pelo tom: a palavra "crítico" aparece', () => {
    expect(descreverAvaliacao(avaliacao({ grau: 'sucesso-critico' })).rotulo).toContain('crítico');
    expect(descreverAvaliacao(avaliacao({ grau: 'falha-critica' })).rotulo).toContain('crítica');
    expect(descreverAvaliacao(avaliacao({ grau: 'sucesso' })).rotulo).not.toContain('crít');
    expect(descreverAvaliacao(avaliacao({ grau: 'falha' })).rotulo).not.toContain('crít');
  });

  it('a CD contra a qual o total foi comparado aparece em texto', () => {
    expect(descreverAvaliacao(avaliacao({ cd: 22 })).contraCd).toBe('contra CD 22');
  });
});

describe('descreverAvaliacao — a frase do 20/1 natural', () => {
  it('20 natural que melhorou diz que subiu um grau, nomeando o dado', () => {
    // Cenário de aceite do card: "indica em texto que o 20 natural melhorou um grau".
    const descricao = descreverAvaliacao(
      avaliacao({ grau: 'falha', d20Natural: 20, efeitoNatural: 'melhorou' }),
    );
    expect(descricao.rotulo).toBe('Falha');
    expect(descricao.detalheNatural).toBe('20 natural: um grau acima.');
  });

  it('1 natural que piorou diz que caiu um grau', () => {
    const descricao = descreverAvaliacao(
      avaliacao({ grau: 'sucesso', d20Natural: 1, efeitoNatural: 'piorou' }),
    );
    expect(descricao.detalheNatural).toBe('1 natural: um grau abaixo.');
  });

  it('20 natural sem efeito NÃO afirma que melhorou nada', () => {
    const descricao = descreverAvaliacao(
      avaliacao({ grau: 'sucesso-critico', d20Natural: 20, efeitoNatural: 'sem-efeito' }),
    );
    expect(descricao.detalheNatural).toBe('20 natural: o grau já estava no limite da escala.');
    expect(descricao.detalheNatural).not.toContain('acima');
  });

  it('dado comum não gera frase nenhuma', () => {
    expect(descreverAvaliacao(avaliacao({ d20Natural: 12 })).detalheNatural).toBeNull();
  });

  it('d20 não identificável não gera frase, mesmo com efeito gravado torto', () => {
    // Defesa contra registro inconsistente vindo do banco: sem o valor do dado
    // não há frase possível, e a tela não pode quebrar por isso.
    const descricao = descreverAvaliacao(
      avaliacao({ d20Natural: null, efeitoNatural: 'melhorou' }),
    );
    expect(descricao.detalheNatural).toBeNull();
    expect(descricao.rotulo.length).toBeGreaterThan(0);
  });

  it('os três efeitos possíveis têm frase, e nenhuma é vazia', () => {
    for (const efeitoNatural of EFEITOS_DADO_NATURAL) {
      const descricao = descreverAvaliacao(avaliacao({ d20Natural: 20, efeitoNatural }));
      expect(descricao.detalheNatural).not.toBeNull();
      expect(descricao.detalheNatural?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('a faixa da CD e a recusa por sistema', () => {
  it('aceita as pontas e recusa um passo fora, dos dois lados', () => {
    expect(cdValida(CD_MINIMA)).toBe(true);
    expect(cdValida(CD_MAXIMA)).toBe(true);
    expect(cdValida(CD_MINIMA - 1)).toBe(false);
    expect(cdValida(CD_MAXIMA + 1)).toBe(false);
  });

  it('recusa CD fracionária e não-finita', () => {
    expect(cdValida(18.5)).toBe(false);
    expect(cdValida(Number.NaN)).toBe(false);
    expect(cdValida(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('a mensagem de CD inválida diz a faixa, e a faixa vem das constantes', () => {
    expect(MENSAGEM_CD_INVALIDA).toContain(String(CD_MINIMA));
    expect(MENSAGEM_CD_INVALIDA).toContain(String(CD_MAXIMA));
  });

  it('a recusa por sistema nomeia o sistema e diz o que fazer', () => {
    const mensagem = mensagemSistemaSemAvaliacao('Genérico');
    expect(mensagem).toContain('Genérico');
    expect(mensagem).toContain('grau de sucesso');
    // Diz o conserto, e não só o problema: o jogador precisa saber que basta
    // tirar a CD para a rolagem sair.
    expect(mensagem).toContain('CD');
  });
});
