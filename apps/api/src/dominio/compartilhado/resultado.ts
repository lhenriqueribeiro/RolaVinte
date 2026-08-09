import type { ErroDominio } from './erro-dominio';

/** Railway-oriented: falhas esperadas fluem como valor, exceção é bug. */
export type Result<T> = { ok: true; valor: T } | { ok: false; erro: ErroDominio };

export const ok = <T>(valor: T): Result<T> => ({ ok: true, valor });
export const falha = <T = never>(erro: ErroDominio): Result<T> => ({ ok: false, erro });
