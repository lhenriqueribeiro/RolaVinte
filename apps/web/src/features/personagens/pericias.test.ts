import { describe, expect, it } from 'vitest';
import {
  atributosIniciais,
  dadosIniciaisDaFicha,
  definicaoDoSistema,
  DEFINICOES_SISTEMA,
  type Atributos,
  type PersonagemCalculavel,
} from '@rolavinte/shared';
import { grausDoSistema, linhasDePericia } from './pericias';

const ATRIBUTOS_PADRAO: Atributos = {
  forca: 10,
  destreza: 16,
  constituicao: 10,
  inteligencia: 10,
  sabedoria: 10,
  carisma: 10,
};

function fichaDnd(grauFurtividade = 'destreinado', nivel = 3): PersonagemCalculavel {
  const definicao = definicaoDoSistema('dnd5e');
  return {
    sistema: 'dnd5e',
    nivel,
    atributos: ATRIBUTOS_PADRAO,
    dados: definicao.definirGrauDePericia(
      dadosIniciaisDaFicha('dnd5e'),
      'furtividade',
      grauFurtividade,
    ),
  };
}

function furtividade(ficha: PersonagemCalculavel) {
  const linha = linhasDePericia(ficha, 'Thorin').find((l) => l.chave === 'furtividade');
  if (!linha) throw new Error('A definição de dnd5e deixou de ter a perícia Furtividade.');
  return linha;
}

describe('linhas de perícia da ficha (RV-090)', () => {
  it('o cenário do card: Destreza 16, proficiência +2 e Furtividade proficiente somam +5', () => {
    const linha = furtividade(fichaDnd('proficiente'));

    expect(linha.bonus).toBe(5);
    expect(linha.bonusFormatado).toBe('+5');
    expect(linha.expressao).toBe('1d20+5');
    expect(linha.motivo).toBe('Furtividade — Thorin');
    expect(linha.grau).toBe('proficiente');
  });

  it('sem proficiência o bônus é só o modificador de destreza', () => {
    const linha = furtividade(fichaDnd('destreinado'));

    expect(linha.bonus).toBe(3);
    expect(linha.expressao).toBe('1d20+3');
  });

  it('especialista dobra a proficiência, e o nível 20 usa a tabela até o fim', () => {
    expect(furtividade(fichaDnd('especialista')).bonus).toBe(7);
    expect(furtividade(fichaDnd('proficiente', 20)).bonus).toBe(9);
  });

  it('bônus negativo sai com sinal na expressão, sem virar "+-1"', () => {
    const linha = linhasDePericia(
      {
        sistema: 'dnd5e',
        nivel: 1,
        atributos: { ...ATRIBUTOS_PADRAO, forca: 8 },
        dados: dadosIniciaisDaFicha('dnd5e'),
      },
      'Thorin',
    ).find((l) => l.chave === 'atletismo');

    expect(linha?.bonusFormatado).toBe('-1');
    expect(linha?.expressao).toBe('1d20-1');
  });

  it('a lista tem exatamente as perícias da definição, na mesma ordem', () => {
    const esperadas = definicaoDoSistema('dnd5e').pericias.map((p) => p.chave);

    expect(linhasDePericia(fichaDnd(), 'Thorin').map((l) => l.chave)).toEqual(esperadas);
  });

  it('sistema sem perícias devolve lista vazia — a seção simplesmente não aparece', () => {
    const ficha: PersonagemCalculavel = {
      sistema: 'generico',
      nivel: 3,
      atributos: ATRIBUTOS_PADRAO,
      dados: {},
    };

    expect(linhasDePericia(ficha, 'Thorin')).toEqual([]);
    expect(grausDoSistema('generico')).toEqual([]);
  });

  it('nenhuma linha nasce incompleta em nenhum sistema registrado', () => {
    // Rede: se o registro ficasse vazio, os laços acima passariam sem verificar
    // nada. Aqui se exige que exista sistema e que toda linha esteja completa.
    // Os atributos vêm da escala de cada sistema (RV-098): mandar 16 para uma
    // ficha de PF2e seria escrever um valor que aquela escala não aceita.
    expect(DEFINICOES_SISTEMA.length).toBeGreaterThan(0);
    for (const definicao of DEFINICOES_SISTEMA) {
      const linhas = linhasDePericia(
        {
          sistema: definicao.chave,
          nivel: 5,
          atributos: atributosIniciais(definicao.chave),
          dados: dadosIniciaisDaFicha(definicao.chave),
        },
        'Thorin',
      );
      expect(linhas.length).toBe(definicao.pericias.length);
      for (const linha of linhas) {
        expect(linha.rotulo).not.toBe('');
        expect(linha.motivo).toContain('Thorin');
        expect(linha.expressao).toMatch(/^\d+d\d+[+-]\d+$/);
        expect(grausDoSistema(definicao.chave).map((g) => g.chave)).toContain(linha.grau);
      }
    }
  });
});
