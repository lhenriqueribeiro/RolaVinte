import { createClient } from '@supabase/supabase-js';

/**
 * Tipo exato devolvido por `createClient` sem tipos gerados do banco.
 * Escrito como `ReturnType` (e não `SupabaseClient`) porque os parâmetros
 * genéricos padrão dos dois não coincidem — anotar `SupabaseClient` faria a
 * função devolver um tipo mais frouxo do que o real.
 */
export type ClienteSupabase = ReturnType<typeof createClient>;

/**
 * Cliente Supabase com service role — o backend é a única fronteira com o banco.
 * Criado uma única vez no composition root.
 */
export function criarClienteSupabase(url: string, serviceRoleKey: string): ClienteSupabase {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Converte erro do supabase-js em exceção com contexto — falha de banco é bug/infra, não fluxo. */
export function garantirSemErro(operacao: string, error: { message: string } | null): void {
  if (error) {
    throw new Error(`[supabase] ${operacao}: ${error.message}`);
  }
}
