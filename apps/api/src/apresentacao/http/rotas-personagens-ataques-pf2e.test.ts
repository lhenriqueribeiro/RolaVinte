import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  dadosIniciaisDaFicha,
  type CriarMesaEntrada,
  type MensagemDTO,
  type MesaDTO,
  type PersonagemDTO,
} from '@rolavinte/shared';
import { criarAppDeTeste, type AppDeTeste, type SessaoDeTeste } from '../../testes/harness';

/**
 * Contrato HTTP dos ataques de Pathfinder 2e (RV-156).
 *
 * O que se prova aqui e em nenhum outro nível:
 *
 * - a **autorização na chamada direta** — o cenário do card é "atacar pela ficha de
 *   outro jogador", e o ataque mora na ficha: quem não é dono não escreve nela.
 *   Desabilitar o botão na tela não é controle de acesso (F4 da taxonomia);
 * - que a penalidade de ataques múltiplos **não é gravável**: o `dados` estrito
 *   recusa qualquer número derivado com 400 nomeando o campo;
 * - a integração com o RV-154 ponta a ponta: a rolagem de **acerto** com a CA do
 *   alvo volta com `avaliacao`, e a de **dano** — que não é checada contra CD —
 *   volta com `avaliacao: null`. É a armadilha nº 4 do card vista de fora;
 * - que a expressão de dano é validada na entrada, e não no clique.
 *
 * O que este arquivo **não** prova: que o Postgres aceita a chave nova em
 * `personagens.dados`. `dados` é `jsonb` desde a `0007`, então não há migration a
 * fazer — mas isto roda com fakes, e a distinção é a F10.
 */

const FICHA_BASE = {
  nome: 'Seelah',
  classe: 'Paladina',
  nivel: 3,
  pvMax: 40,
  anotacoes: '',
};

/** Espada longa comum e adaga ágil, como o cenário do card. */
const ATAQUES_DE_SEELAH = [
  { nome: 'Espada longa', bonusAcerto: 9, dano: '1d8+4', agil: false },
  { nome: 'Adaga', bonusAcerto: 9, dano: '1d4+4', agil: true },
];

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

function comAtaques(ataques: unknown = ATAQUES_DE_SEELAH) {
  return { ...dadosIniciaisDaFicha('pathfinder2e'), ataques };
}

