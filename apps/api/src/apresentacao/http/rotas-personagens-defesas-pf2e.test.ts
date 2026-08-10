import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  dadosIniciaisDaFicha,
  type CriarMesaEntrada,
  type MesaDTO,
  type PersonagemDTO,
} from '@rolavinte/shared';
import { criarAppDeTeste, type AppDeTeste, type SessaoDeTeste } from '../../testes/harness';

/**
 * Contrato HTTP das defesas de Pathfinder 2e (RV-155).
 *
 * O que se prova aqui e em nenhum outro nível:
 *
 * - a **autorização na chamada direta** — desabilitar o `select` de grau na
 *   interface não é controle de acesso (F4 da taxonomia). O cenário do card é
 *   "jogador tentando alterar os campos de armadura da ficha de outro jogador";
 * - que as faixas dos campos informados são cobradas pela API, com mensagem em
 *   PT-BR, e que **nada é gravado** quando a recusa acontece;
 * - que o campo de limite de Destreza esvaziado atravessa a pilha como ausência, e
 *   não como erro — é a borda do card ("armadura sem limite de Destreza").
 *
 * O que este arquivo **não** prova: que o Postgres aceita as chaves novas em
 * `personagens.dados`. `dados` é `jsonb` desde a `0007` e não tem esquema por
 * chave, então nenhuma migration é necessária — mas isto roda com fakes, e é a
 * distinção que a taxonomia chama de F10.
 */

/** Sem `atributos`: o padrão é o da escala do sistema (+0 em tudo, RV-098). */
const FICHA_BASE = {
  nome: 'Seelah',
  classe: 'Paladina',
  nivel: 3,
  pvMax: 40,
  anotacoes: '',
};

