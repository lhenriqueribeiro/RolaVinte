import { describe, expect, it } from 'vitest';
import { booleanoDoCampo, definirCampo, numeroDoCampo, textoDoCampo } from './campos-ficha';

/**
 * `personagens.dados` é jsonb: o valor de um campo pode faltar ou vir de outro
 * tipo (ficha gravada antes de o campo existir, mesa que trocou de sistema). O
 * que se prova aqui é que a leitura sempre devolve algo que um input controlado
 * aceita — sem isso, o React troca o input por não controlado no meio da edição.
 */
describe('leitura de campo da ficha (RV-091)', () => {
  it('texto ausente ou de outro tipo vira string vazia, não "undefined"', () => {
    expect(textoDoCampo({}, 'origem')).toBe('');
    expect(textoDoCampo({ origem: 42 }, 'origem')).toBe('');
    expect(textoDoCampo({ origem: null }, 'origem')).toBe('');
    expect(textoDoCampo({ origem: 'Colina' }, 'origem')).toBe('Colina');
  });

  it('número ausente vira campo vazio, e o zero gravado continua sendo zero', () => {
    expect(numeroDoCampo({}, 'ca')).toBe('');
    expect(numeroDoCampo({ ca: '18' }, 'ca')).toBe('');
    expect(numeroDoCampo({ ca: Number.NaN }, 'ca')).toBe('');
    expect(numeroDoCampo({ ca: Number.POSITIVE_INFINITY }, 'ca')).toBe('');
    // A distinção que importa: 0 é valor, não ausência.
    expect(numeroDoCampo({ ca: 0 }, 'ca')).toBe(0);
    expect(numeroDoCampo({ ca: -2 }, 'ca')).toBe(-2);
    expect(numeroDoCampo({ ca: 18 }, 'ca')).toBe(18);
  });

  it('booleano só é marcado com true literal', () => {
    expect(booleanoDoCampo({}, 'inspiracao')).toBe(false);
    expect(booleanoDoCampo({ inspiracao: 'true' }, 'inspiracao')).toBe(false);
    expect(booleanoDoCampo({ inspiracao: 1 }, 'inspiracao')).toBe(false);
    expect(booleanoDoCampo({ inspiracao: false }, 'inspiracao')).toBe(false);
    expect(booleanoDoCampo({ inspiracao: true }, 'inspiracao')).toBe(true);
  });
});

describe('escrita de campo da ficha (RV-091)', () => {
  it('devolve cópia e não muta a entrada', () => {
    const original = { ca: 10, deslocamento: 9 };

    const novo = definirCampo(original, 'ca', 18);

    expect(novo).toEqual({ ca: 18, deslocamento: 9 });
    expect(original).toEqual({ ca: 10, deslocamento: 9 });
    expect(novo).not.toBe(original);
  });

  it('acrescenta a chave quando ela ainda não existe', () => {
    expect(definirCampo({}, 'inspiracao', true)).toEqual({ inspiracao: true });
  });
});
