import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { aplicarDanoSchema, iniciarCombateSchema, rolarIniciativaSchema } from '@rolavinte/shared';
import type { IniciarCombate } from '../../aplicacao/jogo/iniciar-combate';
import type { RolarIniciativa } from '../../aplicacao/jogo/rolar-iniciativa';
import type { PassarTurno } from '../../aplicacao/jogo/passar-turno';
import type { EncerrarCombate } from '../../aplicacao/jogo/encerrar-combate';
import type { ObterCombate } from '../../aplicacao/jogo/obter-combate';
import type { AplicarDano } from '../../aplicacao/jogo/aplicar-dano';
import { responderResultado } from './erros';
import { validarEntrada } from './validacao';

interface Deps {
  obterCombate: ObterCombate;
  iniciarCombate: IniciarCombate;
  rolarIniciativa: RolarIniciativa;
  passarTurno: PassarTurno;
  encerrarCombate: EncerrarCombate;
  aplicarDano: AplicarDano;
  autenticar: preHandlerAsyncHookHandler;
}

/**
 * Rotas do combate (RV-061, RV-062, RV-065).
 *
 * Duas formas de endereço, de propósito: o que é **da mesa** entra por
 * `/mesas/:mesaId/combate` (ler o combate em curso, começar um), porque quem
 * pergunta ainda não sabe o id do combate; o que é **do combate** entra por
 * `/combates/:combateId/…`, como já vale para cena e token. Nenhuma rota decide
 * autorização: todas devolvem `Result` do caso de uso ao mapa central de erros
 * (`nao-autorizado` → 403, `conflito` → 409, `validacao` → 400).
 */
export function registrarRotasCombate(app: FastifyInstance, deps: Deps): void {
  /** O combate em curso da mesa, ou `{ combate: null }` fora da luta (RV-063). */
  app.get('/mesas/:mesaId/combate', { preHandler: deps.autenticar }, async (request, reply) => {
    const { mesaId } = request.params as { mesaId: string };
    return responderResultado(reply, await deps.obterCombate.executar(request.usuarioId, mesaId));
  });

  app.post('/mesas/:mesaId/combate', { preHandler: deps.autenticar }, async (request, reply) => {
    const { mesaId } = request.params as { mesaId: string };
    const corpo = request.body as Record<string, unknown> | null;
    const entrada = validarEntrada(iniciarCombateSchema, { ...corpo, mesaId }, reply);
    if (!entrada) return;
    return responderResultado(
      reply,
      await deps.iniciarCombate.executar(request.usuarioId, entrada),
      201,
    );
  });

  /**
   * Rola a iniciativa de um participante.
   *
   * Devolve o combate **e** a mensagem que foi para o chat: quem rolou vê o
   * resultado na resposta sem depender do socket chegar primeiro, e é a mesma
   * mensagem que a sala recebeu — um total só.
   */
  app.post(
    '/combates/:combateId/iniciativa',
    { preHandler: deps.autenticar },
    async (request, reply) => {
      const { combateId } = request.params as { combateId: string };
      const entrada = validarEntrada(rolarIniciativaSchema, request.body ?? {}, reply);
      if (!entrada) return;
      return responderResultado(
        reply,
        await deps.rolarIniciativa.executar(request.usuarioId, combateId, entrada),
        201,
      );
    },
  );

  app.post(
    '/combates/:combateId/proximo-turno',
    { preHandler: deps.autenticar },
    async (request, reply) => {
      const { combateId } = request.params as { combateId: string };
      return responderResultado(
        reply,
        await deps.passarTurno.executar(request.usuarioId, combateId),
      );
    },
  );

  app.post(
    '/combates/:combateId/encerrar',
    { preHandler: deps.autenticar },
    async (request, reply) => {
      const { combateId } = request.params as { combateId: string };
      return responderResultado(
        reply,
        await deps.encerrarCombate.executar(request.usuarioId, combateId),
      );
    },
  );

  /**
   * Dano (delta negativo) ou cura (positivo) no participante.
   *
   * Devolve o `PersonagemDTO` porque é a ficha que muda — o combate não guarda PV
   * (RV-042). O `tokenId` vem do caminho, e não do corpo, porque ele identifica o
   * recurso: é o participante daquele combate que está levando o golpe.
   */
  app.post(
    '/combates/:combateId/participantes/:tokenId/pv',
    { preHandler: deps.autenticar },
    async (request, reply) => {
      const { combateId, tokenId } = request.params as { combateId: string; tokenId: string };
      const entrada = validarEntrada(aplicarDanoSchema, request.body ?? {}, reply);
      if (!entrada) return;
      return responderResultado(
        reply,
        await deps.aplicarDano.executar(request.usuarioId, combateId, tokenId, entrada.delta),
      );
    },
  );
}
