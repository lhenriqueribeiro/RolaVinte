import { describe, expect, it } from 'vitest';
import {
  alternarCondicaoTokenSchema,
  CONDICAO_INCONSCIENTE,
  CONDICOES,
  CONDICOES_DISPONIVEIS,
  ehCondicaoConhecida,
  MENSAGEM_CONDICAO_DESCONHECIDA,
  normalizarCondicoes,
} from './jogo';

/**
 * O catálogo de condições e as duas funções puras em volta dele (RV-064).
 *
 * Aqui mora a metade que não precisa de banco nem de tela: "sem duplicata e sem
 * ordem significativa" é uma propriedade de `normalizarCondicoes`, e é a mesma
 * função que o agregado `Token`, o mapper e os dois componentes usam. Testá-la
 * aqui é testá-la uma vez para todos eles.
 */

describe('catálogo CONDICOES — forma do contrato', () => {
  it('tem condições e cada uma traz rótulo, ícone e descrição em PT-BR', () => {
    expect(CONDICOES_DISPONIVEIS.length).toBeGreaterThan(0);

    for (const chave of CONDICOES_DISPONIVEIS) {
      const definicao = CONDICOES[chave];
      expect(definicao.rotulo.trim(), `"${chave}" sem rótulo`).not.toBe('');
      expect(definicao.icone.trim(), `"${chave}" sem ícone`).not.toBe('');
      expect(definicao.descricao.trim(), `"${chave}" sem descrição`).not.toBe('');
      // Chave é identificador de contrato: minúscula, sem acento e sem espaço,
      // porque viaja no corpo do PATCH e vira texto no Postgres.
      expect(chave, `"${chave}" não é um identificador simples`).toMatch(/^[a-z]+$/);
    }
  });

  it('nenhum rótulo repetido: dois botões com o mesmo nome são ambíguos na tela', () => {
    // Não é preciosismo — o seletor do mestre é uma lista de botões nomeados
    // pelo rótulo, e um rótulo repetido tornaria dois deles indistinguíveis
    // para quem usa leitor de tela (e para o próprio teste que os procura).
    const rotulos = CONDICOES_DISPONIVEIS.map((chave) => CONDICOES[chave].rotulo);
    expect(new Set(rotulos).size).toBe(rotulos.length);
  });

  it('a lista de chaves é imutável — ninguém acrescenta condição em runtime', () => {
    expect(Object.isFrozen(CONDICOES_DISPONIVEIS)).toBe(true);
    expect(Object.isFrozen(CONDICOES)).toBe(true);
  });

  it('CONDICAO_INCONSCIENTE existe no catálogo (é o que o RV-065 vai aplicar)', () => {
    // Constante em vez de string digitada no caso de uso de dano: aqui um erro
    // de digitação é erro de compilação, e este caso garante que a chave não
    // desaparece do catálogo sem alguém ficar vermelho.
    expect(CONDICOES_DISPONIVEIS).toContain(CONDICAO_INCONSCIENTE);
    expect(CONDICOES[CONDICAO_INCONSCIENTE].rotulo).toBe('Inconsciente');
  });
});

describe('ehCondicaoConhecida', () => {
  it('aceita toda chave do catálogo', () => {
    for (const chave of CONDICOES_DISPONIVEIS) {
      expect(ehCondicaoConhecida(chave), `"${chave}" recusada`).toBe(true);
    }
  });

  it.each(['banana', 'CAIDO', 'caído', '', ' caido', 'toString', 'constructor'])(
    'recusa %o',
    (valor) => {
      // `toString` e `constructor` entram na tabela porque um `in` ingênuo os
      // aceitaria pela cadeia de protótipos, e "condição herdada do Object" é
      // exatamente o tipo de brecha que passa despercebida.
      expect(ehCondicaoConhecida(valor)).toBe(false);
    },
  );
});

describe('normalizarCondicoes — sem duplicata e sem ordem significativa', () => {
  it('remove repetição', () => {
    expect(normalizarCondicoes(['caido', 'caido', 'caido'])).toEqual(['caido']);
  });

  it('a ordem de entrada não muda a saída', () => {
    const uma = normalizarCondicoes(['envenenado', 'caido', 'atordoado']);
    const outra = normalizarCondicoes(['atordoado', 'envenenado', 'caido']);

    expect(uma).toEqual(outra);
    // E a saída segue a ordem do catálogo, que é o que mantém os ícones no mesmo
    // lugar entre dois `token:atualizado`.
    expect(uma).toEqual(['atordoado', 'caido', 'envenenado']);
  });

  it('descarta chave desconhecida em vez de propagá-la', () => {
    expect(normalizarCondicoes(['caido', 'banana', ''])).toEqual(['caido']);
  });

  it('lista vazia continua vazia', () => {
    expect(normalizarCondicoes([])).toEqual([]);
  });

  it('devolve um array novo — não dá para escrever no catálogo por referência', () => {
    const saida = normalizarCondicoes([...CONDICOES_DISPONIVEIS]);

    expect(saida).toEqual([...CONDICOES_DISPONIVEIS]);
    expect(saida).not.toBe(CONDICOES_DISPONIVEIS);
  });

  it('é idempotente: normalizar o que já está normalizado não muda nada', () => {
    const uma = normalizarCondicoes(['envenenado', 'caido']);
    expect(normalizarCondicoes(uma)).toEqual(uma);
  });
});

describe('alternarCondicaoTokenSchema — a borda que devolve 400', () => {
  it('aceita toda condição do catálogo, marcando e desmarcando', () => {
    for (const chave of CONDICOES_DISPONIVEIS) {
      for (const aplicada of [true, false]) {
        const r = alternarCondicaoTokenSchema.safeParse({ condicao: chave, aplicada });
        expect(r.success, `"${chave}" (aplicada=${aplicada}) recusada pelo schema`).toBe(true);
      }
    }
  });

  it.each(['banana', 'CAIDO', 'caído', ''])('recusa a condição %o em PT-BR', (condicao) => {
    const r = alternarCondicaoTokenSchema.safeParse({ condicao, aplicada: true });

    expect(r.success).toBe(false);
    if (r.success) return;
    // A mensagem é a mesma do domínio: o mestre lê o mesmo texto venha o erro da
    // borda HTTP ou do agregado.
    expect(r.error.issues[0]?.message).toBe(MENSAGEM_CONDICAO_DESCONHECIDA);
  });

  it.each([
    ['sem "aplicada"', { condicao: 'caido' }],
    ['sem "condicao"', { aplicada: true }],
    ['"aplicada" como texto', { condicao: 'caido', aplicada: 'sim' }],
    ['a lista inteira, que não é o contrato', { condicoes: ['caido'] }],
    ['nada', {}],
  ])('recusa corpo com %s', (_caso, corpo) => {
    expect(alternarCondicaoTokenSchema.safeParse(corpo).success).toBe(false);
  });

  it('a mensagem de erro lista as condições disponíveis', () => {
    // Derivada do catálogo: condição nova entra na frase sem ninguém editá-la.
    for (const chave of CONDICOES_DISPONIVEIS) {
      expect(MENSAGEM_CONDICAO_DESCONHECIDA).toContain(chave);
    }
  });
});
