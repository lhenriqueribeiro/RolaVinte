import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  atributosIniciais,
  dadosIniciaisDaFicha,
  type CriarMesaEntrada,
  type MesaDTO,
  type PersonagemDTO,
  type SistemaRpg,
} from '@rolavinte/shared';
import { criarAppDeTeste, type AppDeTeste, type SessaoDeTeste } from '../../testes/harness';

/**
 * Contrato HTTP da ficha de Pathfinder 2e (RV-152).
 *
 * O que se prova aqui e em nenhum outro nível: que o sistema novo atravessa a
 * pilha inteira (criar mesa → criar ficha → editar ficha) com os status codes
 * certos, e que a autorização vale na **chamada direta** — esconder o botão na
 * interface não é controle de acesso (F4 da taxonomia).
 *
 * O que este arquivo **não** prova: que o Postgres aceita `'pathfinder2e'` na
 * coluna `mesas.sistema`. Isto roda com fakes. Quem cobre aquela ponta é
 * `apps/api/src/testes/check-de-sistemas.test.ts` (RV-096), comparando o enum
 * com o `check` declarado nas migrations em disco — e a migration `0008`, que
 * traz o valor, ainda **não** foi aplicada em ambiente nenhum.
 */

/**
 * Sem `atributos` de propósito (RV-098): o padrão é da escala do sistema, e o
 * `10` que estava aqui é valor de d20 clássico — fora da escala do PF2e (−5..+8),
 * hoje recusado com 400.
 */
const FICHA_BASE = {
  nome: 'Seelah',
  classe: 'Paladina',
  nivel: 1,
  pvMax: 20,
  anotacoes: '',
};

let ambiente: AppDeTeste;
let mestre: SessaoDeTeste;
let bruno: SessaoDeTeste;
let carla: SessaoDeTeste;

beforeEach(async () => {
  ambiente = criarAppDeTeste();
  mestre = await ambiente.autenticarComo({ nome: 'Mestre' });
  bruno = await ambiente.autenticarComo({ nome: 'Bruno' });
  carla = await ambiente.autenticarComo({ nome: 'Carla' });
});

afterEach(async () => {
  await ambiente.encerrar();
});

