import { describe, expect, it } from 'vitest';
import { motivoChaveSupabaseInvalida } from './env';

/**
 * A chave errada aqui não derruba nada na partida — ela deixa a API subir e
 * toda consulta voltar vazia, porque o RLS da migration 0001 nega tudo para
 * anon/authenticated. Este teste existe para que o erro apareça no boot.
 */
describe('motivoChaveSupabaseInvalida', () => {
  /** Monta um JWT legado com o papel informado (só o payload importa aqui). */
  function chaveLegada(papel: string): string {
    const payload = Buffer.from(JSON.stringify({ role: papel })).toString('base64url');
    return `eyJhbGciOiJIUzI1NiJ9.${payload}.assinatura-irrelevante`;
  }

  it('aceita a chave secreta do formato novo', () => {
    expect(motivoChaveSupabaseInvalida('sb_secret_abcdefghijklmnop')).toBeNull();
  });

  it('aceita a service_role legada', () => {
    expect(motivoChaveSupabaseInvalida(chaveLegada('service_role'))).toBeNull();
  });

  it('recusa a chave publicável, que é a confusão provável', () => {
    const motivo = motivoChaveSupabaseInvalida('sb_publishable_hpC5nqLzApAErpbi1haMPw');
    expect(motivo).toContain('publicável');
  });

  it('recusa a anon legada nomeando o papel encontrado', () => {
    expect(motivoChaveSupabaseInvalida(chaveLegada('anon'))).toContain('anon');
  });

  it('recusa qualquer papel que não seja service_role', () => {
    expect(motivoChaveSupabaseInvalida(chaveLegada('authenticated'))).toContain('authenticated');
  });

  it('não bloqueia chave opaca de formato desconhecido', () => {
    // Preferimos deixar passar o que não sabemos ler a barrar uma chave válida
    // de um formato futuro: o custo do falso positivo aqui é a API não subir.
    expect(motivoChaveSupabaseInvalida('formato-que-ainda-nao-existe-123456')).toBeNull();
  });
});
