import { randomUUID } from 'node:crypto';
import Fastify, {
  type FastifyInstance,
  type FastifyRequest,
  type FastifyServerOptions,
} from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimitPlugin from '@fastify/rate-limit';

import type { ServicoToken } from './aplicacao/ports/infraestrutura';

import type { RegistrarUsuario } from './aplicacao/contas/registrar-usuario';
import type { AutenticarUsuario } from './aplicacao/contas/autenticar-usuario';
import type { ObterUsuarioAtual } from './aplicacao/contas/obter-usuario-atual';
import type { CriarMesa } from './aplicacao/mesas/criar-mesa';
import type { ListarMesas } from './aplicacao/mesas/listar-mesas';
import type { ObterMesa } from './aplicacao/mesas/obter-mesa';
import type { AtualizarMesa } from './aplicacao/mesas/atualizar-mesa';
import type { EncerrarMesa } from './aplicacao/mesas/encerrar-mesa';
import type { ConvidarJogador } from './aplicacao/mesas/convidar-jogador';
import type { ListarConvites } from './aplicacao/mesas/listar-convites';
import type { RevogarConvite } from './aplicacao/mesas/revogar-convite';
import type { RemoverJogador } from './aplicacao/mesas/remover-jogador';
import type { SairDaMesa } from './aplicacao/mesas/sair-da-mesa';
import type { ObterConvitePublico } from './aplicacao/mesas/obter-convite-publico';
import type { AceitarConvite } from './aplicacao/mesas/aceitar-convite';
import type { CriarPersonagem } from './aplicacao/personagens/criar-personagem';
import type { ListarPersonagens } from './aplicacao/personagens/listar-personagens';
import type { AtualizarPersonagem } from './aplicacao/personagens/atualizar-personagem';
import type { RemoverPersonagem } from './aplicacao/personagens/remover-personagem';
import type { DuplicarPersonagem } from './aplicacao/personagens/duplicar-personagem';
import type { EnviarMensagem } from './aplicacao/jogo/enviar-mensagem';
import type { RolarDados } from './aplicacao/jogo/rolar-dados';
import type { ListarMensagens } from './aplicacao/jogo/listar-mensagens';
import type { ProcessarComandoChat } from './aplicacao/jogo/processar-comando-chat';
import type { CriarCena } from './aplicacao/jogo/criar-cena';
import type { ListarCenas } from './aplicacao/jogo/listar-cenas';
import type { AtualizarCena } from './aplicacao/jogo/atualizar-cena';
import type { RemoverCena } from './aplicacao/jogo/remover-cena';
import type { AtivarCena } from './aplicacao/jogo/ativar-cena';
import type { DefinirImagemFundoCena } from './aplicacao/jogo/definir-imagem-fundo-cena';
import type { ObterCenaAtiva } from './aplicacao/jogo/obter-cena-ativa';
import type { CriarToken } from './aplicacao/jogo/criar-token';
import type { MoverToken } from './aplicacao/jogo/mover-token';
import type { AtualizarToken } from './aplicacao/jogo/atualizar-token';
import type { DefinirImagemToken } from './aplicacao/jogo/definir-imagem-token';
import type { RemoverToken } from './aplicacao/jogo/remover-token';

import { criarAutenticador } from './apresentacao/http/autenticacao';
import { MENSAGEM_LIMITE_REQUISICOES, registrarTratamentoDeErros } from './apresentacao/http/erros';
import { endurecerLogger } from './apresentacao/http/log-seguro';
import { registrarRotasAuth } from './apresentacao/http/rotas-auth';
import { registrarRotasMesas } from './apresentacao/http/rotas-mesas';
import { registrarRotasPersonagens } from './apresentacao/http/rotas-personagens';
import { registrarRotasJogo } from './apresentacao/http/rotas-jogo';

/** Casos de uso expostos pela API HTTP, injetados pelo composition root. */
export interface CasosDeUsoHttp {
  registrarUsuario: RegistrarUsuario;
  autenticarUsuario: AutenticarUsuario;
  obterUsuarioAtual: ObterUsuarioAtual;
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
  criarPersonagem: CriarPersonagem;
  listarPersonagens: ListarPersonagens;
  atualizarPersonagem: AtualizarPersonagem;
  removerPersonagem: RemoverPersonagem;
  duplicarPersonagem: DuplicarPersonagem;
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
}

export interface DependenciasHttp extends CasosDeUsoHttp {
  servicoToken: ServicoToken;
}

/** Limite de requisições por IP, por janela de tempo. */
export interface OpcoesRateLimit {
  /** Teto global de requisições por IP na janela. */
  max: number;
  /** Duração da janela, em milissegundos. */
  janelaMs: number;
  /** Teto reduzido para as rotas de autenticação (força bruta). */
  maxAutenticacao: number;
}

