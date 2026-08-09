import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { atualizarPersonagemSchema, criarPersonagemSchema } from '@rolavinte/shared';
import type { CriarPersonagem } from '../../aplicacao/personagens/criar-personagem';
import type { ListarPersonagens } from '../../aplicacao/personagens/listar-personagens';
import type { AtualizarPersonagem } from '../../aplicacao/personagens/atualizar-personagem';
import type { RemoverPersonagem } from '../../aplicacao/personagens/remover-personagem';
import type { DuplicarPersonagem } from '../../aplicacao/personagens/duplicar-personagem';
import { responderErro, responderResultado } from './erros';
import { validarEntrada } from './validacao';

interface Deps {
  criarPersonagem: CriarPersonagem;
  listarPersonagens: ListarPersonagens;
  atualizarPersonagem: AtualizarPersonagem;
  removerPersonagem: RemoverPersonagem;
  duplicarPersonagem: DuplicarPersonagem;
  autenticar: preHandlerAsyncHookHandler;
}

export function registrarRotasPersonagens(app: FastifyInstance, deps: Deps): void {
  app.get('/mesas/:mesaId/personagens', { preHandler: deps.autenticar }, async (request, reply) => {
    const { mesaId } = request.params as { mesaId: string };
    return responderResultado(
      reply,
      await deps.listarPersonagens.executar(request.usuarioId, mesaId),
    );
  });

  app.post(
    '/mesas/:mesaId/personagens',
    { preHandler: deps.autenticar },
    async (request, reply) => {
      const { mesaId } = request.params as { mesaId: string };
      const entrada = validarEntrada(criarPersonagemSchema, request.body, reply);
      if (!entrada) return;
      return responderResultado(
        reply,
        await deps.criarPersonagem.executar(request.usuarioId, mesaId, entrada),
        201,
      );
    },
  );

  app.patch(
    '/personagens/:personagemId',
    { preHandler: deps.autenticar },
    async (request, reply) => {
      const { personagemId } = request.params as { personagemId: string };
      const entrada = validarEntrada(atualizarPersonagemSchema, request.body, reply);
      if (!entrada) return;
      return responderResultado(
        reply,
        await deps.atualizarPersonagem.executar(request.usuarioId, personagemId, entrada),
      );
    },
  );

  // 204 sem corpo: não há representação do que deixou de existir, e devolver o
  // DTO apagado convidaria a interface a renderizá-lo (RV-093).
  app.delete(
    '/personagens/:personagemId',
    { preHandler: deps.autenticar },
    async (request, reply) => {
      const { personagemId } = request.params as { personagemId: string };
      const resultado = await deps.removerPersonagem.executar(request.usuarioId, personagemId);
      if (!resultado.ok) return responderErro(reply, resultado.erro);
      return reply.status(204).send();
    },
  );

  // POST sem corpo: duplicar não tem parâmetro nenhum — a cópia é derivada
  // inteiramente do original. Nomear a cópia é uma edição posterior.
  app.post(
    '/personagens/:personagemId/duplicar',
    { preHandler: deps.autenticar },
    async (request, reply) => {
      const { personagemId } = request.params as { personagemId: string };
      return responderResultado(
        reply,
        await deps.duplicarPersonagem.executar(request.usuarioId, personagemId),
        201,
      );
    },
  );
}
