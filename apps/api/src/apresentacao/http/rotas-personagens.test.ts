import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  dadosIniciaisDaFicha,
  type CenaComTokensDTO,
  type CenaDTO,
  type CriarMesaEntrada,
  type MesaDTO,
  type PersonagemDTO,
  type SistemaRpg,
  type TokenDTO,
} from '@rolavinte/shared';
import { criarAppDeTeste, type AppDeTeste, type SessaoDeTeste } from '../../testes/harness';

/**
 * Contrato HTTP das fichas (RV-091 e RV-093).
 *
 * O que se prova aqui e em nenhum outro nível: os status codes, e que a
 * autorização vale na **chamada direta** — esconder o botão na interface não é
 * controle de acesso (F4 da taxonomia).
 */

const FICHA_BASE = {
  nome: 'Thorin',
  classe: 'Guerreiro',
  nivel: 3,
  pvMax: 30,
  atributos: {
    forca: 16,
    destreza: 16,
    constituicao: 14,
    inteligencia: 10,
    sabedoria: 10,
    carisma: 10,
  },
  anotacoes: 'Machado do pai.',
};

let ambiente: AppDeTeste;
let mestre: SessaoDeTeste;
let bruno: SessaoDeTeste;
let carla: SessaoDeTeste;
let estranho: SessaoDeTeste;

beforeEach(async () => {
  ambiente = criarAppDeTeste();
  mestre = await ambiente.autenticarComo({ nome: 'Mestre' });
  bruno = await ambiente.autenticarComo({ nome: 'Bruno' });
  carla = await ambiente.autenticarComo({ nome: 'Carla' });
  estranho = await ambiente.autenticarComo({ nome: 'Estranho' });
});

afterEach(async () => {
  await ambiente.encerrar();
});

async function criarMesa(sistema: SistemaRpg): Promise<string> {
  const corpo: CriarMesaEntrada = { nome: 'A Maldição de Strahd', descricao: '', sistema };
  const r = await ambiente.app.inject({
    method: 'POST',
    url: '/api/mesas',
    headers: mestre.cabecalhos,
    payload: corpo,
  });
  expect(r.statusCode).toBe(201);
  return r.json<MesaDTO>().id;
}

async function entrarNaMesa(mesaId: string, sessao: SessaoDeTeste): Promise<void> {
  const convite = await ambiente.app.inject({
    method: 'POST',
    url: `/api/mesas/${mesaId}/convites`,
    headers: mestre.cabecalhos,
    payload: { email: sessao.usuario.email },
  });
  expect(convite.statusCode).toBe(201);
  await ambiente.aguardarEventos();

  const link = ambiente.fakes.email.enviados.at(-1)?.html.match(/\/convites\/([\w-]+)/);
  const token = link?.[1];
  expect(token, 'token de convite não encontrado no email').toBeTruthy();

  const aceite = await ambiente.app.inject({
    method: 'POST',
    url: '/api/convites/aceitar',
    headers: sessao.cabecalhos,
    payload: { token },
  });
  expect(aceite.statusCode).toBe(200);
}

async function criarFicha(
  mesaId: string,
  sessao: SessaoDeTeste,
  corpo: Record<string, unknown> = {},
): Promise<PersonagemDTO> {
  const r = await ambiente.app.inject({
    method: 'POST',
    url: `/api/mesas/${mesaId}/personagens`,
    headers: sessao.cabecalhos,
    payload: { ...FICHA_BASE, ...corpo },
  });
  expect(r.statusCode).toBe(201);
  return r.json<PersonagemDTO>();
}

/** Mesa dnd5e com o mestre, Bruno (dono de Thorin) e Carla. */
async function mesaComFicha(sistema: SistemaRpg = 'dnd5e') {
  const mesaId = await criarMesa(sistema);
  await entrarNaMesa(mesaId, bruno);
  await entrarNaMesa(mesaId, carla);
  const thorin = await criarFicha(mesaId, bruno);
  return { mesaId, thorin };
}

