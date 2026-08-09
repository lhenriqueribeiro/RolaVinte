import type { FastifyReply } from 'fastify';
import type { z, ZodTypeAny } from 'zod';

/**
 * Valida a entrada com Zod e responde 400 com as mensagens em PT-BR.
 * Retorna null quando inválido (a resposta já foi enviada).
 * Tipado pelo output do schema — defaults do Zod já aplicados.
 */
export function validarEntrada<S extends ZodTypeAny>(
  schema: S,
  dados: unknown,
  reply: FastifyReply,
): z.output<S> | null {
  const resultado = schema.safeParse(dados);
  if (!resultado.success) {
    const mensagens = resultado.error.issues.map((i) => i.message).join(' ');
    reply.status(400).send({ erro: mensagens || 'Dados inválidos.' });
    return null;
  }
  return resultado.data as z.output<S>;
}
