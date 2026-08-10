import type { FastifyInstance, FastifyServerOptions } from 'fastify';
import type { Rng, SessaoDTO, UsuarioDTO } from '@rolavinte/shared';

import { criarServidorHttp, registrarRotas, type OpcoesRateLimit } from '../app';
import { ServicoRolagemDados } from '../dominio/jogo/servico-rolagem';
import type { JogadorConvidado } from '../dominio/mesas/eventos';

import { RegistrarUsuario } from '../aplicacao/contas/registrar-usuario';
import { AutenticarUsuario } from '../aplicacao/contas/autenticar-usuario';
import { ObterUsuarioAtual } from '../aplicacao/contas/obter-usuario-atual';
import { CriarMesa } from '../aplicacao/mesas/criar-mesa';
import { ListarMesas } from '../aplicacao/mesas/listar-mesas';
import { ObterMesa } from '../aplicacao/mesas/obter-mesa';
import { AtualizarMesa } from '../aplicacao/mesas/atualizar-mesa';
import { EncerrarMesa } from '../aplicacao/mesas/encerrar-mesa';
import { ConvidarJogador } from '../aplicacao/mesas/convidar-jogador';
import { ListarConvites } from '../aplicacao/mesas/listar-convites';
import { RevogarConvite } from '../aplicacao/mesas/revogar-convite';
import { RemoverJogador } from '../aplicacao/mesas/remover-jogador';
import { SairDaMesa } from '../aplicacao/mesas/sair-da-mesa';
import { ObterConvitePublico } from '../aplicacao/mesas/obter-convite-publico';
import { AceitarConvite } from '../aplicacao/mesas/aceitar-convite';
import { CriarPersonagem } from '../aplicacao/personagens/criar-personagem';
import { ListarPersonagens } from '../aplicacao/personagens/listar-personagens';
import { AtualizarPersonagem } from '../aplicacao/personagens/atualizar-personagem';
import { RemoverPersonagem } from '../aplicacao/personagens/remover-personagem';
import { DuplicarPersonagem } from '../aplicacao/personagens/duplicar-personagem';
import { EnviarMensagem } from '../aplicacao/jogo/enviar-mensagem';
import { RolarDados } from '../aplicacao/jogo/rolar-dados';
import { ListarMensagens } from '../aplicacao/jogo/listar-mensagens';
import { EnviarSussurro } from '../aplicacao/jogo/enviar-sussurro';
import { RegistroComandosChat } from '../aplicacao/jogo/comandos-chat';
import { ProcessarComandoChat } from '../aplicacao/jogo/processar-comando-chat';
import { CriarCena } from '../aplicacao/jogo/criar-cena';
import { ListarCenas } from '../aplicacao/jogo/listar-cenas';
import { AtualizarCena } from '../aplicacao/jogo/atualizar-cena';
import { RemoverCena } from '../aplicacao/jogo/remover-cena';
import { AtivarCena } from '../aplicacao/jogo/ativar-cena';
import { DefinirImagemFundoCena } from '../aplicacao/jogo/definir-imagem-fundo-cena';
import { ObterCenaAtiva } from '../aplicacao/jogo/obter-cena-ativa';
import { CriarToken } from '../aplicacao/jogo/criar-token';
import { MoverToken } from '../aplicacao/jogo/mover-token';
import { AtualizarToken } from '../aplicacao/jogo/atualizar-token';
import { DefinirImagemToken } from '../aplicacao/jogo/definir-imagem-token';
import { RemoverToken } from '../aplicacao/jogo/remover-token';

import { EventBusMemoria } from '../infra/eventos/event-bus-memoria';
import { JwtServicoToken } from '../infra/auth/jwt-servico-token';
import { templateConvite } from '../infra/email/templates/convite';

import {
  FakeArmazenamentoArquivos,
  FakeCenaRepository,
  FakeMensagemRepository,
  FakeMesaRepository,
  FakePersonagemRepository,
  FakePublicadorEventosMesa,
  FakeServicoEmail,
  FakeServicoSenha,
  FakeUsuarioRepository,
  GeradorIdSequencial,
  RelogioFixo,
} from './fakes';

/** Origem usada no CORS e nos links de convite dos testes. */
export const ORIGEM_WEB_TESTE = 'http://localhost:5173';

/** Segredo fixo: o JWT dos testes é real, mas não depende de variável de ambiente. */
const JWT_SEGREDO_TESTE = 'segredo-de-teste-rolavinte';

const SENHA_PADRAO = 'senha-de-teste';

