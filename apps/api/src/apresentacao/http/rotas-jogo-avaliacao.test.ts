import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CD_MAXIMA,
  MENSAGEM_CD_INVALIDA,
  type CriarMesaEntrada,
  type MensagemDTO,
  type MesaDTO,
  type SistemaRpg,
} from '@rolavinte/shared';
import { criarAppDeTeste, type AppDeTeste, type SessaoDeTeste } from '../../testes/harness';

/**
 * Grau de sucesso no chat, ponta a ponta (RV-154).
 *
 * **Os dois caminhos pelos quais a CD chega**, os dois exercitados aqui:
 *
 * 1. `POST /mesas/:mesaId/chat` com a linha crua `"/r 1d20+11 cd 18"` — é o que
 *    uma pessoa digita, e o servidor reinterpreta o texto com o parser de
 *    `@rolavinte/shared` (RV-074). Nenhuma rota nova.
 * 2. `POST /mesas/:mesaId/rolagens` com `{ expressao, motivo, cd }` — é o que a
 *    **ficha** usa ao clicar numa salvaguarda (RV-155) ou num ataque (RV-156):
 *    ela já tem o número, e mandá-lo como número evita montar uma string para o
 *    servidor desmontar de novo.
 *
 * As duas convergem no mesmo `avaliacao` do `MensagemDTO`, o que é a prova de que
 * não existem duas aritméticas — só duas formas de digitar a mesma coisa.
 */

/** O d20 sai sempre nesta face: o total da avaliação é previsível. */
const FACE_DO_D20 = 17;

let ambiente: AppDeTeste;
let mestre: SessaoDeTeste;
let bruno: SessaoDeTeste;
let estranho: SessaoDeTeste;

beforeEach(async () => {
  ambiente = criarAppDeTeste({ rng: () => (FACE_DO_D20 - 1) / 20 + 0.001 });
  mestre = await ambiente.autenticarComo({ nome: 'Mestre' });
  bruno = await ambiente.autenticarComo({ nome: 'Bruno' });
  estranho = await ambiente.autenticarComo({ nome: 'Estranho' });
});

afterEach(async () => {
  await ambiente.encerrar();
});

async function entrarNaMesa(mesaId: string, sessao: SessaoDeTeste): Promise<void> {
  const convite = await ambiente.app.inject({
    method: 'POST',
    url: `/api/mesas/${mesaId}/convites`,
    headers: mestre.cabecalhos,
    payload: { email: sessao.usuario.email },
  });
  expect(convite.statusCode).toBe(201);
  await ambiente.aguardarEventos();
  const token = ambiente.fakes.email.enviados.at(-1)?.html.match(/\/convites\/([\w-]+)/)?.[1];
  const aceite = await ambiente.app.inject({
    method: 'POST',
    url: '/api/convites/aceitar',
    headers: sessao.cabecalhos,
    payload: { token },
  });
  expect(aceite.statusCode).toBe(200);
}

async function criarMesa(sistema: SistemaRpg): Promise<string> {
  const corpo: CriarMesaEntrada = { nome: 'A Era das Cinzas', descricao: '', sistema };
  const criada = await ambiente.app.inject({
    method: 'POST',
    url: '/api/mesas',
    headers: mestre.cabecalhos,
    payload: corpo,
  });
  expect(criada.statusCode).toBe(201);
  const mesa = criada.json<MesaDTO>();
  await entrarNaMesa(mesa.id, bruno);
  return mesa.id;
}

/** Caminho 1: a linha crua do chat. */
function digitarNoChat(sessao: SessaoDeTeste, mesaId: string, texto: string) {
  return ambiente.app.inject({
    method: 'POST',
    url: `/api/mesas/${mesaId}/chat`,
    headers: sessao.cabecalhos,
    payload: { texto },
  });
}

/** Caminho 2: a rota de rolagens, como a ficha a usa. */
function rolarComCd(
  sessao: SessaoDeTeste,
  mesaId: string,
  corpo: { expressao: string; motivo?: string; cd?: number | null },
) {
  return ambiente.app.inject({
    method: 'POST',
    url: `/api/mesas/${mesaId}/rolagens`,
    headers: sessao.cabecalhos,
    payload: corpo,
  });
}