async function criarMesa(sistema: SistemaRpg): Promise<MesaDTO> {
  const corpo: CriarMesaEntrada = { nome: 'A Era das Cinzas', descricao: '', sistema };
  const r = await ambiente.app.inject({
    method: 'POST',
    url: '/api/mesas',
    headers: mestre.cabecalhos,
    payload: corpo,
  });
  expect(r.statusCode).toBe(201);
  return r.json<MesaDTO>();
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

  const token = ambiente.fakes.email.enviados.at(-1)?.html.match(/\/convites\/([\w-]+)/)?.[1];
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

/** Mesa de PF2e com o mestre, Bruno (dono de Seelah) e Carla. */
async function mesaDePathfinder() {
  const mesa = await criarMesa('pathfinder2e');
  await entrarNaMesa(mesa.id, bruno);
  await entrarNaMesa(mesa.id, carla);
  const seelah = await criarFicha(mesa.id, bruno);
  return { mesaId: mesa.id, seelah };
}

async function fichaDe(personagemId: string, mesaId: string): Promise<PersonagemDTO> {
  const lista = await ambiente.app.inject({
    method: 'GET',
    url: `/api/mesas/${mesaId}/personagens`,
    headers: bruno.cabecalhos,
  });
  const encontrada = lista.json<PersonagemDTO[]>().find((p) => p.id === personagemId);
  expect(encontrada, 'ficha sumiu da listagem').toBeDefined();
  return encontrada as PersonagemDTO;
}

describe('mesa de Pathfinder 2e (RV-152)', () => {
  it('o mestre cria a mesa com o sistema novo e ela aparece no dashboard', async () => {
    const mesa = await criarMesa('pathfinder2e');
    expect(mesa.sistema).toBe('pathfinder2e');

    const lista = await ambiente.app.inject({
      method: 'GET',
      url: '/api/mesas',
      headers: mestre.cabecalhos,
    });
    expect(lista.json<MesaDTO[]>().map((m) => m.sistema)).toContain('pathfinder2e');
  });

  it('a ficha nasce com o esqueleto do sistema: modificadores em +0 e nível 1', async () => {
    const { seelah } = await mesaDePathfinder();

    expect(seelah.sistema).toBe('pathfinder2e');
    expect(seelah.dados).toEqual(dadosIniciaisDaFicha('pathfinder2e'));
    // Os modificadores estão na coluna comum, na escala do sistema (RV-098): +0
    // numa ficha nova, e não o 10 do d20 clássico.
    expect(seelah.atributos).toEqual(atributosIniciais('pathfinder2e'));
    expect(seelah.atributos.destreza).toBe(0);
    expect(seelah.nivel).toBe(1);
  });
});

describe('PATCH /personagens/:id — ficha de PF2e (RV-152)', () => {
  it('o dono salva identidade e modificadores, e todos na mesa leem o mesmo', async () => {
    const { mesaId, seelah } = await mesaDePathfinder();
    const dados = {
      ...dadosIniciaisDaFicha('pathfinder2e'),
      ancestralidade: 'Humana',
      heranca: 'Versátil',
      antecedente: 'Guarda',
    };
    // Os modificadores vão na coluna comum, que é onde eles moram (RV-098).
    const atributos = { ...atributosIniciais('pathfinder2e'), forca: 4, carisma: 2 };

    const r = await ambiente.app.inject({
      method: 'PATCH',
      url: `/api/personagens/${seelah.id}`,
      headers: bruno.cabecalhos,
      payload: { dados, atributos },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json<PersonagemDTO>().dados).toEqual(dados);
    expect(r.json<PersonagemDTO>().atributos).toEqual(atributos);

    const lista = await ambiente.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesaId}/personagens`,
      headers: carla.cabecalhos,
    });
    expect(lista.json<PersonagemDTO[]>()[0]?.dados).toEqual(dados);
    expect(lista.json<PersonagemDTO[]>()[0]?.atributos).toEqual(atributos);
  });

  it('modificador acima do teto devolve 400 em PT-BR e não grava nada', async () => {
    const { mesaId, seelah } = await mesaDePathfinder();

    const r = await ambiente.app.inject({
      method: 'PATCH',
      url: `/api/personagens/${seelah.id}`,
      headers: bruno.cabecalhos,
      payload: { atributos: { ...atributosIniciais('pathfinder2e'), destreza: 9 } },
    });

    expect(r.statusCode).toBe(400);
    const erro = r.json<{ erro: string }>().erro;
    expect(erro).toContain('Destreza');
    expect(erro).toContain('de -5 a +8');
    expect((await fichaDe(seelah.id, mesaId)).atributos.destreza).toBe(0);
  });

  it('campo fora da definição devolve 400 nomeando o campo', async () => {
    const { seelah } = await mesaDePathfinder();

    const r = await ambiente.app.inject({
      method: 'PATCH',
      url: `/api/personagens/${seelah.id}`,
      headers: bruno.cabecalhos,
      payload: { dados: { pontos_de_heroismo: 3 } },
    });

    expect(r.statusCode).toBe(400);
    expect(r.json<{ erro: string }>().erro).toContain('pontos_de_heroismo');
  });

  it('jogador que não é dono recebe 403 — e a ficha continua como estava', async () => {
    const { mesaId, seelah } = await mesaDePathfinder();

    const r = await ambiente.app.inject({
      method: 'PATCH',
      url: `/api/personagens/${seelah.id}`,
      headers: carla.cabecalhos,
      payload: { atributos: { ...atributosIniciais('pathfinder2e'), forca: 4 } },
    });

    expect(r.statusCode).toBe(403);
    expect((await fichaDe(seelah.id, mesaId)).atributos.forca).toBe(0);
  });

  it('o mestre edita a ficha de qualquer jogador da mesa', async () => {
    const { seelah } = await mesaDePathfinder();

    const r = await ambiente.app.inject({
      method: 'PATCH',
      url: `/api/personagens/${seelah.id}`,
      headers: mestre.cabecalhos,
      payload: { atributos: { ...atributosIniciais('pathfinder2e'), forca: 3 } },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json<PersonagemDTO>().atributos.forca).toBe(3);
  });
});

describe('regressão — os sistemas antigos não sentem o novo (RV-152)', () => {
  it('a ficha de uma mesa genérica continua legível e editável, sem perder dado', async () => {
    const mesa = await criarMesa('generico');
    await entrarNaMesa(mesa.id, bruno);
    const antiga = await criarFicha(mesa.id, bruno, {
      nome: 'Balin',
      anotacoes: 'Machado do pai.',
    });

    expect(antiga.dados).toEqual({});

    const r = await ambiente.app.inject({
      method: 'PATCH',
      url: `/api/personagens/${antiga.id}`,
      headers: bruno.cabecalhos,
      payload: { pvAtual: 7, dados: {} },
    });

    expect(r.statusCode).toBe(200);
    const atualizada = r.json<PersonagemDTO>();
    expect(atualizada.pvAtual).toBe(7);
    expect(atualizada.anotacoes).toBe('Machado do pai.');
    expect(atualizada.dados).toEqual({});
  });

  it('a ficha de PF2e não é aceita numa mesa genérica', async () => {
    const mesa = await criarMesa('generico');
    await entrarNaMesa(mesa.id, bruno);

    const r = await ambiente.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesa.id}/personagens`,
      headers: bruno.cabecalhos,
      payload: { ...FICHA_BASE, dados: dadosIniciaisDaFicha('pathfinder2e') },
    });

    expect(r.statusCode).toBe(400);
    expect(r.json<{ erro: string }>().erro).toContain('ancestralidade');
  });
});