export interface FakesDeTeste {
  usuarios: FakeUsuarioRepository;
  mesas: FakeMesaRepository;
  personagens: FakePersonagemRepository;
  cenas: FakeCenaRepository;
  mensagens: FakeMensagemRepository;
  email: FakeServicoEmail;
  armazenamento: FakeArmazenamentoArquivos;
  /** Bucket separado das artes de token (RV-041) — espelha os dois do `main.ts`. */
  armazenamentoTokens: FakeArmazenamentoArquivos;
  publicador: FakePublicadorEventosMesa;
  geradorId: GeradorIdSequencial;
  relogio: RelogioFixo;
  servicoSenha: FakeServicoSenha;
  servicoToken: JwtServicoToken;
  eventBus: EventBusMemoria;
}

export interface SessaoDeTeste {
  usuario: UsuarioDTO;
  token: string;
  senha: string;
  /** Pronto para `app.inject({ headers: sessao.cabecalhos })`. */
  cabecalhos: { authorization: string };
}

export interface DadosDeRegistro {
  nome?: string;
  email?: string;
  senha?: string;
}

export interface OpcoesAppDeTeste {
  /** RNG do motor de dados; padrão determinístico (sempre o valor máximo). */
  rng?: Rng;
  /** Instante do relógio fixo. */
  agora?: Date;
  /**
   * Rate limit por IP. Desligado por padrão: todos os `inject` saem do mesmo IP
   * e o limite estouraria nos contratos das outras rotas. Ligue só no teste que
   * exercita o próprio limite.
   */
  rateLimit?: OpcoesRateLimit | false;
  /** Logger do Fastify; silencioso por padrão. Use para inspecionar o log. */
  logger?: FastifyServerOptions['logger'];
}

export interface AppDeTeste {
  app: FastifyInstance;
  fakes: FakesDeTeste;
  /** Registra um usuário novo e devolve token + header Authorization prontos. */
  autenticarComo(dados?: DadosDeRegistro): Promise<SessaoDeTeste>;
  /** Dá um tick no loop para os assinantes assíncronos do EventBus rodarem. */
  aguardarEventos(): Promise<void>;
  encerrar(): Promise<void>;
}

/**
 * Composition root dos testes de contrato: mesma montagem do `main.ts`, mas com
 * adaptadores em memória. Não lê `process.env`, não abre porta, não usa rede.
 */