describe('POST /mesas/:mesaId/personagens — ficha por sistema (RV-091)', () => {
  it('a ficha nasce com o sistema da mesa e os padrões da definição', async () => {
    const mesaId = await criarMesa('dnd5e');
    await entrarNaMesa(mesaId, bruno);

    const thorin = await criarFicha(mesaId, bruno);

    expect(thorin.sistema).toBe('dnd5e');
    expect(thorin.dados).toEqual(dadosIniciaisDaFicha('dnd5e'));
  });

  it('campo que não existe na definição do sistema devolve 400 nomeando o campo', async () => {
    const mesaId = await criarMesa('dnd5e');
    await entrarNaMesa(mesaId, bruno);

    const r = await ambiente.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesaId}/personagens`,
      headers: bruno.cabecalhos,
      payload: { ...FICHA_BASE, dados: { pontos_de_heroismo: 3 } },
    });

    expect(r.statusCode).toBe(400);
    expect(r.json<{ erro: string }>().erro).toContain('pontos_de_heroismo');
  });

  it('`dados` que não é objeto devolve 400 em PT-BR', async () => {
    const mesaId = await criarMesa('dnd5e');
    await entrarNaMesa(mesaId, bruno);

    const r = await ambiente.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesaId}/personagens`,
      headers: bruno.cabecalhos,
      payload: { ...FICHA_BASE, dados: 'texto solto' },
    });

    expect(r.statusCode).toBe(400);
    expect(r.json<{ erro: string }>().erro).toContain('objeto');
  });

  it('a ficha genérica continua funcionando igual e recusa campo de sistema', async () => {
    const mesaId = await criarMesa('generico');
    await entrarNaMesa(mesaId, bruno);

    const thorin = await criarFicha(mesaId, bruno);
    expect(thorin.sistema).toBe('generico');
    expect(thorin.dados).toEqual({});
    expect(thorin.pvAtual).toBe(30);
    expect(thorin.anotacoes).toBe('Machado do pai.');

    const r = await ambiente.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesaId}/personagens`,
      headers: bruno.cabecalhos,
      payload: { ...FICHA_BASE, nome: 'Balin', dados: { ca: 15 } },
    });
    expect(r.statusCode).toBe(400);
  });
});

describe('PATCH /personagens/:id — a ficha do sistema (RV-091)', () => {
  it('salva a ficha do sistema e a devolve na listagem', async () => {
    const { mesaId, thorin } = await mesaComFicha();
    const dados = { ...dadosIniciaisDaFicha('dnd5e'), ca: 18, inspiracao: true };

    const r = await ambiente.app.inject({
      method: 'PATCH',
      url: `/api/personagens/${thorin.id}`,
      headers: bruno.cabecalhos,
      payload: { dados },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json<PersonagemDTO>().dados).toEqual(dados);

    const lista = await ambiente.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesaId}/personagens`,
      headers: carla.cabecalhos,
    });
    expect(lista.json<PersonagemDTO[]>()[0]?.dados).toEqual(dados);
  });

  it('campo fora da definição devolve 400 na edição', async () => {
    const { thorin } = await mesaComFicha();

    const r = await ambiente.app.inject({
      method: 'PATCH',
      url: `/api/personagens/${thorin.id}`,
      headers: bruno.cabecalhos,
      payload: { dados: { mana: 20 } },
    });

    expect(r.statusCode).toBe(400);
    expect(r.json<{ erro: string }>().erro).toContain('mana');
  });
});

