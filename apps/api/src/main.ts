import { Server as SocketServer } from 'socket.io';

import { criarServidorHttp, registrarRotas } from './app';
import { carregarEnv } from './config/env';
import { ServicoRolagemDados } from './dominio/jogo/servico-rolagem';
import type { JogadorConvidado } from './dominio/mesas/eventos';

import { RegistrarUsuario } from './aplicacao/contas/registrar-usuario';
import { AutenticarUsuario } from './aplicacao/contas/autenticar-usuario';
import { ObterUsuarioAtual } from './aplicacao/contas/obter-usuario-atual';
import { CriarMesa } from './aplicacao/mesas/criar-mesa';
import { ListarMesas } from './aplicacao/mesas/listar-mesas';
import { ObterMesa } from './aplicacao/mesas/obter-mesa';
import { AtualizarMesa } from './aplicacao/mesas/atualizar-mesa';
import { EncerrarMesa } from './aplicacao/mesas/encerrar-mesa';
import { ConvidarJogador } from './aplicacao/mesas/convidar-jogador';
import { ListarConvites } from './aplicacao/mesas/listar-convites';
import { RevogarConvite } from './aplicacao/mesas/revogar-convite';
import { RemoverJogador } from './aplicacao/mesas/remover-jogador';
import { SairDaMesa } from './aplicacao/mesas/sair-da-mesa';
import { ObterConvitePublico } from './aplicacao/mesas/obter-convite-publico';
import { AceitarConvite } from './aplicacao/mesas/aceitar-convite';
import { CriarPersonagem } from './aplicacao/personagens/criar-personagem';
import { ListarPersonagens } from './aplicacao/personagens/listar-personagens';
import { AtualizarPersonagem } from './aplicacao/personagens/atualizar-personagem';
import { RemoverPersonagem } from './aplicacao/personagens/remover-personagem';
import { DuplicarPersonagem } from './aplicacao/personagens/duplicar-personagem';
import { EnviarMensagem } from './aplicacao/jogo/enviar-mensagem';
import { RolarDados } from './aplicacao/jogo/rolar-dados';
import { ListarMensagens } from './aplicacao/jogo/listar-mensagens';
import { EnviarSussurro } from './aplicacao/jogo/enviar-sussurro';
import { RegistroComandosChat } from './aplicacao/jogo/comandos-chat';
import { ProcessarComandoChat } from './aplicacao/jogo/processar-comando-chat';
import { CriarCena } from './aplicacao/jogo/criar-cena';
import { ListarCenas } from './aplicacao/jogo/listar-cenas';
import { AtualizarCena } from './aplicacao/jogo/atualizar-cena';
import { RemoverCena } from './aplicacao/jogo/remover-cena';
import { AtivarCena } from './aplicacao/jogo/ativar-cena';
import { DefinirImagemFundoCena } from './aplicacao/jogo/definir-imagem-fundo-cena';
import { ObterCenaAtiva } from './aplicacao/jogo/obter-cena-ativa';
import { CriarToken } from './aplicacao/jogo/criar-token';
import { MoverToken } from './aplicacao/jogo/mover-token';
import { AtualizarToken } from './aplicacao/jogo/atualizar-token';
import { DefinirImagemToken } from './aplicacao/jogo/definir-imagem-token';
import { RemoverToken } from './aplicacao/jogo/remover-token';
import { VerificarParticipacao } from './aplicacao/jogo/verificar-participacao';

import { criarClienteSupabase } from './infra/supabase/cliente';
import { SupabaseUsuarioRepository } from './infra/supabase/usuario-repository.supabase';
import { SupabaseMesaRepository } from './infra/supabase/mesa-repository.supabase';
import { SupabasePersonagemRepository } from './infra/supabase/personagem-repository.supabase';
import { SupabaseCenaRepository } from './infra/supabase/cena-repository.supabase';
import { SupabaseMensagemRepository } from './infra/supabase/mensagem-repository.supabase';
import {
  BUCKET_TOKENS,
  SupabaseArmazenamentoArquivos,
} from './infra/storage/supabase-armazenamento-arquivos';
import { BcryptServicoSenha } from './infra/auth/bcrypt-servico-senha';
import { JwtServicoToken } from './infra/auth/jwt-servico-token';
import { UuidGeradorId } from './infra/ids/uuid-gerador-id';
import { RelogioSistema } from './infra/ids/relogio-sistema';
import { EventBusMemoria } from './infra/eventos/event-bus-memoria';
import { ResendServicoEmail } from './infra/email/resend-servico-email';
import { ConsoleServicoEmail } from './infra/email/console-servico-email';
import { templateConvite } from './infra/email/templates/convite';