/** Os campos informados das defesas de uma paladina de meia-armadura. */
const DEFESAS_DE_SEELAH = {
  grauArmadura: 'perito',
  bonusItemArmadura: 4,
  limiteDestrezaArmadura: 1,
  grauFortitude: 'perito',
  grauReflexos: 'treinado',
  grauVontade: 'treinado',
  grauPercepcao: 'perito',
  grauCdClasse: 'treinado',
  atributoChaveClasse: 'carisma',
  pvDaAncestralidade: 8,
  pvDaClassePorNivel: 10,
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

/** Mesa de PF2e com o mestre, Bruno (dono de Seelah) e Carla. */
async function mesaDePathfinder() {
  const corpo: CriarMesaEntrada = {
    nome: 'A Era das Cinzas',
    descricao: '',
    sistema: 'pathfinder2e',
  };
  const criada = await ambiente.app.inject({
    method: 'POST',
    url: '/api/mesas',
    headers: mestre.cabecalhos,
    payload: corpo,
  });
  expect(criada.statusCode).toBe(201);
  const mesa = criada.json<MesaDTO>();

  await entrarNaMesa(mesa.id, bruno);
  await entrarNaMesa(mesa.id, carla);

  const ficha = await ambiente.app.inject({
    method: 'POST',
    url: `/api/mesas/${mesa.id}/personagens`,
    headers: bruno.cabecalhos,
    payload: FICHA_BASE,
  });
  expect(ficha.statusCode).toBe(201);
  return { mesaId: mesa.id, seelah: ficha.json<PersonagemDTO>() };
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

function comDefesas(extra: Record<string, unknown> = {}) {
  return { ...dadosIniciaisDaFicha('pathfinder2e'), ...DEFESAS_DE_SEELAH, ...extra };
}

describe('PATCH /personagens/:id — campos informados das defesas (RV-155)', () => {
  it('a ficha nasce com as defesas destreinadas e sem armadura', async () => {
    const { seelah } = await mesaDePathfinder();

    expect(seelah.dados['grauArmadura']).toBe('destreinado');
    expect(seelah.dados['grauPercepcao']).toBe('destreinado');
    expect(seelah.dados['bonusItemArmadura']).toBe(0);
    // Ausência, e não zero: sem armadura não há teto de Destreza.
    expect(seelah.dados['limiteDestrezaArmadura']).toBeNull();
    expect(seelah.dados['atributoChaveClasse']).toBe('');
  });

  it('o dono salva graus e armadura, e todos na mesa leem o mesmo', async () => {
    const { mesaId, seelah } = await mesaDePathfinder();
    const dados = comDefesas();

    const r = await ambiente.app.inject({
      method: 'PATCH',
      url: `/api/personagens/${seelah.id}`,
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

  it('nenhum número derivado é aceito em `dados` — CA gravada é 400 nomeando o campo', async () => {
    const { seelah } = await mesaDePathfinder();

    // A CA é derivada dos graus e da armadura. Aceitá-la aqui reabriria a segunda
    // verdade que o RV-098 fechou para o atributo: o personagem sobe de nível e o
    // número gravado continua o de antes.
    for (const chave of ['ca', 'fortitude', 'percepcao', 'cdClasse', 'pvSugerido']) {
      const r = await ambiente.app.inject({
        method: 'PATCH',
        url: `/api/personagens/${seelah.id}`,
        headers: bruno.cabecalhos,
        payload: { dados: { ...comDefesas(), [chave]: 22 } },
      });

      expect(r.statusCode, chave).toBe(400);
      expect(r.json<{ erro: string }>().erro, chave).toContain(chave);
    }
  });

  it('ficha gravada antes deste card continua salvável: as chaves novas nascem no padrão', async () => {
    const { seelah } = await mesaDePathfinder();

    // A metade do sistema como o RV-153 a deixou, sem nenhuma chave de defesa. É o
    // que volta do banco para todo personagem de PF2e criado antes deste card, e o
    // `schemaFicha` aplica os padrões em vez de recusar.
    const r = await ambiente.app.inject({
      method: 'PATCH',
      url: `/api/personagens/${seelah.id}`,
      headers: bruno.cabecalhos,
      payload: {
        dados: { ancestralidade: 'Humana', heranca: 'Versátil', antecedente: 'Guarda' },
      },
    });

    expect(r.statusCode).toBe(200);
    const dados = r.json<PersonagemDTO>().dados;
    expect(dados['ancestralidade']).toBe('Humana');
    expect(dados['grauReflexos']).toBe('destreinado');
    expect(dados['limiteDestrezaArmadura']).toBeNull();
  });

  it('o limite de Destreza esvaziado na interface vira ausência, e não 400', async () => {
    const { seelah } = await mesaDePathfinder();

    // A interface manda `''` quando o jogador limpa um campo numérico, e para este
    // campo isso é a resposta normal da regra: esta armadura não limita a Destreza.
    const r = await ambiente.app.inject({
      method: 'PATCH',
      url: `/api/personagens/${seelah.id}`,
      headers: bruno.cabecalhos,
      payload: { dados: comDefesas({ limiteDestrezaArmadura: '' }) },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json<PersonagemDTO>().dados['limiteDestrezaArmadura']).toBeNull();
  });

  it.each([
    ['bonusItemArmadura', 10, 'Bônus de item da armadura'],
    ['limiteDestrezaArmadura', 6, 'Limite de Destreza'],
    ['grauFortitude', 'quase-treinado', 'Grau de treinamento inválido'],
    ['atributoChaveClasse', 'sorte', 'Atributo-chave'],
    ['pvDaAncestralidade', 13, 'PV da ancestralidade'],
  ] as const)(
    'valor fora da faixa em %s devolve 400 em PT-BR e não grava nada',
    async (chave, valor, trechoEsperado) => {
      const { mesaId, seelah } = await mesaDePathfinder();

      const r = await ambiente.app.inject({
        method: 'PATCH',
        url: `/api/personagens/${seelah.id}`,
        headers: bruno.cabecalhos,
        payload: { dados: comDefesas({ [chave]: valor }) },
      });

      expect(r.statusCode).toBe(400);
      expect(r.json<{ erro: string }>().erro).toContain(trechoEsperado);
      // A ficha continua como nasceu: a recusa não gravou os outros campos do
      // mesmo payload por tabela.
      const gravada = await fichaDe(seelah.id, mesaId);
      expect(gravada.dados['grauArmadura']).toBe('destreinado');
      expect(gravada.dados['bonusItemArmadura']).toBe(0);
    },
  );
});

describe('autorização das defesas (RV-155, F4)', () => {
  it('jogador que não é dono recebe 403 ao alterar a armadura — e a ficha continua como estava', async () => {
    const { mesaId, seelah } = await mesaDePathfinder();

    const r = await ambiente.app.inject({
      method: 'PATCH',
      url: `/api/personagens/${seelah.id}`,
      headers: carla.cabecalhos,
      payload: { dados: comDefesas({ bonusItemArmadura: 9 }) },
    });

    expect(r.statusCode).toBe(403);
    const gravada = await fichaDe(seelah.id, mesaId);
    expect(gravada.dados['bonusItemArmadura']).toBe(0);
    expect(gravada.dados['grauArmadura']).toBe('destreinado');
  });

  it('sem token, alterar a armadura é 401', async () => {
    const { seelah } = await mesaDePathfinder();

    const r = await ambiente.app.inject({
      method: 'PATCH',
      url: `/api/personagens/${seelah.id}`,
      payload: { dados: comDefesas() },
    });

    expect(r.statusCode).toBe(401);
  });

  it('o mestre edita as defesas de qualquer ficha da mesa', async () => {
    const { seelah } = await mesaDePathfinder();

    const r = await ambiente.app.inject({
      method: 'PATCH',
      url: `/api/personagens/${seelah.id}`,
      headers: mestre.cabecalhos,
      payload: { dados: comDefesas({ grauPercepcao: 'lendario' }) },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json<PersonagemDTO>().dados['grauPercepcao']).toBe('lendario');
  });
});
