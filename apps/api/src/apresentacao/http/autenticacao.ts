import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import type { ServicoToken } from '../../aplicacao/ports/infraestrutura';

declare module 'fastify' {
  interface FastifyRequest {
    usuarioId: string;
  }
}

/** preHandler que exige JWT válido e injeta request.usuarioId. */
export function criarAutenticador(servicoToken: ServicoToken): preHandlerAsyncHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const cabecalho = request.headers.authorization;
    const token = cabecalho?.startsWith('Bearer ') ? cabecalho.slice(7) : null;
    if (!token) {
      return reply.status(401).send({ erro: 'Autenticação necessária.' });
    }
    const sessao = await servicoToken.verificar(token);
    if (!sessao) {
      return reply.status(401).send({ erro: 'Sessão inválida ou expirada.' });
    }
    request.usuarioId = sessao.usuarioId;
  };
}
