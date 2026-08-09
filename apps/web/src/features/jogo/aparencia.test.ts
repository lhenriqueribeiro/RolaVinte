import { describe, expect, it } from 'vitest';
import { COR_GRID_PADRAO } from '@rolavinte/shared';
import { corComAlfa, faixaDeVida, fracaoDeVida, rotuloDeVida } from './aparencia';

describe('corComAlfa (RV-033)', () => {
  it('converte hexadecimal em rgba com o alfa pedido', () => {
    expect(corComAlfa('#3a4a63', 0.45)).toBe('rgba(58, 74, 99, 0.45)');
    expect(corComAlfa('#ffffff', 1)).toBe('rgba(255, 255, 255, 1)');
    expect(corComAlfa('#000000', 0)).toBe('rgba(0, 0, 0, 0)');
  });

  it('aceita hexadecimal em maiúsculas', () => {
    expect(corComAlfa('#FF8000', 0.5)).toBe('rgba(255, 128, 0, 0.5)');
  });

  it.each(['vermelho', '#fff', '#12345g', '', 'rgb(1,2,3)'])(
    'cai no padrão do contrato quando a cor é inválida (%s)',
    (cor) => {
      // Dado antigo em cache não pode apagar o grid nem gerar `rgba(NaN…)`.
      expect(corComAlfa(cor, 0.45)).toBe(corComAlfa(COR_GRID_PADRAO, 0.45));
      expect(corComAlfa(cor, 0.45)).not.toContain('NaN');
    },
  );
});

describe('faixaDeVida (RV-042)', () => {
  it.each([
    [30, 30, 'saudavel'],
    [16, 30, 'saudavel'],
    [15, 30, 'ferido'],
    [12, 30, 'ferido'],
    [8, 30, 'ferido'],
    [7, 30, 'critico'],
    [1, 30, 'critico'],
    [0, 30, 'critico'],
  ])('%i de %i PV → %s', (pvAtual, pvMax, esperado) => {
    expect(faixaDeVida(pvAtual, pvMax)).toBe(esperado);
  });

  it('é verde acima de 50%, âmbar de 25% a 50% e vermelha abaixo de 25%', () => {
    expect(faixaDeVida(51, 100)).toBe('saudavel');
    expect(faixaDeVida(50, 100)).toBe('ferido');
    expect(faixaDeVida(25, 100)).toBe('ferido');
    expect(faixaDeVida(24, 100)).toBe('critico');
  });

  it('ficha com PV máximo zerado conta como crítico, não como saudável', () => {
    expect(faixaDeVida(0, 0)).toBe('critico');
    expect(fracaoDeVida(5, 0)).toBe(0);
  });

  it('limita a fração entre 0 e 1 mesmo com PV negativo ou acima do máximo', () => {
    expect(fracaoDeVida(-5, 30)).toBe(0);
    expect(fracaoDeVida(40, 30)).toBe(1);
  });

  it('o rótulo textual traz os dois números — a cor nunca informa sozinha', () => {
    expect(rotuloDeVida(12, 30)).toBe('12/30 PV');
  });
});
