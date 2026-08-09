import type { FastifyError, FastifyInstance, FastifyReply } from 'fastify';
import type { ErroDominio, TipoErroDominio } from '../../dominio/compartilhado/erro-dominio';
import type { Result } from '../../dominio/compartilhado/resultado';

const STATUS_POR_TIPO: Record<TipoErroDominio, number> = {
  validacao: 400,
  'nao-autorizado': 403,
  'nao-encontrado': 404,
  conflito: 409,
};

/** Corpo devolvido em qualquer falha não prevista. Nunca revela a causa real. */
export const MENSAGEM_ERRO_INTERNO = 'Erro interno. Tente novamente.';

/** Reaproveitada pelo `errorResponseBuilder` do rate limit (app.ts). */
export const MENSAGEM_LIMITE_REQUISICOES =
  'Muitas requisições. Aguarde um instante e tente novamente.';

export const MENSAGEM_ROTA_NAO_ENCONTRADA = 'Rota não encontrada.';

/**
 * Mensagens públicas por status. Só o que está aqui chega ao cliente: a
 * mensagem original do erro pode conter detalhe de infraestrutura.
 */
const MENSAGEM_POR_STATUS: Record<number, string> = {
  400: 'Requisição inválida.',
  401: 'Autenticação necessária.',
  403: 'Acesso negado.',
  404: MENSAGEM_ROTA_NAO_ENCONTRADA,
  405: 'Método não permitido.',
  406: 'Formato de resposta não suportado.',
  409: 'Conflito com o estado atual do recurso.',
  413: 'Corpo da requisição excede o limite permitido.',
  415: 'Tipo de conteúdo não suportado.',
  429: MENSAGEM_LIMITE_REQUISICOES,
};

/** Códigos do Fastify que merecem uma mensagem mais precisa que a do status. */
const MENSAGEM_POR_CODIGO: Record<string, string> = {
  FST_ERR_CTP_BODY_TOO_LARGE: 'Corpo da requisição excede o limite permitido.',
  FST_ERR_CTP_INVALID_JSON_BODY: 'JSON inválido no corpo da requisição.',
  FST_ERR_CTP_EMPTY_JSON_BODY: 'Corpo da requisição vazio.',
  FST_ERR_CTP_INVALID_MEDIA_TYPE: 'Tipo de conteúdo não suportado.',
  FST_ERR_CTP_INVALID_CONTENT_LENGTH: 'Cabeçalho Content-Length inválido.',
};

function statusHttp(erro: FastifyError): number {
  const status = erro.statusCode;
  if (typeof status !== 'number' || status < 400 || status > 599) return 500;
  return status;
}

function mensagemPublica(erro: FastifyError, status: number): string {
  const porCodigo = erro.code ? MENSAGEM_POR_CODIGO[erro.code] : undefined;
  return porCodigo ?? MENSAGEM_POR_STATUS[status] ?? 'Requisição inválida.';
}

/**
 * Handler global de erros e de rota inexistente.
 *
 * Toda resposta de erro sai no mesmo formato das rotas (`{ erro }`) acrescida do
 * `requisicaoId`, que é o mesmo id gravado no log — é por ele que se investiga o
 * incidente. Stack trace e mensagem interna ficam **somente** no log.
 */
export function registrarTratamentoDeErros(app: FastifyInstance): void {
  app.setErrorHandler((erro: FastifyError, requisicao, resposta) => {
    const requisicaoId = requisicao.id;
    const status = statusHttp(erro);

    if (status >= 500) {
      requisicao.log.error({ err: erro, requisicaoId }, 'erro nao tratado na requisicao');
      return resposta.status(500).send({ erro: MENSAGEM_ERRO_INTERNO, requisicaoId });
    }

    requisicao.log.warn({ err: erro, requisicaoId }, 'requisicao rejeitada');
    return resposta.status(status).send({ erro: mensagemPublica(erro, status), requisicaoId });
  });

  app.setNotFoundHandler((requisicao, resposta) =>
    resposta.status(404).send({ erro: MENSAGEM_ROTA_NAO_ENCONTRADA, requisicaoId: requisicao.id }),
  );
}

/** Único ponto de tradução ErroDominio → HTTP. */
export function responderErro(reply: FastifyReply, erro: ErroDominio): FastifyReply {
  return reply.status(STATUS_POR_TIPO[erro.tipo]).send({ erro: erro.mensagem });
}

export function responderResultado<T>(
  reply: FastifyReply,
  resultado: Result<T>,
  statusOk = 200,
): FastifyReply {
  if (!resultado.ok) return responderErro(reply, resultado.erro);
  return reply.status(statusOk).send(resultado.valor);
}