describe('grau de sucesso pelo chat (RV-154)', () => {
  it('"/r 1d20+11 cd 18" com o d20 em 17 mostra o total 28 e "sucesso-critico"', async () => {
    const mesaId = await criarMesa('pathfinder2e');

    const resposta = await digitarNoChat(bruno, mesaId, '/r 1d20+11 cd 18');

    expect(resposta.statusCode).toBe(201);
    const mensagem = resposta.json<MensagemDTO>();
    // A CD saiu da expressão: o que foi rolado é `1d20+11`.
    expect(mensagem.rolagem?.expressao).toBe('1d20+11');
    expect(mensagem.rolagem?.total).toBe(28);
    expect(mensagem.avaliacao).toEqual({
      cd: 18,
      grau: 'sucesso-critico',
      d20Natural: 17,
      efeitoNatural: null,
    });
  });

  it('a mesa inteira recebe o grau no broadcast, sem recarregar', async () => {
    const mesaId = await criarMesa('pathfinder2e');

    await digitarNoChat(bruno, mesaId, '/r 1d20+11 cd 18 # Furtividade');

    const publicados = ambiente.fakes.publicador.doTipo('mensagem:nova');
    expect(publicados).toHaveLength(1);
    expect(publicados[0]?.dados.avaliacao?.grau).toBe('sucesso-critico');
    expect(publicados[0]?.dados.motivo).toBe('Furtividade');
  });

  it('o grau volta no histórico, para quem entra depois', async () => {
    const mesaId = await criarMesa('pathfinder2e');
    await digitarNoChat(bruno, mesaId, '/r 1d20+11 cd 18');

    const historico = await ambiente.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesaId}/mensagens`,
      headers: mestre.cabecalhos,
    });

    expect(historico.json<MensagemDTO[]>().at(-1)?.avaliacao?.grau).toBe('sucesso-critico');
  });

  it('sem CD, a mensagem sai exatamente como antes: nenhum selo', async () => {
    const mesaId = await criarMesa('pathfinder2e');

    const resposta = await digitarNoChat(bruno, mesaId, '/r 1d20+11');

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json<MensagemDTO>().avaliacao).toBeNull();
  });
});

describe('grau de sucesso pela rota de rolagens, como a ficha a usa (RV-154)', () => {
  it('a CD chega como número e produz a mesma avaliação do caminho do chat', async () => {
    const mesaId = await criarMesa('pathfinder2e');

    const pelaFicha = await rolarComCd(bruno, mesaId, {
      expressao: '1d20+11',
      motivo: 'Reflexos — Seelah',
      cd: 18,
    });
    const peloChat = await digitarNoChat(bruno, mesaId, '/r 1d20+11 cd 18');

    expect(pelaFicha.statusCode).toBe(201);
    // A prova de que existe uma aritmética só: os dois caminhos, o mesmo veredito.
    expect(pelaFicha.json<MensagemDTO>().avaliacao).toEqual(peloChat.json<MensagemDTO>().avaliacao);
  });

  it('sem o campo `cd`, a rota se comporta como sempre se comportou', async () => {
    const mesaId = await criarMesa('pathfinder2e');

    const resposta = await rolarComCd(bruno, mesaId, { expressao: '1d20+11', motivo: '' });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json<MensagemDTO>().avaliacao).toBeNull();
  });

  it('`cd: null` explícito é igual a não informar', async () => {
    const mesaId = await criarMesa('pathfinder2e');

    const resposta = await rolarComCd(bruno, mesaId, { expressao: '1d20+11', cd: null });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json<MensagemDTO>().avaliacao).toBeNull();
  });
});

describe('sistema que não avalia recusa a CD (RV-154)', () => {
  it('mesa genérica pelo chat: 400 em PT-BR e nenhuma mensagem criada', async () => {
    const mesaId = await criarMesa('generico');

    const resposta = await digitarNoChat(bruno, mesaId, '/r 1d20+5 cd 15');

    expect(resposta.statusCode).toBe(400);
    const erro = resposta.json<{ erro: string }>().erro;
    expect(erro).toContain('Genérico');
    expect(erro).toContain('grau de sucesso');

    const historico = await ambiente.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesaId}/mensagens`,
      headers: bruno.cabecalhos,
    });
    expect(historico.json<MensagemDTO[]>()).toEqual([]);
    expect(ambiente.fakes.publicador.doTipo('mensagem:nova')).toHaveLength(0);
  });

  it('mesa genérica pela rota de rolagens: mesmo 400', async () => {
    const mesaId = await criarMesa('generico');

    const resposta = await rolarComCd(bruno, mesaId, { expressao: '1d20+5', cd: 15 });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json<{ erro: string }>().erro).toContain('grau de sucesso');
  });

  it('a mesma mesa genérica SEM CD continua rolando', async () => {
    const mesaId = await criarMesa('generico');

    const resposta = await digitarNoChat(bruno, mesaId, '/r 1d20+5');

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json<MensagemDTO>().rolagem?.total).toBe(22);
  });
});