export interface OpcoesServidorHttp {
  /** Origem permitida no CORS (front). */
  origemWeb: string;
  /** Configuração do logger do Fastify; `false` (padrão) silencia — usado nos testes. */
  logger?: FastifyServerOptions['logger'];
  /**
   * Rate limit por IP. `false` desliga o plugin — é o que o harness de teste usa,
   * senão dezenas de `inject` no mesmo IP derrubariam os contratos das outras rotas.
   */
  rateLimit?: OpcoesRateLimit | false;
  /** Tamanho máximo do corpo aceito, em bytes. */
  limiteCorpoBytes?: number;
}

/** 256 KB: upload de arquivo tem rota própria e não passa por aqui. */
export const LIMITE_CORPO_PADRAO_BYTES = 256 * 1024;

export const RATE_LIMIT_PADRAO: OpcoesRateLimit = {
  max: 300,
  janelaMs: 60_000,
  maxAutenticacao: 10,
};

/** Rotas que ganham o teto reduzido e um balde de contagem próprio. */
export const ROTAS_AUTENTICACAO_SENSIVEIS: ReadonlySet<string> = new Set([
  '/api/auth/login',
  '/api/auth/registrar',
]);

/** Cabeçalho de correlação devolvido em toda resposta. */
export const CABECALHO_REQUISICAO_ID = 'x-requisicao-id';

function ehRotaSensivel(requisicao: FastifyRequest): boolean {
  const caminho = requisicao.routeOptions.url ?? requisicao.url.split('?')[0] ?? requisicao.url;
  return ROTAS_AUTENTICACAO_SENSIVEIS.has(caminho);
}

/**
 * Cria o servidor HTTP sem nenhuma dependência de negócio.
 *
 * Fica separado de `registrarRotas` porque o Socket.IO é construído a partir de
 * `app.server` e o `PublicadorSocket` (que depende do io) é injetado nos casos
 * de uso: montar tudo numa única função criaria um ciclo.
 */
export function criarServidorHttp(opcoes: OpcoesServidorHttp): FastifyInstance {
  const app = Fastify({
    logger: endurecerLogger(opcoes.logger),
    bodyLimit: opcoes.limiteCorpoBytes ?? LIMITE_CORPO_PADRAO_BYTES,
    // O id de requisição é sempre nosso: aceitar o do cliente permitiria forjar
    // correlação e envenenar o log com conteúdo arbitrário.
    requestIdHeader: false,
    genReqId: () => randomUUID(),
  });

  registrarTratamentoDeErros(app);

  void app.register(helmet, {
    // A API só devolve JSON: nada deve ser carregado a partir dela.
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { 'default-src': ["'none'"], 'frame-ancestors': ["'none'"] },
    },
    // O front vive em outra origem e consome estes recursos via fetch com CORS.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  void app.register(cors, {
    origin: opcoes.origemWeb,
    exposedHeaders: [CABECALHO_REQUISICAO_ID],
  });

  const limites = opcoes.rateLimit ?? RATE_LIMIT_PADRAO;
  if (limites !== false) {
    void app.register(rateLimitPlugin, {
      timeWindow: limites.janelaMs,
      max: (requisicao: FastifyRequest) =>
        ehRotaSensivel(requisicao) ? limites.maxAutenticacao : limites.max,
      // Balde separado: navegar pela aplicação não deve consumir as tentativas
      // de login, nem o contrário.
      keyGenerator: (requisicao: FastifyRequest) =>
        ehRotaSensivel(requisicao) ? `auth:${requisicao.ip}` : requisicao.ip,
      // O plugin lança este erro; o handler global o converte em `{ erro }`.
      // O cabeçalho Retry-After já foi escrito na resposta neste ponto.
      errorResponseBuilder: () =>
        Object.assign(new Error(MENSAGEM_LIMITE_REQUISICOES), { statusCode: 429 }),
    });
  }

  app.addHook('onRequest', async (requisicao, resposta) => {
    resposta.header(CABECALHO_REQUISICAO_ID, requisicao.id);
  });

  app.get('/api/saude', async () => ({ ok: true, servico: 'rolavinte-api' }));

  return app;
}

/** Registra o prefixo /api com todas as rotas e o preHandler de autenticação. */
export function registrarRotas(app: FastifyInstance, dependencias: DependenciasHttp): void {
  const autenticar = criarAutenticador(dependencias.servicoToken);
  const rotas = { ...dependencias, autenticar };

  void app.register(
    async (api) => {
      registrarRotasAuth(api, rotas);
      registrarRotasMesas(api, rotas);
      registrarRotasPersonagens(api, rotas);
      registrarRotasJogo(api, rotas);
    },
    { prefix: '/api' },
  );
}
