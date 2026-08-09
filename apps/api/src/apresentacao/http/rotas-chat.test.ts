import { beforeEach, describe, expect, it } from 'vitest';
import { COMANDOS_CHAT, type MensagemDTO, type MesaDTO } from '@rolavinte/shared';
import { ROLAGEM_OCULTA_SO_DO_MESTRE } from '../../aplicacao/jogo/rolar-dados';
import {
  criarAppDeTeste,
  ORIGEM_WEB_TESTE,
  type AppDeTeste,
  type SessaoDeTeste,
} from '../../testes/harness';

/**
 * Contrato do chat com comandos (RV-074), sussurro (RV-070) e rolagem oculta
 * (RV-071).
 *
 * O que estes testes existem para impedir é **vazamento por payload** (F4 da
 * taxonomia): o segredo não pode sair do servidor, então as asserções olham a
 * resposta HTTP inteira de um terceiro — não o tipo da mensagem, não a marcação
 * da UI. Se o conteúdo aparecer em qualquer campo da resposta, o teste cai.
 */

let contexto: AppDeTeste;

beforeEach(() => {
  contexto = criarAppDeTeste();
});

async function criarMesa(mestre: SessaoDeTeste): Promise<MesaDTO> {
  const resposta = await contexto.app.inject({
    method: 'POST',
    url: '/api/mesas',
    headers: mestre.cabecalhos,
    payload: { nome: 'A Maldição de Strahd' },
  });
  expect(resposta.statusCode).toBe(201);
  return resposta.json<MesaDTO>();
}

async function adicionarJogador(
  mestre: SessaoDeTeste,
  mesaId: string,
  jogador: SessaoDeTeste,
): Promise<void> {
  const convite = await contexto.app.inject({
    method: 'POST',
    url: `/api/mesas/${mesaId}/convites`,
    headers: mestre.cabecalhos,
    payload: { email: jogador.usuario.email },
  });
  expect(convite.statusCode).toBe(201);
  await contexto.aguardarEventos();

  const mensagem = contexto.fakes.email.ultimoPara(jogador.usuario.email);
  const token = mensagem?.html.match(new RegExp(`${ORIGEM_WEB_TESTE}/convites/([a-z0-9]+)`))?.[1];
  expect(token, 'link de convite ausente no email').toBeTruthy();

  const aceite = await contexto.app.inject({
    method: 'POST',
    url: '/api/convites/aceitar',
    headers: jogador.cabecalhos,
    payload: { token },
  });
  expect(aceite.statusCode).toBe(200);
}

function digitar(autor: SessaoDeTeste, mesaId: string, texto: string) {
  return contexto.app.inject({
    method: 'POST',
    url: `/api/mesas/${mesaId}/chat`,
    headers: autor.cabecalhos,
    payload: { texto },
  });
}

function historico(leitor: SessaoDeTeste, mesaId: string) {
  return contexto.app.inject({
    method: 'GET',
    url: `/api/mesas/${mesaId}/mensagens`,
    headers: leitor.cabecalhos,
  });
}

/** Mesa com mestre, um jogador e uma testemunha que não deve ver os segredos. */
async function montarMesa() {
  const mestre = await contexto.autenticarComo({ nome: 'Mestre Strahd' });
  const aria = await contexto.autenticarComo({ nome: 'Aria' });
  const bruno = await contexto.autenticarComo({ nome: 'Bruno' });
  const mesa = await criarMesa(mestre);
  await adicionarJogador(mestre, mesa.id, aria);
  await adicionarJogador(mestre, mesa.id, bruno);
  return { mestre, aria, bruno, mesaId: mesa.id };
}

