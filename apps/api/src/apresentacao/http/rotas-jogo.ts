import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import multipart from '@fastify/multipart';
import {
  atualizarCenaSchema,
  atualizarTokenSchema,
  CAMPO_IMAGEM_FUNDO,
  CAMPO_IMAGEM_TOKEN,
  comandoChatSchema,
  criarCenaSchema,
  criarTokenSchema,
  enviarMensagemSchema,
  moverTokenSchema,
  rolarDadosSchema,
  TAMANHO_MAXIMO_IMAGEM_FUNDO_BYTES,
  TAMANHO_MAXIMO_IMAGEM_TOKEN_BYTES,
} from '@rolavinte/shared';
import type { EnviarMensagem } from '../../aplicacao/jogo/enviar-mensagem';
import type { RolarDados } from '../../aplicacao/jogo/rolar-dados';
import type { ListarMensagens } from '../../aplicacao/jogo/listar-mensagens';
import type { ProcessarComandoChat } from '../../aplicacao/jogo/processar-comando-chat';
import type { CriarCena } from '../../aplicacao/jogo/criar-cena';
import type { ListarCenas } from '../../aplicacao/jogo/listar-cenas';
import type { AtualizarCena } from '../../aplicacao/jogo/atualizar-cena';
import type { RemoverCena } from '../../aplicacao/jogo/remover-cena';
import type { AtivarCena } from '../../aplicacao/jogo/ativar-cena';
import type { DefinirImagemFundoCena } from '../../aplicacao/jogo/definir-imagem-fundo-cena';
import type { ObterCenaAtiva } from '../../aplicacao/jogo/obter-cena-ativa';
import type { CriarToken } from '../../aplicacao/jogo/criar-token';
import type { MoverToken } from '../../aplicacao/jogo/mover-token';
import type { AtualizarToken } from '../../aplicacao/jogo/atualizar-token';
import type { DefinirImagemToken } from '../../aplicacao/jogo/definir-imagem-token';
import type { RemoverToken } from '../../aplicacao/jogo/remover-token';
import { responderResultado } from './erros';
import { validarEntrada } from './validacao';

interface Deps {
  enviarMensagem: EnviarMensagem;
  rolarDados: RolarDados;
  listarMensagens: ListarMensagens;
  processarComandoChat: ProcessarComandoChat;
  criarCena: CriarCena;
  listarCenas: ListarCenas;
  atualizarCena: AtualizarCena;
  removerCena: RemoverCena;
  ativarCena: AtivarCena;
  definirImagemFundoCena: DefinirImagemFundoCena;
  obterCenaAtiva: ObterCenaAtiva;
  criarToken: CriarToken;
  moverToken: MoverToken;
  atualizarToken: AtualizarToken;
  definirImagemToken: DefinirImagemToken;
  removerToken: RemoverToken;
  autenticar: preHandlerAsyncHookHandler;
}

/**
 * Maior arquivo que alguma rota aceita. Calculado (e não fixado num dos dois)
 * para que o dia em que os limites de mapa e de arte de token divergirem não
 * derrube silenciosamente o maior deles em 413.
 */
const MAIOR_ARQUIVO_ACEITO_BYTES = Math.max(
  TAMANHO_MAXIMO_IMAGEM_FUNDO_BYTES,
  TAMANHO_MAXIMO_IMAGEM_TOKEN_BYTES,
);

