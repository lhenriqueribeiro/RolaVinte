import { beforeEach, describe, expect, it } from 'vitest';
import type { CenaDTO, ConviteDTO, MesaDTO, TokenDTO } from '@rolavinte/shared';
import {
  criarAppDeTeste,
  ORIGEM_WEB_TESTE,
  type AppDeTeste,
  type SessaoDeTeste,
} from '../../testes/harness';

const UUID_INEXISTENTE = '11111111-1111-4111-8111-111111111111';

let contexto: AppDeTeste;

beforeEach(() => {
  contexto = criarAppDeTeste();
});

async function criarMesa(sessao: SessaoDeTeste, nome: string): Promise<MesaDTO> {
  const resposta = await contexto.app.inject({
    method: 'POST',
    url: '/api/mesas',
    headers: sessao.cabecalhos,
    payload: { nome },
  });
  expect(resposta.statusCode).toBe(201);
  return resposta.json<MesaDTO>();
}

/** Convida por email e devolve o convite criado (status pendente). */
async function convidar(mestre: SessaoDeTeste, mesaId: string, email: string): Promise<ConviteDTO> {
  const resposta = await contexto.app.inject({
    method: 'POST',
    url: `/api/mesas/${mesaId}/convites`,
    headers: mestre.cabecalhos,
    payload: { email },
  });
  expect(resposta.statusCode).toBe(201);
  await contexto.aguardarEventos();
  return resposta.json<ConviteDTO>();
}

/** Convida `jogador` e aceita o convite em nome dele — devolve a mesa com 2 participantes. */
async function adicionarJogador(
  mestre: SessaoDeTeste,
  mesaId: string,
  jogador: SessaoDeTeste,
): Promise<void> {
  await convidar(mestre, mesaId, jogador.usuario.email);
  const token = tokenDoConviteEnviadoPara(jogador.usuario.email);
  const aceite = await contexto.app.inject({
    method: 'POST',
    url: '/api/convites/aceitar',
    headers: jogador.cabecalhos,
    payload: { token },
  });
  expect(aceite.statusCode).toBe(200);
}

/** Lê o token de convite no link do email capturado pelo fake de `ServicoEmail`. */
function tokenDoConviteEnviadoPara(email: string): string {
  const mensagem = contexto.fakes.email.ultimoPara(email);
  expect(mensagem, `nenhum email enviado para ${email}`).not.toBeNull();
  const achado = mensagem?.html.match(new RegExp(`${ORIGEM_WEB_TESTE}/convites/([a-z0-9]+)`));
  const token = achado?.[1];
  expect(token, 'link de convite ausente no email').toBeTruthy();
  return token ?? '';
}

