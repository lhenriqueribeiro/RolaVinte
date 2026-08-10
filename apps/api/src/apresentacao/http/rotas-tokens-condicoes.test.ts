import { beforeEach, describe, expect, it } from 'vitest';
import {
  CONDICOES_DISPONIVEIS,
  MENSAGEM_CONDICAO_DESCONHECIDA,
  type CenaDTO,
  type MesaDTO,
  type PersonagemDTO,
  type TokenDTO,
} from '@rolavinte/shared';
import {
  criarAppDeTeste,
  ORIGEM_WEB_TESTE,
  type AppDeTeste,
  type SessaoDeTeste,
} from '../../testes/harness';

/**
 * Contrato de `PATCH /api/tokens/:tokenId/condicoes` (RV-064).
 *
 * O caminho feliz, o 400 da condição fora do catálogo, o 403 do jogador, o 409
 * da mesa encerrada e o 404 — mais a leitura de volta pela rota da cena, que é o
 * que prova que a condição marcada **sai** do servidor para quem só lê (F12:
 * campo exigido na escrita e ausente da leitura).
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

async function criarCena(mestre: SessaoDeTeste, mesaId: string): Promise<CenaDTO> {
  const resposta = await contexto.app.inject({
    method: 'POST',
    url: `/api/mesas/${mesaId}/cenas`,
    headers: mestre.cabecalhos,
    payload: { nome: 'Cripta' },
  });
  expect(resposta.statusCode).toBe(201);
  return resposta.json<CenaDTO>();
}

async function criarToken(
  autor: SessaoDeTeste,
  cenaId: string,
  corpo: Record<string, unknown>,
): Promise<TokenDTO> {
  const resposta = await contexto.app.inject({
    method: 'POST',
    url: `/api/cenas/${cenaId}/tokens`,
    headers: autor.cabecalhos,
    payload: { x: 2, y: 3, ...corpo },
  });
  expect(resposta.statusCode).toBe(201);
  return resposta.json<TokenDTO>();
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

function marcar(
  sessao: SessaoDeTeste,
  tokenId: string,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; json: <T>() => T }> {
  return contexto.app.inject({
    method: 'PATCH',
    url: `/api/tokens/${tokenId}/condicoes`,
    headers: sessao.cabecalhos,
    payload,
  });
}

/** Mesa + cena + uma peça de NPC, que é o caso comum do combate. */
async function mesaComToken(): Promise<{
  mestre: SessaoDeTeste;
  mesa: MesaDTO;
  cena: CenaDTO;
  token: TokenDTO;
}> {
  const mestre = await contexto.autenticarComo();
  const mesa = await criarMesa(mestre);
  const cena = await criarCena(mestre, mesa.id);
  const token = await criarToken(mestre, cena.id, { nome: 'Gob1' });
  return { mestre, mesa, cena, token };
}