describe('DELETE /personagens/:id (RV-093)', () => {
  it('o dono exclui e a ficha some da lista para todos', async () => {
    const { mesaId, thorin } = await mesaComFicha();

    const r = await ambiente.app.inject({
      method: 'DELETE',
      url: `/api/personagens/${thorin.id}`,
      headers: bruno.cabecalhos,
    });

    expect(r.statusCode).toBe(204);
    expect(r.body).toBe('');

    for (const sessao of [bruno, carla, mestre]) {
      const lista = await ambiente.app.inject({
        method: 'GET',
        url: `/api/mesas/${mesaId}/personagens`,
        headers: sessao.cabecalhos,
      });
      expect(lista.json<PersonagemDTO[]>()).toEqual([]);
    }
  });

  it('o mestre exclui a ficha de qualquer jogador', async () => {
    const { thorin } = await mesaComFicha();

    const r = await ambiente.app.inject({
      method: 'DELETE',
      url: `/api/personagens/${thorin.id}`,
      headers: mestre.cabecalhos,
    });

    expect(r.statusCode).toBe(204);
  });

  it('jogador que não é dono recebe 403 — e a ficha continua existindo', async () => {
    const { mesaId, thorin } = await mesaComFicha();

    const r = await ambiente.app.inject({
      method: 'DELETE',
      url: `/api/personagens/${thorin.id}`,
      headers: carla.cabecalhos,
    });

    expect(r.statusCode).toBe(403);
    const lista = await ambiente.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesaId}/personagens`,
      headers: bruno.cabecalhos,
    });
    expect(lista.json<PersonagemDTO[]>()).toHaveLength(1);
  });

  it('quem nem participa da mesa recebe 403', async () => {
    const { thorin } = await mesaComFicha();

    const r = await ambiente.app.inject({
      method: 'DELETE',
      url: `/api/personagens/${thorin.id}`,
      headers: estranho.cabecalhos,
    });

    expect(r.statusCode).toBe(403);
  });

  it('sem token, 401', async () => {
    const { thorin } = await mesaComFicha();

    const r = await ambiente.app.inject({
      method: 'DELETE',
      url: `/api/personagens/${thorin.id}`,
    });

    expect(r.statusCode).toBe(401);
  });

  it('ficha inexistente devolve 404', async () => {
    await mesaComFicha();

    const r = await ambiente.app.inject({
      method: 'DELETE',
      url: '/api/personagens/00000000-0000-4000-9000-0000000000ff',
      headers: mestre.cabecalhos,
    });

    expect(r.statusCode).toBe(404);
  });

  it('o token que referenciava a ficha continua no mapa, e sem barra de vida', async () => {
    const { mesaId, thorin } = await mesaComFicha();
    const cena = await ambiente.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesaId}/cenas`,
      headers: mestre.cabecalhos,
      payload: { nome: 'Taverna' },
    });
    expect(cena.statusCode).toBe(201);
    const cenaId = cena.json<CenaDTO>().id;
    const token = await ambiente.app.inject({
      method: 'POST',
      url: `/api/cenas/${cenaId}/tokens`,
      headers: mestre.cabecalhos,
      payload: { nome: 'Thorin', x: 2, y: 2, personagemId: thorin.id },
    });
    expect(token.statusCode).toBe(201);
    const tokenId = token.json<TokenDTO>().id;

    const exclusao = await ambiente.app.inject({
      method: 'DELETE',
      url: `/api/personagens/${thorin.id}`,
      headers: bruno.cabecalhos,
    });
    expect(exclusao.statusCode).toBe(204);

    const tabletop = await ambiente.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesaId}/cena`,
      headers: bruno.cabecalhos,
    });
    const conteudo = tabletop.json<CenaComTokensDTO>();

    // A peça sobrevive à exclusão da ficha: é o que o card pede, e é o que a
    // FK `on delete set null` da migration 0001 garante no banco.
    expect(conteudo.tokens.map((t) => t.id)).toEqual([tokenId]);
    // E a barra de vida some porque ela é desenhada a partir do PV do
    // `PersonagemDTO`, que deixou de existir na listagem — nunca a partir do
    // token (ver o comentário de `TokenDTO.imagemUrl` em dtos.ts).
    const lista = await ambiente.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesaId}/personagens`,
      headers: bruno.cabecalhos,
    });
    expect(lista.json<PersonagemDTO[]>()).toEqual([]);
  });

  it('mesa encerrada devolve 409 (RV-027)', async () => {
    const { mesaId, thorin } = await mesaComFicha();
    const encerrar = await ambiente.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesaId}/encerrar`,
      headers: mestre.cabecalhos,
      payload: {},
    });
    expect(encerrar.statusCode).toBe(204);

    const r = await ambiente.app.inject({
      method: 'DELETE',
      url: `/api/personagens/${thorin.id}`,
      headers: bruno.cabecalhos,
    });

    expect(r.statusCode).toBe(409);
  });
});

describe('POST /personagens/:id/duplicar (RV-093)', () => {
  it('201 com id novo, "(cópia)" no nome e PV cheio', async () => {
    const { mesaId, thorin } = await mesaComFicha();
    await ambiente.app.inject({
      method: 'PATCH',
      url: `/api/personagens/${thorin.id}`,
      headers: bruno.cabecalhos,
      payload: { pvAtual: 4, dados: { ...dadosIniciaisDaFicha('dnd5e'), ca: 18 } },
    });

    const r = await ambiente.app.inject({
      method: 'POST',
      url: `/api/personagens/${thorin.id}/duplicar`,
      headers: bruno.cabecalhos,
      payload: {},
    });

    expect(r.statusCode).toBe(201);
    const copia = r.json<PersonagemDTO>();
    expect(copia.id).not.toBe(thorin.id);
    expect(copia.nome).toBe('Thorin (cópia)');
    expect(copia.pvAtual).toBe(30);
    expect(copia.donoId).toBe(bruno.usuario.id);
    expect(copia.dados.ca).toBe(18);

    const lista = await ambiente.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesaId}/personagens`,
      headers: carla.cabecalhos,
    });
    expect(lista.json<PersonagemDTO[]>()).toHaveLength(2);
  });

  it('o mestre duplica a ficha do jogador e a cópia continua sendo dele', async () => {
    const { thorin } = await mesaComFicha();

    const r = await ambiente.app.inject({
      method: 'POST',
      url: `/api/personagens/${thorin.id}/duplicar`,
      headers: mestre.cabecalhos,
      payload: {},
    });

    expect(r.statusCode).toBe(201);
    expect(r.json<PersonagemDTO>().donoId).toBe(bruno.usuario.id);
  });

  it('jogador que não é dono recebe 403', async () => {
    const { thorin } = await mesaComFicha();

    const r = await ambiente.app.inject({
      method: 'POST',
      url: `/api/personagens/${thorin.id}/duplicar`,
      headers: carla.cabecalhos,
      payload: {},
    });

    expect(r.statusCode).toBe(403);
  });

  it('ficha inexistente devolve 404', async () => {
    await mesaComFicha();

    const r = await ambiente.app.inject({
      method: 'POST',
      url: '/api/personagens/00000000-0000-4000-9000-0000000000ff/duplicar',
      headers: mestre.cabecalhos,
      payload: {},
    });

    expect(r.statusCode).toBe(404);
  });
});