describe('rotas de mesas', () => {
  it('recusa GET /api/mesas sem header Authorization com 401', async () => {
    const resposta = await contexto.app.inject({ method: 'GET', url: '/api/mesas' });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ erro: 'Autenticação necessária.' });
  });

  it('cria a mesa com 201 e deixa o criador como mestre', async () => {
    const mestre = await contexto.autenticarComo({ nome: 'Gandalf' });

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: '/api/mesas',
      headers: mestre.cabecalhos,
      payload: { nome: 'A Sociedade do Anel', descricao: 'Campanha épica', sistema: 'dnd5e' },
    });

    expect(resposta.statusCode).toBe(201);
    const mesa = resposta.json<MesaDTO>();
    expect(mesa.nome).toBe('A Sociedade do Anel');
    expect(mesa.sistema).toBe('dnd5e');
    expect(mesa.meuPapel).toBe('mestre');
    expect(mesa.mestreId).toBe(mestre.usuario.id);
    expect(mesa.mestreNome).toBe('Gandalf');
    expect(mesa.totalJogadores).toBe(1);
  });

  it('recusa nome de mesa curto demais com 400', async () => {
    const mestre = await contexto.autenticarComo();

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: '/api/mesas',
      headers: mestre.cabecalhos,
      payload: { nome: 'ab' },
    });

    expect(resposta.statusCode).toBe(400);
  });

  it('lista apenas as mesas de quem pediu', async () => {
    const mestre = await contexto.autenticarComo({ nome: 'Mestre' });
    const outro = await contexto.autenticarComo({ nome: 'Outro' });
    const minha = await criarMesa(mestre, 'Mesa do Mestre');
    await criarMesa(outro, 'Mesa do Outro');

    const resposta = await contexto.app.inject({
      method: 'GET',
      url: '/api/mesas',
      headers: mestre.cabecalhos,
    });

    expect(resposta.statusCode).toBe(200);
    const mesas = resposta.json<MesaDTO[]>();
    expect(mesas.map((m) => m.id)).toEqual([minha.id]);
  });

  it('recusa abrir mesa de terceiro com 403', async () => {
    const mestre = await contexto.autenticarComo();
    const estranho = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre, 'Mesa Privada');

    const resposta = await contexto.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesa.id}`,
      headers: estranho.cabecalhos,
    });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json<{ erro: string }>().erro).toBe('Você não participa desta mesa.');
  });

  it('devolve 404 para mesa inexistente', async () => {
    const sessao = await contexto.autenticarComo();

    const resposta = await contexto.app.inject({
      method: 'GET',
      url: `/api/mesas/${UUID_INEXISTENTE}`,
      headers: sessao.cabecalhos,
    });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json<{ erro: string }>().erro).toBe('Mesa não encontrada.');
  });

  it('recusa 403 quando um jogador tenta convidar em vez do mestre', async () => {
    const mestre = await contexto.autenticarComo({ nome: 'Mestre' });
    const jogador = await contexto.autenticarComo({
      nome: 'Jogador',
      email: 'jogador@teste.local',
    });
    const mesa = await criarMesa(mestre, 'Mesa com Convite');

    const convite = await contexto.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesa.id}/convites`,
      headers: mestre.cabecalhos,
      payload: { email: 'jogador@teste.local' },
    });
    expect(convite.statusCode).toBe(201);

    await contexto.aguardarEventos();
    const token = tokenDoConviteEnviadoPara('jogador@teste.local');

    const aceite = await contexto.app.inject({
      method: 'POST',
      url: '/api/convites/aceitar',
      headers: jogador.cabecalhos,
      payload: { token },
    });
    expect(aceite.statusCode).toBe(200);

    const tentativa = await contexto.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesa.id}/convites`,
      headers: jogador.cabecalhos,
      payload: { email: 'terceiro@teste.local' },
    });

    expect(tentativa.statusCode).toBe(403);
    expect(tentativa.json<{ erro: string }>().erro).toBe(
      'Apenas o mestre pode convidar jogadores.',
    );
  });
});

describe('gestão de convites (RV-020)', () => {
  it('mestre lista os convites com email, status e data de envio', async () => {
    const mestre = await contexto.autenticarComo({ nome: 'Mestre' });
    const mesa = await criarMesa(mestre, 'Mesa com Convites');
    await convidar(mestre, mesa.id, 'novo@teste.local');

    const resposta = await contexto.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesa.id}/convites`,
      headers: mestre.cabecalhos,
    });

    expect(resposta.statusCode).toBe(200);
    const convites = resposta.json<ConviteDTO[]>();
    expect(convites).toHaveLength(1);
    expect(convites[0]?.email).toBe('novo@teste.local');
    expect(convites[0]?.status).toBe('pendente');
    expect(convites[0]?.criadoEm).toBeTruthy();
  });

  it('recusa 403 quando um jogador tenta listar os convites', async () => {
    const mestre = await contexto.autenticarComo({ nome: 'Mestre' });
    const jogador = await contexto.autenticarComo({ nome: 'Jogador' });
    const mesa = await criarMesa(mestre, 'Mesa com Convites');
    await adicionarJogador(mestre, mesa.id, jogador);

    const resposta = await contexto.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesa.id}/convites`,
      headers: jogador.cabecalhos,
    });

    expect(resposta.statusCode).toBe(403);
  });

  /**
   * O front só mostra o botão de revogar para o mestre; a garantia de verdade
   * tem que estar no caso de uso — esconder o botão não é autorização.
   */
  it('recusa 403 quando um jogador tenta revogar um convite', async () => {
    const mestre = await contexto.autenticarComo({ nome: 'Mestre' });
    const jogador = await contexto.autenticarComo({ nome: 'Bruno' });
    const mesa = await criarMesa(mestre, 'Mesa com Convites');
    await adicionarJogador(mestre, mesa.id, jogador);
    const convite = await convidar(mestre, mesa.id, 'terceiro@teste.local');

    const resposta = await contexto.app.inject({
      method: 'DELETE',
      url: `/api/mesas/${mesa.id}/convites/${convite.id}`,
      headers: jogador.cabecalhos,
    });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json<{ erro: string }>().erro).toBe(
      'Apenas o mestre pode gerir os convites da mesa.',
    );

    // O convite continua válido: a tentativa negada não pode ter efeito colateral.
    const lista = await contexto.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesa.id}/convites`,
      headers: mestre.cabecalhos,
    });
    const alvo = lista.json<ConviteDTO[]>().find((c) => c.id === convite.id);
    expect(alvo?.status).toBe('pendente');
  });

  it('revogar invalida o link e preserva o convite como revogado', async () => {
    const mestre = await contexto.autenticarComo({ nome: 'Mestre' });
    const mesa = await criarMesa(mestre, 'Mesa com Convites');
    const convite = await convidar(mestre, mesa.id, 'novo@teste.local');
    const token = tokenDoConviteEnviadoPara('novo@teste.local');

    const revogacao = await contexto.app.inject({
      method: 'DELETE',
      url: `/api/mesas/${mesa.id}/convites/${convite.id}`,
      headers: mestre.cabecalhos,
    });
    expect(revogacao.statusCode).toBe(204);

    const paginaPublica = await contexto.app.inject({
      method: 'GET',
      url: `/api/convites/${token}`,
    });
    expect(paginaPublica.statusCode).toBe(404);
    expect(paginaPublica.json<{ erro: string }>().erro).toBe(
      'Convite não encontrado ou já utilizado.',
    );

    const lista = await contexto.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesa.id}/convites`,
      headers: mestre.cabecalhos,
    });
    expect(lista.json<ConviteDTO[]>()).toHaveLength(1);
    expect(lista.json<ConviteDTO[]>()[0]?.status).toBe('revogado');
  });

  it('convidado não entra com convite revogado', async () => {
    const mestre = await contexto.autenticarComo({ nome: 'Mestre' });
    const convidado = await contexto.autenticarComo({ nome: 'Convidado' });
    const mesa = await criarMesa(mestre, 'Mesa com Convites');
    const convite = await convidar(mestre, mesa.id, convidado.usuario.email);
    const token = tokenDoConviteEnviadoPara(convidado.usuario.email);

    await contexto.app.inject({
      method: 'DELETE',
      url: `/api/mesas/${mesa.id}/convites/${convite.id}`,
      headers: mestre.cabecalhos,
    });

    const aceite = await contexto.app.inject({
      method: 'POST',
      url: '/api/convites/aceitar',
      headers: convidado.cabecalhos,
      payload: { token },
    });

    expect(aceite.statusCode).toBe(404);
  });
});

describe('remoção e saída (RV-021 / RV-022)', () => {
  it('remove o jogador com 204 e ele perde o acesso na hora', async () => {
    const mestre = await contexto.autenticarComo({ nome: 'Mestre' });
    const jogador = await contexto.autenticarComo({ nome: 'Bruno' });
    const mesa = await criarMesa(mestre, 'Mesa do Bruno');
    await adicionarJogador(mestre, mesa.id, jogador);

    const remocao = await contexto.app.inject({
      method: 'DELETE',
      url: `/api/mesas/${mesa.id}/jogadores/${jogador.usuario.id}`,
      headers: mestre.cabecalhos,
    });
    expect(remocao.statusCode).toBe(204);

    const acesso = await contexto.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesa.id}`,
      headers: jogador.cabecalhos,
    });
    expect(acesso.statusCode).toBe(403);

    const eventos = contexto.fakes.publicador.doTipo('mesa:participante-removido');
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.dados.usuarioId).toBe(jogador.usuario.id);
  });

  /**
   * Regressão da armadilha do repositório: o upsert sozinho não apagava a linha
   * de `mesa_jogadores`, então o removido voltava na leitura seguinte.
   */
  it('nova leitura do repositório não traz o jogador removido', async () => {
    const mestre = await contexto.autenticarComo({ nome: 'Mestre' });
    const jogador = await contexto.autenticarComo({ nome: 'Bruno' });
    const mesa = await criarMesa(mestre, 'Mesa do Bruno');
    await adicionarJogador(mestre, mesa.id, jogador);

    await contexto.app.inject({
      method: 'DELETE',
      url: `/api/mesas/${mesa.id}/jogadores/${jogador.usuario.id}`,
      headers: mestre.cabecalhos,
    });

    const relida = await contexto.fakes.mesas.buscarPorId(mesa.id);
    expect(relida?.ehParticipante(jogador.usuario.id)).toBe(false);
    expect(await contexto.fakes.mesas.listarDoUsuario(jogador.usuario.id)).toEqual([]);

    const detalhe = await contexto.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesa.id}`,
      headers: mestre.cabecalhos,
    });
    const corpo = detalhe.json<MesaDTO & { jogadores: { usuarioId: string }[] }>();
    expect(corpo.jogadores.map((j) => j.usuarioId)).toEqual([mestre.usuario.id]);
    expect(corpo.totalJogadores).toBe(1);
  });

  it('recusa 403 quando o mestre tenta remover a si mesmo', async () => {
    const mestre = await contexto.autenticarComo({ nome: 'Mestre' });
    const mesa = await criarMesa(mestre, 'Mesa do Mestre');

    const resposta = await contexto.app.inject({
      method: 'DELETE',
      url: `/api/mesas/${mesa.id}/jogadores/${mestre.usuario.id}`,
      headers: mestre.cabecalhos,
    });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json<{ erro: string }>().erro).toBe(
      'O mestre não pode remover a si mesmo. Encerre a mesa ou transfira a mestrança.',
    );
  });

  it('recusa 403 quando um jogador tenta remover alguém', async () => {
    const mestre = await contexto.autenticarComo({ nome: 'Mestre' });
    const jogador = await contexto.autenticarComo({ nome: 'Bruno' });
    const mesa = await criarMesa(mestre, 'Mesa do Bruno');
    await adicionarJogador(mestre, mesa.id, jogador);

    const resposta = await contexto.app.inject({
      method: 'DELETE',
      url: `/api/mesas/${mesa.id}/jogadores/${mestre.usuario.id}`,
      headers: jogador.cabecalhos,
    });

    expect(resposta.statusCode).toBe(403);
  });

  it('jogador sai com 204 e a mesa some do dashboard dele', async () => {
    const mestre = await contexto.autenticarComo({ nome: 'Mestre' });
    const jogador = await contexto.autenticarComo({ nome: 'Bruno' });
    const mesa = await criarMesa(mestre, 'Strahd');
    await adicionarJogador(mestre, mesa.id, jogador);

    const saida = await contexto.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesa.id}/sair`,
      headers: jogador.cabecalhos,
    });
    expect(saida.statusCode).toBe(204);

    const dashboard = await contexto.app.inject({
      method: 'GET',
      url: '/api/mesas',
      headers: jogador.cabecalhos,
    });
    expect(dashboard.json<MesaDTO[]>()).toEqual([]);

    const acesso = await contexto.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesa.id}`,
      headers: jogador.cabecalhos,
    });
    expect(acesso.statusCode).toBe(403);
  });

  it('recusa 403 quando o mestre tenta sair da própria mesa', async () => {
    const mestre = await contexto.autenticarComo({ nome: 'Mestre' });
    const mesa = await criarMesa(mestre, 'Mesa do Mestre');

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesa.id}/sair`,
      headers: mestre.cabecalhos,
    });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json<{ erro: string }>().erro).toBe(
      'O mestre não pode sair da própria mesa. Transfira a mestrança ou encerre a mesa.',
    );
  });
});