import { PublicadorSocket } from './apresentacao/ws/publicador-socket';
import { GatewayJogo } from './apresentacao/ws/gateway-jogo';
import type { ServidorJogo } from './apresentacao/ws/servidor-socket';

async function iniciar(): Promise<void> {
  const env = carregarEnv();
  const app = criarServidorHttp({
    origemWeb: env.ORIGEM_WEB,
    logger: { level: 'info' },
    rateLimit: {
      max: env.RATE_LIMIT_MAX,
      janelaMs: env.RATE_LIMIT_JANELA,
      maxAutenticacao: env.RATE_LIMIT_MAX_AUTH,
    },
  });

  // O io precisa do servidor HTTP já criado; o publicador precisa do io; os
  // casos de uso precisam do publicador — por isso as rotas entram depois.
  const io: ServidorJogo = new SocketServer(app.server, {
    cors: { origin: env.ORIGEM_WEB },
  });
  const publicador = new PublicadorSocket(io);

  // ── Infraestrutura ────────────────────────────────────────────────
  const sb = criarClienteSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const usuarios = new SupabaseUsuarioRepository(sb);
  const mesas = new SupabaseMesaRepository(sb);
  const personagens = new SupabasePersonagemRepository(sb);
  const cenas = new SupabaseCenaRepository(sb);
  const mensagens = new SupabaseMensagemRepository(sb);
  const armazenamento = new SupabaseArmazenamentoArquivos(sb);
  // Mesma port, mesmo adapter, outro bucket: arte de token e mapa não dividem
  // cota nem limpeza (RV-041).
  const armazenamentoTokens = new SupabaseArmazenamentoArquivos(sb, BUCKET_TOKENS);

  const servicoSenha = new BcryptServicoSenha();
  const servicoToken = new JwtServicoToken(env.JWT_SEGREDO);
  const geradorId = new UuidGeradorId();
  const relogio = new RelogioSistema();
  const eventBus = new EventBusMemoria((erro, evento) =>
    app.log.error({ err: erro, evento }, 'falha em assinante de evento'),
  );
  const servicoEmail = env.RESEND_API_KEY
    ? new ResendServicoEmail(env.RESEND_API_KEY, env.EMAIL_REMETENTE, (info) =>
        app.log.info({ para: info.para, id: info.id }, 'email enviado'),
      )
    : new ConsoleServicoEmail();
  if (!env.RESEND_API_KEY) {
    app.log.warn('RESEND_API_KEY ausente — emails serão exibidos no console (modo dev).');
  }

  const servicoRolagem = new ServicoRolagemDados(Math.random);

  // ── Assinantes de eventos de domínio ─────────────────────────────
  eventBus.assinar('mesas.jogador-convidado', async (evento) => {
    const { dados } = evento as JogadorConvidado;
    const urlConvite = `${env.ORIGEM_WEB}/convites/${dados.tokenConvite}`;
    const email = templateConvite({
      mesaNome: dados.mesaNome,
      nomeMestre: dados.nomeMestre,
      urlConvite,
    });
    await servicoEmail.enviar({
      para: dados.emailConvidado,
      assunto: email.assunto,
      html: email.html,
    });
  });

  // ── Comandos de chat (RV-074) ─────────────────────────────────────
  // Os três casos de uso do chat nascem antes do resto porque o registry de
  // comandos os compõe. O `Record` de manipuladores é total por tipo: comando
  // novo no parser de `@rolavinte/shared` para de compilar aqui até ganhar dono.
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
        // A CD do sufixo `cd N`, já lida pelo parser (RV-154). `null` = sem CD.
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

  // ── Casos de uso ──────────────────────────────────────────────────
  const usos = {
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
    verificarParticipacao: new VerificarParticipacao(mesas),
  };

  // ── Apresentação ──────────────────────────────────────────────────
  registrarRotas(app, { ...usos, servicoToken });
  new GatewayJogo(io, servicoToken, usos.verificarParticipacao).iniciar();

  await app.listen({ port: env.PORTA, host: '0.0.0.0' });
  app.log.info(`🎲 RolaVinte API no ar em http://localhost:${env.PORTA}`);
}

iniciar().catch((erro) => {
  console.error('Falha fatal ao iniciar a API:', erro);
  process.exit(1);
});