export function registrarRotasJogo(app: FastifyInstance, deps: Deps): void {
  // `limits.fileSize` abaixo é a ÚNICA defesa de tamanho nas rotas de upload.
  //
  // `bodyLimit` — global ou por rota — não vale para corpo multipart: o Fastify
  // só compara `content-length` com ele quando o parser é `asString`/`asBuffer`
  // (content-type-parser.js), e o @fastify/multipart registra um parser de
  // stream. Já houve um `bodyLimit` decorativo nestas duas rotas; foi removido
  // para não fingir uma segunda defesa que nunca existiu.
  //
  // O outro lado da moeda: quando `fileSize` não é informado, o plugin cai em
  // `fastify.initialConfig.bodyLimit` (256 KB, RV-004) e todo mapa real morre
  // em 413. Por isso ele é obrigatório aqui, não uma otimização.
  void app.register(multipart, {
    limits: {
      fileSize: MAIOR_ARQUIVO_ACEITO_BYTES,
      files: 1,
      fields: 0,
    },
  });

  app.get('/mesas/:mesaId/mensagens', { preHandler: deps.autenticar }, async (request, reply) => {
    const { mesaId } = request.params as { mesaId: string };
    return responderResultado(
      reply,
      await deps.listarMensagens.executar(request.usuarioId, mesaId),
    );
  });

  app.post('/mesas/:mesaId/mensagens', { preHandler: deps.autenticar }, async (request, reply) => {
    const { mesaId } = request.params as { mesaId: string };
    const corpo = request.body as Record<string, unknown> | null;
    const entrada = validarEntrada(enviarMensagemSchema, { ...corpo, mesaId }, reply);
    if (!entrada) return;
    return responderResultado(
      reply,
      await deps.enviarMensagem.executar(request.usuarioId, mesaId, entrada.conteudo),
      201,
    );
  });

  app.post('/mesas/:mesaId/rolagens', { preHandler: deps.autenticar }, async (request, reply) => {
    const { mesaId } = request.params as { mesaId: string };
    const corpo = request.body as Record<string, unknown> | null;
    const entrada = validarEntrada(rolarDadosSchema, { ...corpo, mesaId }, reply);
    if (!entrada) return;
    return responderResultado(
      reply,
      await deps.rolarDados.executar(request.usuarioId, mesaId, {
        expressao: entrada.expressao,
        motivo: entrada.motivo,
        // `oculta` é do cliente e não é confiável: quem decide se pode é o caso
        // de uso, com a guarda do mestre no agregado `Mesa` (RV-071).
        oculta: entrada.oculta,
      }),
      201,
    );
  });

  /**
   * Linha digitada no chat (RV-074). Uma rota só para todos os comandos: o
   * servidor reinterpreta o texto cru com o parser de `@rolavinte/shared` e
   * despacha pelo registry. Comando novo não acrescenta rota nem `if` aqui.
   *
   * As rotas `/mensagens` e `/rolagens` continuam existindo como as operações
   * diretas que sempre foram — o que muda é que a caixa de texto do chat passa
   * a falar com esta.
   */
  app.post('/mesas/:mesaId/chat', { preHandler: deps.autenticar }, async (request, reply) => {
    const { mesaId } = request.params as { mesaId: string };
    const corpo = request.body as Record<string, unknown> | null;
    const entrada = validarEntrada(comandoChatSchema, { ...corpo, mesaId }, reply);
    if (!entrada) return;
    return responderResultado(
      reply,
      await deps.processarComandoChat.executar(request.usuarioId, mesaId, entrada.texto),
      201,
    );
  });

  app.get('/mesas/:mesaId/cena', { preHandler: deps.autenticar }, async (request, reply) => {
    const { mesaId } = request.params as { mesaId: string };
    return responderResultado(reply, await deps.obterCenaAtiva.executar(request.usuarioId, mesaId));
  });

  app.post('/mesas/:mesaId/cenas', { preHandler: deps.autenticar }, async (request, reply) => {
    const { mesaId } = request.params as { mesaId: string };
    const corpo = request.body as Record<string, unknown> | null;
    const entrada = validarEntrada(criarCenaSchema, { ...corpo, mesaId }, reply);
    if (!entrada) return;
    return responderResultado(
      reply,
      await deps.criarCena.executar(request.usuarioId, entrada),
      201,
    );
  });

  app.get('/mesas/:mesaId/cenas', { preHandler: deps.autenticar }, async (request, reply) => {
    const { mesaId } = request.params as { mesaId: string };
    return responderResultado(reply, await deps.listarCenas.executar(request.usuarioId, mesaId));
  });

  app.patch('/cenas/:cenaId', { preHandler: deps.autenticar }, async (request, reply) => {
    const { cenaId } = request.params as { cenaId: string };
    const entrada = validarEntrada(atualizarCenaSchema, request.body ?? {}, reply);
    if (!entrada) return;
    return responderResultado(
      reply,
      await deps.atualizarCena.executar(request.usuarioId, cenaId, entrada),
    );
  });

  app.delete('/cenas/:cenaId', { preHandler: deps.autenticar }, async (request, reply) => {
    const { cenaId } = request.params as { cenaId: string };
    const resultado = await deps.removerCena.executar(request.usuarioId, cenaId);
    if (!resultado.ok) return responderResultado(reply, resultado);
    return reply.status(204).send();
  });

  app.post('/cenas/:cenaId/ativar', { preHandler: deps.autenticar }, async (request, reply) => {
    const { cenaId } = request.params as { cenaId: string };
    return responderResultado(reply, await deps.ativarCena.executar(request.usuarioId, cenaId));
  });

  app.post('/cenas/:cenaId/fundo', { preHandler: deps.autenticar }, async (request, reply) => {
    const { cenaId } = request.params as { cenaId: string };
    const arquivo = await request.file();
    if (!arquivo) {
      return reply
        .status(400)
        .send({ erro: `Envie a imagem do mapa no campo "${CAMPO_IMAGEM_FUNDO}".` });
    }
    // Estoura o limite de tamanho → o plugin lança 413, traduzido em PT-BR
    // pelo handler global de erros. Tipo e tamanho são decididos no caso de uso.
    const conteudo = await arquivo.toBuffer();
    return responderResultado(
      reply,
      await deps.definirImagemFundoCena.executar(request.usuarioId, cenaId, {
        tipo: arquivo.mimetype,
        conteudo,
      }),
    );
  });

  app.post('/cenas/:cenaId/tokens', { preHandler: deps.autenticar }, async (request, reply) => {
    const { cenaId } = request.params as { cenaId: string };
    const corpo = request.body as Record<string, unknown> | null;
    const entrada = validarEntrada(criarTokenSchema, { ...corpo, cenaId }, reply);
    if (!entrada) return;
    return responderResultado(
      reply,
      await deps.criarToken.executar(request.usuarioId, entrada),
      201,
    );
  });

  app.patch('/tokens/:tokenId/posicao', { preHandler: deps.autenticar }, async (request, reply) => {
    const { tokenId } = request.params as { tokenId: string };
    const corpo = request.body as Record<string, unknown> | null;
    const entrada = validarEntrada(moverTokenSchema, { ...corpo, tokenId }, reply);
    if (!entrada) return;
    return responderResultado(reply, await deps.moverToken.executar(request.usuarioId, entrada));
  });

  app.patch('/tokens/:tokenId', { preHandler: deps.autenticar }, async (request, reply) => {
    const { tokenId } = request.params as { tokenId: string };
    const entrada = validarEntrada(atualizarTokenSchema, request.body ?? {}, reply);
    if (!entrada) return;
    return responderResultado(
      reply,
      await deps.atualizarToken.executar(request.usuarioId, tokenId, entrada),
    );
  });

  app.post('/tokens/:tokenId/imagem', { preHandler: deps.autenticar }, async (request, reply) => {
    const { tokenId } = request.params as { tokenId: string };
    const arquivo = await request.file();
    if (!arquivo) {
      return reply
        .status(400)
        .send({ erro: `Envie a arte do token no campo "${CAMPO_IMAGEM_TOKEN}".` });
    }
    const conteudo = await arquivo.toBuffer();
    return responderResultado(
      reply,
      await deps.definirImagemToken.executar(request.usuarioId, tokenId, {
        tipo: arquivo.mimetype,
        conteudo,
      }),
    );
  });

  app.delete('/tokens/:tokenId', { preHandler: deps.autenticar }, async (request, reply) => {
    const { tokenId } = request.params as { tokenId: string };
    const resultado = await deps.removerToken.executar(request.usuarioId, tokenId);
    if (!resultado.ok) return responderResultado(reply, resultado);
    return reply.status(204).send();
  });
}