describe('encerramento da mesa (RV-023)', () => {
  it('recusa 403 quando um jogador tenta encerrar', async () => {
    const mestre = await contexto.autenticarComo({ nome: 'Mestre' });
    const jogador = await contexto.autenticarComo({ nome: 'Bruno' });
    const mesa = await criarMesa(mestre, 'Strahd');
    await adicionarJogador(mestre, mesa.id, jogador);

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesa.id}/encerrar`,
      headers: jogador.cabecalhos,
    });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json<{ erro: string }>().erro).toBe('Apenas o mestre pode encerrar a mesa.');
  });

  it('mesa encerrada aparece com encerradaEm no dashboard e segue legível', async () => {
    const mestre = await contexto.autenticarComo({ nome: 'Mestre' });
    const mesa = await criarMesa(mestre, 'Strahd');

    const encerrar = await contexto.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesa.id}/encerrar`,
      headers: mestre.cabecalhos,
    });
    expect(encerrar.statusCode).toBe(204);

    const dashboard = await contexto.app.inject({
      method: 'GET',
      url: '/api/mesas',
      headers: mestre.cabecalhos,
    });
    const [dto] = dashboard.json<MesaDTO[]>();
    expect(dto?.encerradaEm).toBeTruthy();

    // Somente leitura: histórico e detalhe continuam acessíveis.
    const detalhe = await contexto.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesa.id}`,
      headers: mestre.cabecalhos,
    });
    expect(detalhe.statusCode).toBe(200);
    const mensagens = await contexto.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesa.id}/mensagens`,
      headers: mestre.cabecalhos,
    });
    expect(mensagens.statusCode).toBe(200);
  });

  it('encerrar duas vezes é 409', async () => {
    const mestre = await contexto.autenticarComo({ nome: 'Mestre' });
    const mesa = await criarMesa(mestre, 'Strahd');

    await contexto.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesa.id}/encerrar`,
      headers: mestre.cabecalhos,
    });
    const denovo = await contexto.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesa.id}/encerrar`,
      headers: mestre.cabecalhos,
    });

    expect(denovo.statusCode).toBe(409);
    expect(denovo.json<{ erro: string }>().erro).toBe('Esta mesa já foi encerrada.');
  });

  it('toda escrita do contexto de jogo vira 409 depois do encerramento', async () => {
    const mestre = await contexto.autenticarComo({ nome: 'Mestre' });
    const jogador = await contexto.autenticarComo({ nome: 'Bruno' });
    const mesa = await criarMesa(mestre, 'Strahd');
    await adicionarJogador(mestre, mesa.id, jogador);

    const cena = await contexto.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesa.id}/cenas`,
      headers: mestre.cabecalhos,
      payload: { nome: 'Cripta' },
    });
    expect(cena.statusCode).toBe(201);
    const cenaId = cena.json<CenaDTO>().id;

    const token = await contexto.app.inject({
      method: 'POST',
      url: `/api/cenas/${cenaId}/tokens`,
      headers: mestre.cabecalhos,
      payload: { nome: 'Strahd', x: 1, y: 1 },
    });
    expect(token.statusCode).toBe(201);
    const tokenId = token.json<TokenDTO>().id;

    await contexto.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesa.id}/encerrar`,
      headers: mestre.cabecalhos,
    });

    const escritas = [
      {
        rotulo: 'enviar mensagem',
        sessao: jogador,
        metodo: 'POST' as const,
        url: `/api/mesas/${mesa.id}/mensagens`,
        payload: { conteudo: 'oi' },
      },
      {
        rotulo: 'rolar dados',
        sessao: jogador,
        metodo: 'POST' as const,
        url: `/api/mesas/${mesa.id}/rolagens`,
        payload: { expressao: 'd20' },
      },
      {
        rotulo: 'criar cena',
        sessao: mestre,
        metodo: 'POST' as const,
        url: `/api/mesas/${mesa.id}/cenas`,
        payload: { nome: 'Outra' },
      },
      {
        rotulo: 'criar token',
        sessao: mestre,
        metodo: 'POST' as const,
        url: `/api/cenas/${cenaId}/tokens`,
        payload: { nome: 'Novo', x: 2, y: 2 },
      },
      {
        rotulo: 'mover token',
        sessao: mestre,
        metodo: 'PATCH' as const,
        url: `/api/tokens/${tokenId}/posicao`,
        payload: { x: 3, y: 3 },
      },
      {
        rotulo: 'remover token',
        sessao: mestre,
        metodo: 'DELETE' as const,
        url: `/api/tokens/${tokenId}`,
        payload: undefined,
      },
    ];

    for (const escrita of escritas) {
      const resposta = await contexto.app.inject({
        method: escrita.metodo,
        url: escrita.url,
        headers: escrita.sessao.cabecalhos,
        payload: escrita.payload,
      });
      expect(resposta.statusCode, escrita.rotulo).toBe(409);
      expect(resposta.json<{ erro: string }>().erro, escrita.rotulo).toBe(
        'Esta mesa foi encerrada.',
      );
    }
  });

  it('convidar e aceitar convite também param em mesa encerrada', async () => {
    const mestre = await contexto.autenticarComo({ nome: 'Mestre' });
    const mesa = await criarMesa(mestre, 'Strahd');
    await contexto.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesa.id}/encerrar`,
      headers: mestre.cabecalhos,
    });

    const convite = await contexto.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesa.id}/convites`,
      headers: mestre.cabecalhos,
      payload: { email: 'tarde@teste.local' },
    });

    expect(convite.statusCode).toBe(409);
    expect(convite.json<{ erro: string }>().erro).toBe('Esta mesa foi encerrada.');
  });
});

