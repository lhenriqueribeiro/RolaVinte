import { describe, expect, it } from 'vitest';
import { rolarExpressao, validarExpressao } from './motor-dados';

/** RNG determinístico que devolve a sequência dada (valores 0..1). */
function rngDe(...valores: number[]) {
  let i = 0;
  return () => valores[i++ % valores.length]!;
}

describe('motor de dados', () => {
  it('rola d20 simples (atalho sem quantidade)', () => {
    const saida = rolarExpressao('d20', rngDe(0.99));
    expect(saida.ok && saida.resultado.total).toBe(20);
  });

  it('rola 2d6+3', () => {
    const saida = rolarExpressao('2d6+3', rngDe(0, 0.5));
    // dados: 1 e 4 → 5; +3 → 8
    expect(saida.ok && saida.resultado.total).toBe(8);
  });

  it('4d6kh3 descarta o menor', () => {
    const saida = rolarExpressao('4d6kh3', rngDe(0.9, 0.9, 0.9, 0));
    if (!saida.ok) throw new Error(saida.erro);
    expect(saida.resultado.total).toBe(18);
    const termo = saida.resultado.termos[0]!;
    if (termo.tipo !== 'dados') throw new Error('esperava termo de dados');
    expect(termo.dados.filter((d) => d.descartado)).toHaveLength(1);
    expect(termo.dados.find((d) => d.descartado)?.valor).toBe(1);
  });

  it('2d20kl1 mantém o menor (desvantagem)', () => {
    const saida = rolarExpressao('2d20kl1', rngDe(0.99, 0));
    expect(saida.ok && saida.resultado.total).toBe(1);
  });

  it('suporta subtração e múltiplos termos', () => {
    const saida = rolarExpressao('1d8+1d6-2', rngDe(0.99, 0.99));
    expect(saida.ok && saida.resultado.total).toBe(8 + 6 - 2);
  });

  it('aceita constante negativa inicial', () => {
    const saida = rolarExpressao('-2+1d4', rngDe(0.99));
    expect(saida.ok && saida.resultado.total).toBe(2);
  });

  it('rejeita 0 dados', () => {
    expect(rolarExpressao('0d6').ok).toBe(false);
  });

  it('rejeita mais de 100 dados', () => {
    expect(rolarExpressao('101d6').ok).toBe(false);
  });

  it('rejeita faces fora do limite', () => {
    expect(rolarExpressao('1d1').ok).toBe(false);
    expect(rolarExpressao('1d1001').ok).toBe(false);
  });

  it('rejeita kh maior que a quantidade', () => {
    expect(rolarExpressao('2d6kh3').ok).toBe(false);
  });

  it('rejeita lixo', () => {
    expect(rolarExpressao('abc').ok).toBe(false);
    expect(rolarExpressao('1d6++2').ok).toBe(false);
    expect(rolarExpressao('').ok).toBe(false);
    expect(rolarExpressao('1d6+').ok).toBe(false);
  });

  it('validarExpressao espelha o parser', () => {
    expect(validarExpressao('4d6kh3+2').ok).toBe(true);
    expect(validarExpressao('4d6xx').ok).toBe(false);
  });
});
