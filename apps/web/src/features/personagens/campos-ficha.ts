import type { DadosFicha } from '@rolavinte/shared';

/**
 * Leitura e escrita da metade da ficha que pertence ao sistema (RV-091).
 *
 * `personagens.dados` é jsonb: chega como `Record<string, unknown>` e **não há
 * garantia de que a chave exista nem de que o tipo seja o esperado**. Duas
 * situações reais produzem isso hoje:
 *
 * - ficha antiga, gravada antes de o sistema ganhar um campo novo;
 * - mesa que trocou de sistema — os campos do sistema anterior continuam
 *   gravados e o `schemaFicha` novo não os conhece.
 *
 * Sem o estreitamento abaixo, um `value={dados.ca}` com `undefined` trocaria o
 * input controlado por não controlado no meio da digitação. Por isso cada tipo
 * de campo tem a sua leitura, com um padrão explícito — e são funções puras,
 * testadas sem navegador.
 */

/** Texto do campo; `''` quando ausente ou de outro tipo. */
export function textoDoCampo(dados: DadosFicha, chave: string): string {
  const valor = dados[chave];
  return typeof valor === 'string' ? valor : '';
}

/**
 * Número do campo; `''` quando ausente, não numérico ou `NaN`/infinito.
 *
 * Devolve `''` em vez de `0` de propósito: `0` é um valor legítimo de campo, e
 * confundi-lo com "vazio" faria a ficha mostrar zero onde o jogador nunca
 * escreveu nada.
 */
export function numeroDoCampo(dados: DadosFicha, chave: string): number | '' {
  const valor = dados[chave];
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : '';
}

/** Marcado só quando o valor gravado é exatamente `true`. */
export function booleanoDoCampo(dados: DadosFicha, chave: string): boolean {
  return dados[chave] === true;
}

/** Cópia de `dados` com um campo trocado. Não muta a entrada. */
export function definirCampo(dados: DadosFicha, chave: string, valor: unknown): DadosFicha {
  return { ...dados, [chave]: valor };
}