describe('PATCH /personagens/:id — a lista de ataques (RV-156)', () => {
  it('a ficha nasce sem ataque nenhum', async () => {
    const { seelah } = await mesaDePathfinder();
    expect(seelah.dados['ataques']).toEqual([]);
  });

  it('o dono grava os ataques informados, e todos na mesa leem os mesmos', async () => {
    const { mesaId, seelah } = await mesaDePathfinder();

    const r = await ambiente.app.inject({
      method: 'PATCH',
      url: `/api/personagens/${seelah.id}`,
      headers: bruno.cabecalhos,
      payload: { dados: comAtaques() },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json<PersonagemDTO>().dados['ataques']).toEqual(ATAQUES_DE_SEELAH);

    const lista = await ambiente.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesaId}/personagens`,
      headers: carla.cabecalhos,
    });
    expect(lista.json<PersonagemDTO[]>()[0]?.dados['ataques']).toEqual(ATAQUES_DE_SEELAH);
  });

  it.each(['penalidade', 'ordem', 'bonusComPenalidade', 'acerto'])(
    'número derivado (%s) dentro do ataque é 400 nomeando o campo',
    async (chave) => {
      const { seelah } = await mesaDePathfinder();

      // A penalidade é derivada da ordem que o jogador escolhe no golpe. Gravá-la
      // congelaria o −5 de uma arma que amanhã vira ágil — a segunda verdade que o
      // RV-098 fechou para o atributo.
      const r = await ambiente.app.inject({
        method: 'PATCH',
        url: `/api/personagens/${seelah.id}`,
        headers: bruno.cabecalhos,
        payload: {
          dados: comAtaques([{ ...ATAQUES_DE_SEELAH[0], [chave]: -5 }]),
        },
      });

      expect(r.statusCode).toBe(400);
      expect(r.json<{ erro: string }>().erro).toContain(chave);
    },
  );

  it.each([
    [{ nome: '', bonusAcerto: 9, dano: '1d8+4', agil: false }, 'informe o nome'],
    [{ nome: 'Espada', bonusAcerto: 99, dano: '1d8+4', agil: false }, 'o máximo é 40'],
    [{ nome: 'Espada', bonusAcerto: 9, dano: '1d8++4', agil: false }, 'expressão inválida'],
    [{ nome: 'Espada', bonusAcerto: 9, dano: '1d8+4', agil: 'sim' }, 'informe sim ou não'],
  ] as const)('ataque inválido devolve 400 em PT-BR e não grava nada', async (invalido, trecho) => {
    const { mesaId, seelah } = await mesaDePathfinder();

    const r = await ambiente.app.inject({
      method: 'PATCH',
      url: `/api/personagens/${seelah.id}`,
      headers: bruno.cabecalhos,
      payload: { dados: comAtaques([ATAQUES_DE_SEELAH[0], invalido]) },
    });

    expect(r.statusCode).toBe(400);
    expect(r.json<{ erro: string }>().erro.toLocaleLowerCase('pt-BR')).toContain(
      trecho.toLocaleLowerCase('pt-BR'),
    );
    // O ataque válido do mesmo payload também não entrou: a recusa é do `dados`
    // inteiro, não linha por linha.
    const gravada = await fichaDe(seelah.id, mesaId);
    expect(gravada.dados['ataques']).toEqual([]);
  });

  it('lista acima do teto é 400 dizendo o máximo', async () => {
    const { seelah } = await mesaDePathfinder();
    const nove = Array.from({ length: 9 }, (_, i) => ({
      nome: `Golpe ${i}`,
      bonusAcerto: 1,
      dano: '1d4',
      agil: false,
    }));

    const r = await ambiente.app.inject({
      method: 'PATCH',
      url: `/api/personagens/${seelah.id}`,
      headers: bruno.cabecalhos,
      payload: { dados: comAtaques(nove) },
    });

    expect(r.statusCode).toBe(400);
    expect(r.json<{ erro: string }>().erro).toContain('o máximo é 8');
  });

  it('ficha gravada antes deste card continua salvável: a lista nasce vazia', async () => {
    const { seelah } = await mesaDePathfinder();

    const r = await ambiente.app.inject({
      method: 'PATCH',
      url: `/api/personagens/${seelah.id}`,
      headers: bruno.cabecalhos,
      payload: {
        dados: { ancestralidade: 'Humana', heranca: 'Versátil', antecedente: 'Guarda' },
      },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json<PersonagemDTO>().dados['ataques']).toEqual([]);
  });

  it('bônus de acerto esvaziado na interface vira ausência, e não 400', async () => {
    const { seelah } = await mesaDePathfinder();

    const r = await ambiente.app.inject({
      method: 'PATCH',
      url: `/api/personagens/${seelah.id}`,
      headers: bruno.cabecalhos,
      payload: {
        dados: comAtaques([{ nome: 'Espada longa', bonusAcerto: '', dano: '', agil: false }]),
      },
    });

    expect(r.statusCode).toBe(200);
    const gravado = r.json<PersonagemDTO>().dados['ataques'] as { bonusAcerto: number | null }[];
    expect(gravado[0]?.bonusAcerto).toBeNull();
  });
});

describe('autorização dos ataques (RV-156, F4)', () => {
  it('jogador que não é dono recebe 403 ao acrescentar um ataque na ficha alheia', async () => {
    const { mesaId, seelah } = await mesaDePathfinder();

    const r = await ambiente.app.inject({
      method: 'PATCH',
      url: `/api/personagens/${seelah.id}`,
      headers: carla.cabecalhos,
      payload: { dados: comAtaques() },
    });

    expect(r.statusCode).toBe(403);
    const gravada = await fichaDe(seelah.id, mesaId);
    expect(gravada.dados['ataques']).toEqual([]);
  });

  it('quem não participa da mesa não publica rolagem de ataque na sala', async () => {
    const { mesaId } = await mesaDePathfinder();
    const forasteiro = await ambiente.autenticarComo({ nome: 'Forasteiro' });

    const r = await ambiente.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesaId}/rolagens`,
      headers: forasteiro.cabecalhos,
      payload: { expressao: '1d20+4', motivo: 'Espada longa (2º ataque (-5)) — Seelah', cd: 18 },
    });

    expect(r.statusCode).toBe(403);
    // Nada saiu na sala da mesa: a proteção é do caso de uso, não da tela.
    expect(ambiente.fakes.publicador.doTipo('mensagem:nova')).toEqual([]);
    expect(ambiente.fakes.publicador.doTipo('mensagem:privada')).toEqual([]);
  });

  it('sem token, a rolagem de ataque é 401', async () => {
    const { mesaId } = await mesaDePathfinder();

    const r = await ambiente.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesaId}/rolagens`,
      payload: { expressao: '1d20+9', motivo: 'Espada longa (1º ataque) — Seelah' },
    });

    expect(r.statusCode).toBe(401);
  });
});

describe('acerto e dano no chat: duas rolagens, e só uma tem grau (RV-156 × RV-154)', () => {
  it('o acerto com a CA do alvo volta avaliado; o dano, nunca', async () => {
    const { mesaId } = await mesaDePathfinder();

    // Acerto do 2º golpe da espada: 1d20+4 contra a CA 18 do alvo. É a CD do RV-154
    // chegando como **número**, e não como o sufixo `cd 18` de quem digita.
    const acerto = await ambiente.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesaId}/rolagens`,
      headers: bruno.cabecalhos,
      payload: { expressao: '1d20+4', motivo: 'Espada longa (2º ataque (-5)) — Seelah', cd: 18 },
    });

    expect(acerto.statusCode).toBe(201);
    const mensagemDoAcerto = acerto.json<MensagemDTO>();
    expect(mensagemDoAcerto.avaliacao).not.toBeNull();
    expect(mensagemDoAcerto.avaliacao?.cd).toBe(18);
    expect(mensagemDoAcerto.motivo).toContain('Espada longa');

    // Dano: mesma rota, sem CD. Dano não é checado contra nada — um grau aqui seria
    // "Falha crítica" num 1d8+4, que não significa nada.
    const dano = await ambiente.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesaId}/rolagens`,
      headers: bruno.cabecalhos,
      payload: { expressao: '1d8+4', motivo: 'Dano de Espada longa — Seelah' },
    });

    expect(dano.statusCode).toBe(201);
    expect(dano.json<MensagemDTO>().avaliacao).toBeNull();
    expect(dano.json<MensagemDTO>().motivo).toBe('Dano de Espada longa — Seelah');
  });

  it('o dano dobrado do crítico é uma segunda rolagem, publicada só quando pedida', async () => {
    const { mesaId } = await mesaDePathfinder();

    const r = await ambiente.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesaId}/rolagens`,
      headers: bruno.cabecalhos,
      payload: {
        expressao: '1d8+4+1d8+4',
        motivo: 'Dano dobrado de Espada longa (sucesso crítico) — Seelah',
      },
    });

    expect(r.statusCode).toBe(201);
    const mensagem = r.json<MensagemDTO>();
    expect(mensagem.avaliacao).toBeNull();
    expect(mensagem.rolagem?.total).toBeGreaterThanOrEqual(10);
    // Uma requisição, uma mensagem: nada foi dobrado de carona no acerto.
    const publicadas = ambiente.fakes.publicador
      .doTipo('mensagem:nova')
      .filter((evento) => evento.mesaId === mesaId);
    expect(publicadas).toHaveLength(1);
  });

  it('as três expressões de acerto do card atravessam a rota e viram três mensagens', async () => {
    const { mesaId } = await mesaDePathfinder();

    for (const [ordem, expressao] of [
      ['1º ataque', '1d20+9'],
      ['2º ataque (-5)', '1d20+4'],
      ['3º ataque ou mais (-10)', '1d20-1'],
    ] as const) {
      const r = await ambiente.app.inject({
        method: 'POST',
        url: `/api/mesas/${mesaId}/rolagens`,
        headers: bruno.cabecalhos,
        payload: { expressao, motivo: `Espada longa (${ordem}) — Seelah`, cd: 18 },
      });

      expect(r.statusCode, expressao).toBe(201);
      // A ordem escolhida vai no motivo, para o chat dizer qual golpe era.
      expect(r.json<MensagemDTO>().motivo).toContain(ordem);
      expect(r.json<MensagemDTO>().avaliacao?.cd).toBe(18);
    }

    const historico = await ambiente.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesaId}/mensagens`,
      headers: carla.cabecalhos,
    });
    expect(historico.json<MensagemDTO[]>()).toHaveLength(3);
  });
});