describe('POST /mesas/:mesaId/chat — comandos (RV-074)', () => {
  it('texto comum vira fala, com a barra no meio intacta', async () => {
    const { aria, mesaId } = await montarMesa();
    const resposta = await digitar(aria, mesaId, 'e/ou tanto faz');
    expect(resposta.statusCode).toBe(201);
    const mensagem = resposta.json<MensagemDTO>();
    expect(mensagem.tipo).toBe('fala');
    expect(mensagem.conteudo).toBe('e/ou tanto faz');
  });

  it('/r rola dados e separa o motivo depois do #', async () => {
    const { aria, mesaId } = await montarMesa();
    const resposta = await digitar(aria, mesaId, '/r 2d6+3 # dano da espada');
    expect(resposta.statusCode).toBe(201);
    const mensagem = resposta.json<MensagemDTO>();
    expect(mensagem.tipo).toBe('rolagem');
    expect(mensagem.rolagem?.expressao).toBe('2d6+3');
    expect(mensagem.motivo).toBe('dano da espada');
  });

  it('comando inexistente devolve 400 em PT-BR listando os comandos, e nada é enviado', async () => {
    const { aria, bruno, mesaId } = await montarMesa();
    const resposta = await digitar(aria, mesaId, '/banana 1d20');
    expect(resposta.statusCode).toBe(400);
    const erro = resposta.json<{ erro: string }>().erro;
    expect(erro).toContain('"/banana" não é um comando');
    for (const definicao of COMANDOS_CHAT) expect(erro).toContain(definicao.uso);

    const lista = await historico(bruno, mesaId);
    expect(lista.json<MensagemDTO[]>()).toEqual([]);
  });

  it('rejeita quem não participa da mesa', async () => {
    const { mesaId } = await montarMesa();
    const estranho = await contexto.autenticarComo({ nome: 'Estranho' });
    const resposta = await digitar(estranho, mesaId, 'oi');
    expect(resposta.statusCode).toBe(403);
  });

  it('texto vazio é recusado na borda, antes do caso de uso', async () => {
    const { aria, mesaId } = await montarMesa();
    expect((await digitar(aria, mesaId, '   ')).statusCode).toBe(400);
  });
});

describe('sussurro (RV-070)', () => {
  it('o conteúdo NÃO aparece no histórico de um terceiro, e aparece no de autor e destinatário', async () => {
    const { mestre, aria, bruno, mesaId } = await montarMesa();

    const enviado = await digitar(aria, mesaId, '/sussurro @"Mestre Strahd" abro o caixão sozinha');
    expect(enviado.statusCode).toBe(201);
    const sussurro = enviado.json<MensagemDTO>();
    expect(sussurro.tipo).toBe('sussurro');
    expect(sussurro.destinatarioId).toBe(mestre.usuario.id);
    expect(sussurro.destinatarioNome).toBe('Mestre Strahd');

    // A asserção que importa: o corpo bruto da resposta do terceiro.
    const doBruno = await historico(bruno, mesaId);
    expect(doBruno.statusCode).toBe(200);
    expect(doBruno.body).not.toContain('abro o caixão sozinha');
    expect(doBruno.body).not.toContain(sussurro.id);
    expect(doBruno.json<MensagemDTO[]>()).toEqual([]);

    for (const leitor of [aria, mestre]) {
      const lista = (await historico(leitor, mesaId)).json<MensagemDTO[]>();
      expect(lista.map((m) => m.conteudo)).toEqual(['abro o caixão sozinha']);
    }
  });

  it('vai por entrega direcionada, nunca por broadcast na sala da mesa', async () => {
    const { mestre, aria, mesaId } = await montarMesa();
    await digitar(aria, mesaId, '/s "Mestre Strahd" plano secreto');

    expect(contexto.fakes.publicador.doTipo('mensagem:nova')).toHaveLength(0);
    const privados = contexto.fakes.publicador.doTipo('mensagem:privada');
    expect(privados).toHaveLength(1);
    expect(privados[0]!.mesaId).toBe(mesaId);
    expect([...privados[0]!.usuarioIds].sort()).toEqual(
      [aria.usuario.id, mestre.usuario.id].sort(),
    );
  });

  it('sussurrar para quem não participa é 404 e não persiste nada', async () => {
    const { aria, bruno, mesaId } = await montarMesa();
    const forasteiro = await contexto.autenticarComo({ nome: 'Forasteiro' });
    expect(forasteiro.usuario.nome).toBe('Forasteiro');

    const resposta = await digitar(aria, mesaId, '/sussurro @Forasteiro entra escondido');
    expect(resposta.statusCode).toBe(404);
    expect(contexto.fakes.publicador.publicados).toHaveLength(0);
    expect((await historico(bruno, mesaId)).json<MensagemDTO[]>()).toEqual([]);
    expect((await historico(aria, mesaId)).json<MensagemDTO[]>()).toEqual([]);
  });

  it('sussurro sem texto avisa em vez de enviar', async () => {
    const { aria, mesaId } = await montarMesa();
    const resposta = await digitar(aria, mesaId, '/s @Bruno');
    expect(resposta.statusCode).toBe(400);
    expect(resposta.json<{ erro: string }>().erro).toContain('Bruno');
  });
});

