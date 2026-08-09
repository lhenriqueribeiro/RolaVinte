import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import {
  aceitarConviteSchema,
  atualizarMesaSchema,
  convidarJogadorSchema,
  criarMesaSchema,
} from '@rolavinte/shared';
import type { CriarMesa } from '../../aplicacao/mesas/criar-mesa';
import type { ListarMesas } from '../../aplicacao/mesas/listar-mesas';
import type { ObterMesa } from '../../aplicacao/mesas/obter-mesa';
import type { AtualizarMesa } from '../../aplicacao/mesas/atualizar-mesa';
import type { EncerrarMesa } from '../../aplicacao/mesas/encerrar-mesa';
import type { ConvidarJogador } from '../../aplicacao/mesas/convidar-jogador';
import type { ListarConvites } from '../../aplicacao/mesas/listar-convites';
import type { RevogarConvite } from '../../aplicacao/mesas/revogar-convite';
import type { RemoverJogador } from '../../aplicacao/mesas/remover-jogador';
import type { SairDaMesa } from '../../aplicacao/mesas/sair-da-mesa';
import type { ObterConvitePublico } from '../../aplicacao/mesas/obter-convite-publico';
import type { AceitarConvite } from '../../aplicacao/mesas/aceitar-convite';
import { responderResultado } from './erros';
import { validarEntrada } from './validacao';

interface Deps {
  criarMesa: CriarMesa;
  listarMesas: ListarMesas;
  obterMesa: ObterMesa;
  atualizarMesa: AtualizarMesa;
  encerrarMesa: EncerrarMesa;
  convidarJogador: ConvidarJogador;
  listarConvites: ListarConvites;
  revogarConvite: RevogarConvite;
  removerJogador: RemoverJogador;
  sairDaMesa: SairDaMesa;
  obterConvitePublico: ObterConvitePublico;
  aceitarConvite: AceitarConvite;
  autenticar: preHandlerAsyncHookHandler;
}

export function registrarRotasMesas(app: FastifyInstance, deps: Deps): void {
  app.get('/mesas', { preHandler: deps.autenticar }, async (request, reply) => {
    return responderResultado(reply, await deps.listarMesas.executar(request.usuarioId));
  });

  app.post('/mesas', { preHandler: deps.autenticar }, async (request, reply) => {
    const entrada = validarEntrada(criarMesaSchema, request.body, reply);
    if (!entrada) return;
    return responderResultado(
      reply,
      await deps.criarMesa.executar(request.usuarioId, entrada),
      201,
    );
  });

  app.get('/mesas/:mesaId', { preHandler: deps.autenticar }, async (request, reply) => {
    const { mesaId } = request.params as { mesaId: string };
    return responderResultado(reply, await deps.obterMesa.executar(request.usuarioId, mesaId));
  });

  app.patch('/mesas/:mesaId', { preHandler: deps.autenticar }, async (request, reply) => {
    const { mesaId } = request.params as { mesaId: string };
    const entrada = validarEntrada(atualizarMesaSchema, request.body, reply);
    if (!entrada) return;
    return responderResultado(
      reply,
      await deps.atualizarMesa.executar(request.usuarioId, mesaId, entrada),
    );
  });

  app.post('/mesas/:mesaId/encerrar', { preHandler: deps.autenticar }, async (request, reply) => {
    const { mesaId } = request.params as { mesaId: string };
    return responderResultado(
      reply,
      await deps.encerrarMesa.executar(request.usuarioId, mesaId),
      204,
    );
  });

  app.post('/mesas/:mesaId/sair', { preHandler: deps.autenticar }, async (request, reply) => {
    const { mesaId } = request.params as { mesaId: string };
    return responderResultado(
      reply,
      await deps.sairDaMesa.executar(request.usuarioId, mesaId),
      204,
    );
  });

  app.delete(
    '/mesas/:mesaId/jogadores/:usuarioId',
    { preHandler: deps.autenticar },
    async (request, reply) => {
      const { mesaId, usuarioId } = request.params as { mesaId: string; usuarioId: string };
      return responderResultado(
        reply,
        await deps.removerJogador.executar(request.usuarioId, mesaId, usuarioId),
        204,
      );
    },
  );

  app.get('/mesas/:mesaId/convites', { preHandler: deps.autenticar }, async (request, reply) => {
    const { mesaId } = request.params as { mesaId: string };
    return responderResultado(reply, await deps.listarConvites.executar(request.usuarioId, mesaId));
  });

  app.post('/mesas/:mesaId/convites', { preHandler: deps.autenticar }, async (request, reply) => {
    const { mesaId } = request.params as { mesaId: string };
    const entrada = validarEntrada(convidarJogadorSchema, request.body, reply);
    if (!entrada) return;
    return responderResultado(
      reply,
      await deps.convidarJogador.executar(request.usuarioId, mesaId, entrada.email),
      201,
    );
  });

  app.delete(
    '/mesas/:mesaId/convites/:conviteId',
    { preHandler: deps.autenticar },
    async (request, reply) => {
      const { mesaId, conviteId } = request.params as { mesaId: string; conviteId: string };
      return responderResultado(
        reply,
        await deps.revogarConvite.executar(request.usuarioId, mesaId, conviteId),
        204,
      );
    },
  );

  // Rota pública: página de convite antes do login.
  app.get('/convites/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    return responderResultado(reply, await deps.obterConvitePublico.executar(token));
  });

  app.post('/convites/aceitar', { preHandler: deps.autenticar }, async (request, reply) => {
    const entrada = validarEntrada(aceitarConviteSchema, request.body, reply);
    if (!entrada) return;
    return responderResultado(
      reply,
      await deps.aceitarConvite.executar(request.usuarioId, entrada.token),
    );
  });
}