describe('edição da mesa (RV-024)', () => {
  it('mestre renomeia a mesa e o novo nome vale para todos', async () => {
    const mestre = await contexto.autenticarComo({ nome: 'Mestre' });
    const jogador = await contexto.autenticarComo({ nome: 'Bruno' });
    const mesa = await criarMesa(mestre, 'A Maldição de Strahd');
    await adicionarJogador(mestre, mesa.id, jogador);

    const resposta = await contexto.app.inject({
      method: 'PATCH',
      url: `/api/mesas/${mesa.id}`,
      headers: mestre.cabecalhos,
      payload: { nome: 'A Maldição de Strahd — Ato II', sistema: 'tormenta20' },
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json<MesaDTO>().nome).toBe('A Maldição de Strahd — Ato II');

    const doJogador = await contexto.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesa.id}`,
      headers: jogador.cabecalhos,
    });
    const vista = doJogador.json<MesaDTO>();
    expect(vista.nome).toBe('A Maldição de Strahd — Ato II');
    expect(vista.sistema).toBe('tormenta20');
    expect(vista.meuPapel).toBe('jogador');
  });

  it('nome curto na edição dá 400 com a mesma mensagem da criação', async () => {
    const mestre = await contexto.autenticarComo({ nome: 'Mestre' });
    const mesa = await criarMesa(mestre, 'Mesa Válida');

    const criacao = await contexto.app.inject({
      method: 'POST',
      url: '/api/mesas',
      headers: mestre.cabecalhos,
      payload: { nome: 'ab' },
    });
    const edicao = await contexto.app.inject({
      method: 'PATCH',
      url: `/api/mesas/${mesa.id}`,
      headers: mestre.cabecalhos,
      payload: { nome: 'ab' },
    });

    expect(criacao.statusCode).toBe(400);
    expect(edicao.statusCode).toBe(400);
    expect(edicao.json<{ erro: string }>().erro).toBe(criacao.json<{ erro: string }>().erro);
  });

  it('recusa 403 quando um jogador tenta editar', async () => {
    const mestre = await contexto.autenticarComo({ nome: 'Mestre' });
    const jogador = await contexto.autenticarComo({ nome: 'Bruno' });
    const mesa = await criarMesa(mestre, 'Mesa do Mestre');
    await adicionarJogador(mestre, mesa.id, jogador);

    const resposta = await contexto.app.inject({
      method: 'PATCH',
      url: `/api/mesas/${mesa.id}`,
      headers: jogador.cabecalhos,
      payload: { nome: 'Mesa do Bruno' },
    });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json<{ erro: string }>().erro).toBe('Apenas o mestre pode editar a mesa.');
  });
});