describe('borda — CD inválida (RV-154)', () => {
  const INVALIDAS = ['/r 1d20+3 cd 0', `/r 1d20+3 cd ${CD_MAXIMA + 1}`, '/r 1d20+3 cd 200'];

  it.each(INVALIDAS)('%s é 400 em PT-BR e não cria mensagem', async (linha) => {
    const mesaId = await criarMesa('pathfinder2e');

    const resposta = await digitarNoChat(bruno, mesaId, linha);

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json<{ erro: string }>().erro).toBe(MENSAGEM_CD_INVALIDA);
    const historico = await ambiente.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesaId}/mensagens`,
      headers: bruno.cabecalhos,
    });
    expect(historico.json<MensagemDTO[]>()).toEqual([]);
  });

  it('CD fora da faixa na rota de rolagens é 400 com a mesma frase', async () => {
    const mesaId = await criarMesa('pathfinder2e');

    const resposta = await rolarComCd(bruno, mesaId, { expressao: '1d20+3', cd: 200 });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json<{ erro: string }>().erro).toContain(MENSAGEM_CD_INVALIDA);
  });
});

describe('autorização — a CD não abre porta nenhuma (RV-154)', () => {
  it('não-participante com CD recebe 403 e nada é publicado na sala da mesa', async () => {
    // A guarda é do agregado `Mesa`, na chamada direta: sem tela no caminho (F4).
    const mesaId = await criarMesa('pathfinder2e');

    const pelaRota = await rolarComCd(estranho, mesaId, { expressao: '1d20+11', cd: 18 });
    const peloChat = await digitarNoChat(estranho, mesaId, '/r 1d20+11 cd 18');

    expect(pelaRota.statusCode).toBe(403);
    expect(peloChat.statusCode).toBe(403);
    expect(ambiente.fakes.publicador.doTipo('mensagem:nova')).toHaveLength(0);
    expect(ambiente.fakes.publicador.doTipo('mensagem:privada')).toHaveLength(0);
  });

  it('sem token, 401 — a CD não é caminho alternativo de autenticação', async () => {
    const mesaId = await criarMesa('pathfinder2e');

    const resposta = await ambiente.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesaId}/rolagens`,
      payload: { expressao: '1d20+11', cd: 18 },
    });

    expect(resposta.statusCode).toBe(401);
  });

  it('mesa encerrada não aceita rolagem com CD', async () => {
    const mesaId = await criarMesa('pathfinder2e');
    const encerrada = await ambiente.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesaId}/encerrar`,
      headers: mestre.cabecalhos,
    });
    expect(encerrada.statusCode).toBe(204);

    const resposta = await rolarComCd(bruno, mesaId, { expressao: '1d20+11', cd: 18 });

    expect(resposta.statusCode).toBe(409);
  });
});