describe('PATCH /api/tokens/:tokenId/condicoes (RV-064)', () => {
  it('o token nasce sem condição nenhuma no DTO', async () => {
    const { token } = await mesaComToken();

    expect(token.condicoes).toEqual([]);
  });

  it('marca a condição e devolve o token pronto para remendar o cache', async () => {
    const { mestre, token } = await mesaComToken();
    contexto.fakes.publicador.limpar();

    const resposta = await marcar(mestre, token.id, { condicao: 'envenenado', aplicada: true });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json<TokenDTO>()).toMatchObject({
      id: token.id,
      condicoes: ['envenenado'],
      nome: 'Gob1',
      x: 2,
      y: 3,
    });
    expect(contexto.fakes.publicador.doTipo('token:atualizado')).toHaveLength(1);
  });

  it('a condição marcada chega a quem só LÊ a cena', async () => {
    const { mestre, mesa, token } = await mesaComToken();
    const jogador = await contexto.autenticarComo();
    await adicionarJogador(mestre, mesa.id, jogador);
    expect((await marcar(mestre, token.id, { condicao: 'caido', aplicada: true })).statusCode).toBe(
      200,
    );

    const cenaAtiva = await contexto.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesa.id}/cena`,
      headers: jogador.cabecalhos,
    });

    expect(cenaAtiva.statusCode).toBe(200);
    const tokens = cenaAtiva.json<{ tokens: TokenDTO[] }>().tokens;
    // Sem esta asserção, "exigido na escrita e ausente na leitura" passaria
    // verde: a marcação existiria no PATCH e nunca chegaria ao mapa de ninguém.
    expect(tokens.map((t) => t.condicoes)).toEqual([['caido']]);
  });

  it('marcar duas vezes a mesma condição deixa uma só', async () => {
    const { mestre, token } = await mesaComToken();

    await marcar(mestre, token.id, { condicao: 'caido', aplicada: true });
    const segunda = await marcar(mestre, token.id, { condicao: 'caido', aplicada: true });

    expect(segunda.statusCode).toBe(200);
    expect(segunda.json<TokenDTO>().condicoes).toEqual(['caido']);
  });

  it('desmarca sem tocar nas outras condições', async () => {
    const { mestre, token } = await mesaComToken();
    await marcar(mestre, token.id, { condicao: 'caido', aplicada: true });
    await marcar(mestre, token.id, { condicao: 'cego', aplicada: true });

    const resposta = await marcar(mestre, token.id, { condicao: 'caido', aplicada: false });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json<TokenDTO>().condicoes).toEqual(['cego']);
  });

  it.each(['banana', 'CAIDO', 'caído', '', 'inconciente'])(
    'devolve 400 em PT-BR para a condição %o, sem publicar nada',
    async (condicao) => {
      const { mestre, token } = await mesaComToken();
      contexto.fakes.publicador.limpar();

      const resposta = await marcar(mestre, token.id, { condicao, aplicada: true });

      expect(resposta.statusCode).toBe(400);
      expect(resposta.json<{ erro: string }>().erro).toBe(MENSAGEM_CONDICAO_DESCONHECIDA);
      expect(contexto.fakes.publicador.publicados).toHaveLength(0);
    },
  );

  it.each([
    ['sem "aplicada"', { condicao: 'caido' }],
    ['sem "condicao"', { aplicada: true }],
    ['com "aplicada" como texto', { condicao: 'caido', aplicada: 'sim' }],
    ['com a lista inteira, que não é o contrato', { condicoes: ['caido'] }],
  ])('devolve 400 para corpo %s', async (_caso, payload) => {
    const { mestre, token } = await mesaComToken();

    const resposta = await marcar(mestre, token.id, payload);

    expect(resposta.statusCode).toBe(400);
  });

  it('devolve 403 para o jogador dono do personagem vinculado, e ele continua movendo', async () => {
    const mestre = await contexto.autenticarComo();
    const jogador = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre);
    await adicionarJogador(mestre, mesa.id, jogador);
    const cena = await criarCena(mestre, mesa.id);

    const ficha = await contexto.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesa.id}/personagens`,
      headers: jogador.cabecalhos,
      payload: { nome: 'Thorin', pvMax: 30 },
    });
    expect(ficha.statusCode).toBe(201);
    const personagem = ficha.json<PersonagemDTO>();
    const token = await criarToken(mestre, cena.id, {
      nome: 'Thorin',
      personagemId: personagem.id,
    });

    const resposta = await marcar(jogador, token.id, { condicao: 'caido', aplicada: true });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json<{ erro: string }>().erro).toContain('Apenas o mestre');

    const movimento = await contexto.app.inject({
      method: 'PATCH',
      url: `/api/tokens/${token.id}/posicao`,
      headers: jogador.cabecalhos,
      payload: { x: 7, y: 9 },
    });
    expect(movimento.statusCode).toBe(200);
    expect(movimento.json<TokenDTO>().condicoes).toEqual([]);
  });

  it('devolve 409 quando a mesa foi encerrada', async () => {
    const { mestre, mesa, token } = await mesaComToken();
    const encerramento = await contexto.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesa.id}/encerrar`,
      headers: mestre.cabecalhos,
      payload: {},
    });
    expect(encerramento.statusCode).toBe(204);

    const resposta = await marcar(mestre, token.id, { condicao: 'caido', aplicada: true });

    expect(resposta.statusCode).toBe(409);
  });

  it('devolve 404 para token inexistente', async () => {
    const mestre = await contexto.autenticarComo();

    const resposta = await marcar(mestre, '00000000-0000-4000-9000-0000000000ff', {
      condicao: 'caido',
      aplicada: true,
    });

    expect(resposta.statusCode).toBe(404);
  });

  it('exige autenticação', async () => {
    const { token } = await mesaComToken();

    const resposta = await contexto.app.inject({
      method: 'PATCH',
      url: `/api/tokens/${token.id}/condicoes`,
      payload: { condicao: 'caido', aplicada: true },
    });

    expect(resposta.statusCode).toBe(401);
  });

  it('toda condição do catálogo é aceita pela rota — extensão por acréscimo', async () => {
    const { mestre, token } = await mesaComToken();

    for (const condicao of CONDICOES_DISPONIVEIS) {
      const resposta = await marcar(mestre, token.id, { condicao, aplicada: true });
      expect(resposta.statusCode, `condição "${condicao}" recusada pela rota`).toBe(200);
    }

    const ultima = await marcar(mestre, token.id, { condicao: 'caido', aplicada: true });
    expect(ultima.json<TokenDTO>().condicoes).toEqual([...CONDICOES_DISPONIVEIS]);
  });
});