describe('rolagem oculta (RV-071)', () => {
  it('o mestre vê o resultado; o jogador não vê nem sinal de que houve rolagem', async () => {
    const { mestre, aria, mesaId } = await montarMesa();

    const rolada = await digitar(mestre, mesaId, '/oculto 1d20+5 # percepção da Aria');
    expect(rolada.statusCode).toBe(201);
    const mensagem = rolada.json<MensagemDTO>();
    expect(mensagem.tipo).toBe('rolagem-oculta');
    expect(mensagem.rolagem?.total).toBe(25);

    const doJogador = await historico(aria, mesaId);
    expect(doJogador.json<MensagemDTO[]>()).toEqual([]);
    expect(doJogador.body).not.toContain('percepção da Aria');
    expect(doJogador.body).not.toContain('1d20+5');

    const doMestre = (await historico(mestre, mesaId)).json<MensagemDTO[]>();
    expect(doMestre.map((m) => m.tipo)).toEqual(['rolagem-oculta']);
  });

  it('só o autor recebe o evento — nem a sala, nem os outros participantes', async () => {
    const { mestre, mesaId } = await montarMesa();
    await digitar(mestre, mesaId, '/go 1d20');

    expect(contexto.fakes.publicador.doTipo('mensagem:nova')).toHaveLength(0);
    const privados = contexto.fakes.publicador.doTipo('mensagem:privada');
    expect(privados).toHaveLength(1);
    expect(privados[0]!.usuarioIds).toEqual([mestre.usuario.id]);
  });

  it('jogador que digita /oculto recebe 403 do servidor', async () => {
    const { aria, mesaId } = await montarMesa();
    const resposta = await digitar(aria, mesaId, '/oculto 1d20');
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json<{ erro: string }>().erro).toBe(ROLAGEM_OCULTA_SO_DO_MESTRE);
    expect(contexto.fakes.publicador.publicados).toHaveLength(0);
  });

  it('jogador chamando POST /rolagens com oculta:true também recebe 403 (a UI não é a defesa)', async () => {
    const { aria, mesaId } = await montarMesa();
    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesaId}/rolagens`,
      headers: aria.cabecalhos,
      payload: { expressao: '1d20', oculta: true },
    });
    expect(resposta.statusCode).toBe(403);
    expect(resposta.json<{ erro: string }>().erro).toBe(ROLAGEM_OCULTA_SO_DO_MESTRE);
    expect(contexto.fakes.publicador.publicados).toHaveLength(0);
  });

  it('POST /rolagens sem oculta continua sendo rolagem pública', async () => {
    const { aria, mesaId } = await montarMesa();
    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesaId}/rolagens`,
      headers: aria.cabecalhos,
      payload: { expressao: '1d20' },
    });
    expect(resposta.statusCode).toBe(201);
    expect(resposta.json<MensagemDTO>().tipo).toBe('rolagem');
    expect(contexto.fakes.publicador.doTipo('mensagem:nova')).toHaveLength(1);
  });
});

describe('histórico misto — o filtro é por solicitante, não por mensagem', () => {
  it('cada um vê o público mais o que é seu', async () => {
    const { mestre, aria, bruno, mesaId } = await montarMesa();

    await digitar(aria, mesaId, 'boa noite a todos');
    await digitar(aria, mesaId, '/sussurro @Bruno me cobre');
    await digitar(mestre, mesaId, '/oculto 1d20');

    const conteudos = async (leitor: SessaoDeTeste) =>
      (await historico(leitor, mesaId))
        .json<MensagemDTO[]>()
        .map((m) => m.tipo)
        .sort();

    expect(await conteudos(aria)).toEqual(['fala', 'sussurro']);
    expect(await conteudos(bruno)).toEqual(['fala', 'sussurro']);
    expect(await conteudos(mestre)).toEqual(['fala', 'rolagem-oculta']);

    const doBruno = await historico(bruno, mesaId);
    expect(doBruno.body).not.toContain('rolagem-oculta');
  });
});
