import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { atualizarPersonagemSchema, criarPersonagemSchema } from '@rolavinte/shared';
import type { CriarPersonagem } from '../../aplicacao/personagens/criar-personagem';
import type { ListarPersonagens } from '../../aplicacao/personagens/listar-personagens';
import type { AtualizarPersonagem } from '../../aplicacao/personagens/atualizar-personagem';
import { responderResultado } from './erros';
import { validarEntrada } from './validacao';

interface Deps {
  criarPersonagem: CriarPersonagem;
  listarPersonagens: ListarPersonagens;
  atualizarPersonagem: AtualizarPersonagem;
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
}
