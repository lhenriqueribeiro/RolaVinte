import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { loginSchema, registrarSchema } from '@rolavinte/shared';
import type { RegistrarUsuario } from '../../aplicacao/contas/registrar-usuario';
import type { AutenticarUsuario } from '../../aplicacao/contas/autenticar-usuario';
import type { ObterUsuarioAtual } from '../../aplicacao/contas/obter-usuario-atual';
import { responderResultado } from './erros';
import { validarEntrada } from './validacao';

interface Deps {
  registrarUsuario: RegistrarUsuario;
  autenticarUsuario: AutenticarUsuario;
  obterUsuarioAtual: ObterUsuarioAtual;
  autenticar: preHandlerAsyncHookHandler;
}

export function registrarRotasAuth(app: FastifyInstance, deps: Deps): void {
  app.post('/auth/registrar', async (request, reply) => {
    const entrada = validarEntrada(registrarSchema, request.body, reply);
    if (!entrada) return;
    return responderResultado(reply, await deps.registrarUsuario.executar(entrada), 201);
  });

  app.post('/auth/login', async (request, reply) => {
    const entrada = validarEntrada(loginSchema, request.body, reply);
    if (!entrada) return;
    return responderResultado(reply, await deps.autenticarUsuario.executar(entrada));
  });

  app.get('/auth/eu', { preHandler: deps.autenticar }, async (request, reply) => {
    return responderResultado(reply, await deps.obterUsuarioAtual.executar(request.usuarioId));
  });
}