export function criarAppDeTeste(opcoes: OpcoesAppDeTeste = {}): AppDeTeste {
  const app = criarServidorHttp({
    origemWeb: ORIGEM_WEB_TESTE,
    rateLimit: opcoes.rateLimit ?? false,
    logger: opcoes.logger,
  });

  const usuarios = new FakeUsuarioRepository();
  const mesas = new FakeMesaRepository(usuarios);
  const personagens = new FakePersonagemRepository(usuarios);
  const cenas = new FakeCenaRepository();
  const mensagens = new FakeMensagemRepository();

  const email = new FakeServicoEmail();
  const armazenamento = new FakeArmazenamentoArquivos();
  const armazenamentoTokens = new FakeArmazenamentoArquivos();
  const publicador = new FakePublicadorEventosMesa();
  const geradorId = new GeradorIdSequencial();
  const relogio = new RelogioFixo(opcoes.agora);
  const servicoSenha = new FakeServicoSenha();
  const servicoToken = new JwtServicoToken(JWT_SEGREDO_TESTE);
  const errosDeEvento: unknown[] = [];
  const eventBus = new EventBusMemoria((erro) => errosDeEvento.push(erro));
  const servicoRolagem = new ServicoRolagemDados(opcoes.rng ?? (() => 0.999));

  eventBus.assinar('mesas.jogador-convidado', async (evento) => {
    const { dados } = evento as JogadorConvidado;
    const urlConvite = `${ORIGEM_WEB_TESTE}/convites/${dados.tokenConvite}`;
    const corpo = templateConvite({
      mesaNome: dados.mesaNome,
      nomeMestre: dados.nomeMestre,
      urlConvite,
    });
    await email.enviar({ para: dados.emailConvidado, assunto: corpo.assunto, html: corpo.html });
  });

  // Registry de comandos de chat (RV-074) — mesma montagem do `main.ts`: os
  // casos de uso do chat vêm antes porque o registry os compõe, e o `Record` de
  // manipuladores recusa comando sem dono nos dois composition roots.
  const enviarMensagem = new EnviarMensagem(
    mensagens,
    mesas,
    usuarios,
    geradorId,
    relogio,
    publicador,
  );
  const rolarDados = new RolarDados(
    mensagens,
    mesas,
    usuarios,
    servicoRolagem,
    geradorId,
    relogio,
    publicador,
  );
  const enviarSussurro = new EnviarSussurro(
    mensagens,
    mesas,
    usuarios,
    geradorId,
    relogio,
    publicador,
  );
  const registroComandos = new RegistroComandosChat({
    fala: (ctx, comando) => enviarMensagem.executar(ctx.usuarioId, ctx.mesaId, comando.conteudo),
    rolagem: (ctx, comando) =>
      rolarDados.executar(ctx.usuarioId, ctx.mesaId, {
        expressao: comando.expressao,
        motivo: comando.motivo,
        cd: comando.cd,
      }),
    'rolagem-oculta': (ctx, comando) =>
      rolarDados.executar(ctx.usuarioId, ctx.mesaId, {
        expressao: comando.expressao,
        motivo: comando.motivo,
        cd: comando.cd,
        oculta: true,
      }),
    sussurro: (ctx, comando) =>
      enviarSussurro.executar(ctx.usuarioId, ctx.mesaId, comando.destinatario, comando.conteudo),
  });

  registrarRotas(app, {
    registrarUsuario: new RegistrarUsuario(
      usuarios,
      servicoSenha,
      servicoToken,
      geradorId,
      relogio,
    ),
    autenticarUsuario: new AutenticarUsuario(usuarios, servicoSenha, servicoToken),
    obterUsuarioAtual: new ObterUsuarioAtual(usuarios),
    criarMesa: new CriarMesa(mesas, usuarios, geradorId, relogio),
    listarMesas: new ListarMesas(mesas),
    obterMesa: new ObterMesa(mesas, usuarios),
    atualizarMesa: new AtualizarMesa(mesas, usuarios),
    encerrarMesa: new EncerrarMesa(mesas, relogio),
    convidarJogador: new ConvidarJogador(mesas, usuarios, geradorId, relogio, eventBus),
    listarConvites: new ListarConvites(mesas),
    revogarConvite: new RevogarConvite(mesas),
    removerJogador: new RemoverJogador(mesas, publicador),
    sairDaMesa: new SairDaMesa(mesas, publicador),
    obterConvitePublico: new ObterConvitePublico(mesas, usuarios),
    aceitarConvite: new AceitarConvite(mesas, usuarios, relogio),
    criarPersonagem: new CriarPersonagem(personagens, mesas, usuarios, geradorId),
    listarPersonagens: new ListarPersonagens(personagens, mesas),
    atualizarPersonagem: new AtualizarPersonagem(personagens, mesas, usuarios, publicador),
    removerPersonagem: new RemoverPersonagem(personagens, mesas),
    duplicarPersonagem: new DuplicarPersonagem(personagens, mesas, usuarios, geradorId),
    enviarMensagem,
    rolarDados,
    listarMensagens: new ListarMensagens(mensagens, mesas),
    processarComandoChat: new ProcessarComandoChat(registroComandos),
    criarCena: new CriarCena(cenas, mesas, geradorId, publicador),
    listarCenas: new ListarCenas(cenas, mesas),
    atualizarCena: new AtualizarCena(cenas, mesas, publicador),
    removerCena: new RemoverCena(cenas, mesas, armazenamento, armazenamentoTokens),
    ativarCena: new AtivarCena(cenas, mesas, publicador),
    definirImagemFundoCena: new DefinirImagemFundoCena(
      cenas,
      mesas,
      armazenamento,
      geradorId,
      publicador,
    ),
    obterCenaAtiva: new ObterCenaAtiva(cenas, mesas),
    criarToken: new CriarToken(cenas, mesas, geradorId, publicador),
    moverToken: new MoverToken(cenas, mesas, personagens, publicador),
    atualizarToken: new AtualizarToken(cenas, mesas, publicador),
    definirImagemToken: new DefinirImagemToken(
      cenas,
      mesas,
      armazenamentoTokens,
      geradorId,
      publicador,
    ),
    removerToken: new RemoverToken(cenas, mesas, publicador, armazenamentoTokens),
    servicoToken,
  });

  let contadorDeUsuarios = 0;

  async function autenticarComo(dados: DadosDeRegistro = {}): Promise<SessaoDeTeste> {
    contadorDeUsuarios += 1;
    const corpo = {
      nome: dados.nome ?? `Jogador ${contadorDeUsuarios}`,
      email: dados.email ?? `jogador-${contadorDeUsuarios}@teste.local`,
      senha: dados.senha ?? SENHA_PADRAO,
    };
    const resposta = await app.inject({
      method: 'POST',
      url: '/api/auth/registrar',
      payload: corpo,
    });
    if (resposta.statusCode !== 201) {
      throw new Error(
        `Falha ao registrar usuário de teste: ${resposta.statusCode} ${resposta.body}`,
      );
    }
    const sessao = resposta.json<SessaoDTO>();
    return {
      usuario: sessao.usuario,
      token: sessao.token,
      senha: corpo.senha,
      cabecalhos: { authorization: `Bearer ${sessao.token}` },
    };
  }

  return {
    app,
    fakes: {
      usuarios,
      mesas,
      personagens,
      cenas,
      mensagens,
      email,
      armazenamento,
      armazenamentoTokens,
      publicador,
      geradorId,
      relogio,
      servicoSenha,
      servicoToken,
      eventBus,
    },
    autenticarComo,
    aguardarEventos: () => new Promise<void>((resolver) => setTimeout(resolver, 0)),
    encerrar: () => app.close(),
  };
}
