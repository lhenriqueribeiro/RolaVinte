import { beforeEach, describe, expect, it } from 'vitest';
import {
  CONDICAO_INCONSCIENTE,
  MENSAGEM_DELTA_PV,
  MENSAGEM_PARTICIPANTE_DUPLICADO,
  type CenaDTO,
  type CombateAtivoDTO,
  type CombateDTO,
  type MensagemDTO,
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
import {
  APENAS_MESTRE_INICIA_COMBATE,
  COMBATE_ATIVO_EXISTE,
} from '../../aplicacao/jogo/iniciar-combate';
import { APENAS_MESTRE_PASSA_TURNO } from '../../aplicacao/jogo/passar-turno';
import { APENAS_MESTRE_ENCERRA_COMBATE } from '../../aplicacao/jogo/encerrar-combate';
import { APENAS_MESTRE_APLICA_DANO, TOKEN_SEM_FICHA } from '../../aplicacao/jogo/aplicar-dano';
import {
  INICIATIVA_DE_TERCEIRO,
  INICIATIVA_INFORMADA_E_DO_MESTRE,
  INICIATIVA_SEM_FICHA,
  motivoIniciativa,
} from '../../aplicacao/jogo/rolar-iniciativa';
import { textoAlteracaoPv, textoNovaRodada } from '../../aplicacao/jogo/aviso-de-combate';

/**
 * Contrato HTTP do combate (RV-061, RV-062, RV-065).
 *
 * O que só se prova aqui: os **status** que a UI vai ver (201, 403, 409, 400,
 * 404) e o fato de que a recusa acontece na chamada direta — esconder o botão de
 * "passar turno" do jogador não é proteção (F4 da taxonomia). O `rateLimit` do
 * harness está desligado, então todos os `inject` saem do mesmo IP sem estourar.
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
  mestre: SessaoDeTeste,
  cenaId: string,
  corpo: Record<string, unknown>,
): Promise<TokenDTO> {
  const resposta = await contexto.app.inject({
    method: 'POST',
    url: `/api/cenas/${cenaId}/tokens`,
    headers: mestre.cabecalhos,
    payload: { x: 2, y: 3, ...corpo },
  });
  expect(resposta.statusCode).toBe(201);
  return resposta.json<TokenDTO>();
}

async function criarPersonagem(
  dono: SessaoDeTeste,
  mesaId: string,
  nome: string,
  pvMax: number,
): Promise<PersonagemDTO> {
  const resposta = await contexto.app.inject({
    method: 'POST',
    url: `/api/mesas/${mesaId}/personagens`,
    headers: dono.cabecalhos,
    payload: { nome, classe: 'Guerreiro', nivel: 3, pvMax },
  });
  expect(resposta.statusCode).toBe(201);
  return resposta.json<PersonagemDTO>();
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

interface Mesa {
  mestre: SessaoDeTeste;
  jogador: SessaoDeTeste;
  mesaId: string;
  cenaId: string;
  /** Token vinculado à ficha do jogador. */
  tokenHeroi: string;
  /** Token sem ficha. */
  tokenNpc: string;
  personagemId: string;
}

/** Mesa com mestre, um jogador com ficha de 30 PV, um herói e um NPC na cena. */
async function montarMesa(): Promise<Mesa> {
  const mestre = await contexto.autenticarComo({ nome: 'Mestre' });
  const jogador = await contexto.autenticarComo({ nome: 'Bruno' });
  const mesa = await criarMesa(mestre);
  await adicionarJogador(mestre, mesa.id, jogador);
  const cena = await criarCena(mestre, mesa.id);
  const ficha = await criarPersonagem(jogador, mesa.id, 'Thorin', 30);
  const heroi = await criarToken(mestre, cena.id, { nome: 'Thorin', personagemId: ficha.id });
  const npc = await criarToken(mestre, cena.id, { nome: 'Goblin', x: 5 });
  return {
    mestre,
    jogador,
    mesaId: mesa.id,
    cenaId: cena.id,
    tokenHeroi: heroi.id,
    tokenNpc: npc.id,
    personagemId: ficha.id,
  };
}

async function iniciar(mesa: Mesa, tokenIds: string[] = [mesa.tokenHeroi, mesa.tokenNpc]) {
  const resposta = await contexto.app.inject({
    method: 'POST',
    url: `/api/mesas/${mesa.mesaId}/combate`,
    headers: mesa.mestre.cabecalhos,
    payload: { tokenIds },
  });
  return resposta;
}

async function iniciarOk(mesa: Mesa, tokenIds?: string[]): Promise<CombateDTO> {
  const resposta = await iniciar(mesa, tokenIds);
  expect(resposta.statusCode).toBe(201);
  return resposta.json<CombateDTO>();
}

/** Só os avisos de sistema no chat, na ordem. */
async function avisos(mesa: Mesa): Promise<string[]> {
  const resposta = await contexto.app.inject({
    method: 'GET',
    url: `/api/mesas/${mesa.mesaId}/mensagens`,
    headers: mesa.mestre.cabecalhos,
  });
  expect(resposta.statusCode).toBe(200);
  return resposta
    .json<MensagemDTO[]>()
    .filter((m) => m.tipo === 'sistema')
    .map((m) => m.conteudo);
}

describe('POST /mesas/:mesaId/combate — iniciar (RV-061)', () => {
  it('mestre inicia e recebe 201 com a ordem e o turno prontos', async () => {
    const mesa = await montarMesa();

    const resposta = await iniciar(mesa);

    expect(resposta.statusCode).toBe(201);
    const combate = resposta.json<CombateDTO>();
    expect(combate.rodada).toBe(1);
    expect(combate.ativo).toBe(true);
    expect(combate.participantes.map((p) => p.nome)).toEqual(['Thorin', 'Goblin']);
    expect(combate.tokenIdDoTurno).toBe(mesa.tokenHeroi);
  });

  it('jogador recebe 403 na chamada direta — a proteção não é o botão escondido', async () => {
    const mesa = await montarMesa();

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesa.mesaId}/combate`,
      headers: mesa.jogador.cabecalhos,
      payload: { tokenIds: [mesa.tokenHeroi] },
    });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json<{ erro: string }>().erro).toBe(APENAS_MESTRE_INICIA_COMBATE);
  });

  it('sem autenticação é 401', async () => {
    const mesa = await montarMesa();

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesa.mesaId}/combate`,
      payload: { tokenIds: [mesa.tokenHeroi] },
    });

    expect(resposta.statusCode).toBe(401);
  });

  it('segundo combate ativo é 409', async () => {
    const mesa = await montarMesa();
    await iniciarOk(mesa);

    const resposta = await iniciar(mesa, [mesa.tokenNpc]);

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json<{ erro: string }>().erro).toBe(COMBATE_ATIVO_EXISTE);
  });

  it('token repetido na seleção é 400, com a frase do contrato', async () => {
    const mesa = await montarMesa();

    const resposta = await iniciar(mesa, [mesa.tokenHeroi, mesa.tokenHeroi]);

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json<{ erro: string }>().erro).toBe(MENSAGEM_PARTICIPANTE_DUPLICADO);
  });

  it('lista vazia é 400 na borda', async () => {
    const mesa = await montarMesa();

    const resposta = await iniciar(mesa, []);

    expect(resposta.statusCode).toBe(400);
  });
});

describe('GET /mesas/:mesaId/combate — painel (RV-063)', () => {
  it('fora da luta devolve 200 com combate null, e não 404', async () => {
    const mesa = await montarMesa();

    const resposta = await contexto.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesa.mesaId}/combate`,
      headers: mesa.jogador.cabecalhos,
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json<CombateAtivoDTO>().combate).toBeNull();
  });

  it('o jogador lê a ordem em curso', async () => {
    const mesa = await montarMesa();
    await iniciarOk(mesa);

    const resposta = await contexto.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesa.mesaId}/combate`,
      headers: mesa.jogador.cabecalhos,
    });

    expect(resposta.statusCode).toBe(200);
    const { combate } = resposta.json<CombateAtivoDTO>();
    expect(combate?.participantes).toHaveLength(2);
    expect(combate?.tokenIdDoTurno).toBe(mesa.tokenHeroi);
  });

  it('quem não participa da mesa recebe 403', async () => {
    const mesa = await montarMesa();
    await iniciarOk(mesa);
    const estranho = await contexto.autenticarComo({ nome: 'Estranho' });

    const resposta = await contexto.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesa.mesaId}/combate`,
      headers: estranho.cabecalhos,
    });

    expect(resposta.statusCode).toBe(403);
  });
});

describe('POST /combates/:combateId/iniciativa (RV-061)', () => {
  it('mestre rola por qualquer um: 201, total no chat e na ordem', async () => {
    const mesa = await montarMesa();
    const combate = await iniciarOk(mesa);

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/combates/${combate.id}/iniciativa`,
      headers: mesa.mestre.cabecalhos,
      payload: { tokenId: mesa.tokenNpc, expressao: '1d20+2' },
    });

    expect(resposta.statusCode).toBe(201);
    const corpo = resposta.json<{ combate: CombateDTO; mensagem: MensagemDTO }>();
    // O RNG do harness é fixo no máximo: 1d20 sai 20.
    expect(corpo.mensagem.rolagem?.total).toBe(22);
    expect(corpo.mensagem.motivo).toBe(motivoIniciativa('Goblin'));
    expect(corpo.combate.participantes.find((p) => p.tokenId === mesa.tokenNpc)?.iniciativa).toBe(
      22,
    );
  });

  it('jogador rolando pelo token de outro recebe 403', async () => {
    const mesa = await montarMesa();
    const combate = await iniciarOk(mesa);

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/combates/${combate.id}/iniciativa`,
      headers: mesa.jogador.cabecalhos,
      payload: { tokenId: mesa.tokenNpc, expressao: '1d20' },
    });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json<{ erro: string }>().erro).toBe(INICIATIVA_DE_TERCEIRO);
  });

  it('jogador rolando pelo próprio personagem é aceito, derivando do sistema', async () => {
    const mesa = await montarMesa();
    const combate = await iniciarOk(mesa);

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/combates/${combate.id}/iniciativa`,
      headers: mesa.jogador.cabecalhos,
      payload: { tokenId: mesa.tokenHeroi },
    });

    expect(resposta.statusCode).toBe(201);
  });

  /**
   * F4 pela rota (RV-066) — a interface não manda `expressao` na peça com ficha,
   * mas `curl` manda. Sem esta guarda o jogador escrevia a própria iniciativa, e o
   * único teste que existia (`jogador rolando pelo próprio personagem`) **passava
   * mandando `expressao`**, o que fazia o furo parecer comportamento pretendido.
   */
  it('jogador informando a própria iniciativa recebe 403 pela rota', async () => {
    const mesa = await montarMesa();
    const combate = await iniciarOk(mesa);

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/combates/${combate.id}/iniciativa`,
      headers: mesa.jogador.cabecalhos,
      payload: { tokenId: mesa.tokenHeroi, expressao: '1d20+99' },
    });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json<{ erro: string }>().erro).toBe(INICIATIVA_INFORMADA_E_DO_MESTRE);
  });

  it('expressão ausente com ficha: o servidor deriva do sistema da mesa (RV-158)', async () => {
    // O contrato mudou no RV-158: `expressao` deixou de ser obrigatória, e a
    // ausência **não** é 400 — é o pedido de "use o que o sistema desta mesa
    // manda". O que o schema continua não fazendo é inventar um `1d20`: quem
    // responde é a definição do sistema, no registro.
    const mesa = await montarMesa();
    const combate = await iniciarOk(mesa);

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/combates/${combate.id}/iniciativa`,
      headers: mesa.mestre.cabecalhos,
      payload: { tokenId: mesa.tokenHeroi },
    });

    expect(resposta.statusCode).toBe(201);
    const corpo = resposta.json<{ combate: CombateDTO; mensagem: MensagemDTO }>();
    // Ficha nova de mesa d20: Destreza no padrão da escala → +0. O que importa é o
    // termo estar lá — `1d20` pelado significaria bônus perdido no caminho.
    expect(corpo.mensagem.rolagem?.expressao).toBe('1d20+0');
    expect(corpo.combate.participantes.find((p) => p.tokenId === mesa.tokenHeroi)?.iniciativa).toBe(
      corpo.mensagem.rolagem?.total,
    );
  });

  it('expressão ausente numa peça sem ficha é 400 dizendo o que fazer (RV-158)', async () => {
    const mesa = await montarMesa();
    const combate = await iniciarOk(mesa);

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/combates/${combate.id}/iniciativa`,
      headers: mesa.mestre.cabecalhos,
      payload: { tokenId: mesa.tokenNpc },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json<{ erro: string }>().erro).toBe(INICIATIVA_SEM_FICHA);
  });

  it('a peça sem ficha entra na ordem com o número que o mestre digita (RV-158)', async () => {
    const mesa = await montarMesa();
    const combate = await iniciarOk(mesa);

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/combates/${combate.id}/iniciativa`,
      headers: mesa.mestre.cabecalhos,
      payload: { tokenId: mesa.tokenNpc, expressao: '17' },
    });

    expect(resposta.statusCode).toBe(201);
    const corpo = resposta.json<{ combate: CombateDTO; mensagem: MensagemDTO }>();
    expect(corpo.combate.participantes.find((p) => p.tokenId === mesa.tokenNpc)?.iniciativa).toBe(
      17,
    );
  });

  it('combate inexistente é 404', async () => {
    const mesa = await montarMesa();

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/combates/00000000-0000-4000-8000-0000000000ff/iniciativa`,
      headers: mesa.mestre.cabecalhos,
      payload: { tokenId: mesa.tokenHeroi, expressao: '1d20' },
    });

    expect(resposta.statusCode).toBe(404);
  });
});

describe('POST /combates/:combateId/proximo-turno (RV-062)', () => {
  it('mestre passa o turno e a virada escreve "Rodada 2" no chat', async () => {
    const mesa = await montarMesa();
    const combate = await iniciarOk(mesa);
    const passar = () =>
      contexto.app.inject({
        method: 'POST',
        url: `/api/combates/${combate.id}/proximo-turno`,
        headers: mesa.mestre.cabecalhos,
      });

    const primeira = await passar();
    expect(primeira.statusCode).toBe(200);
    expect(primeira.json<CombateDTO>().rodada).toBe(1);
    expect(primeira.json<CombateDTO>().tokenIdDoTurno).toBe(mesa.tokenNpc);
    expect(await avisos(mesa)).toEqual([]);

    const segunda = await passar();
    expect(segunda.statusCode).toBe(200);
    expect(segunda.json<CombateDTO>().rodada).toBe(2);
    expect(segunda.json<CombateDTO>().tokenIdDoTurno).toBe(mesa.tokenHeroi);
    expect(await avisos(mesa)).toEqual([textoNovaRodada(2)]);
  });

  it('jogador recebe 403 — é a decisão do RV-062 contra corrida entre clientes', async () => {
    const mesa = await montarMesa();
    const combate = await iniciarOk(mesa);

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/combates/${combate.id}/proximo-turno`,
      headers: mesa.jogador.cabecalhos,
    });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json<{ erro: string }>().erro).toBe(APENAS_MESTRE_PASSA_TURNO);
  });

  it('mestre de outra mesa também recebe 403', async () => {
    const mesa = await montarMesa();
    const combate = await iniciarOk(mesa);
    const outro = await contexto.autenticarComo({ nome: 'Outro Mestre' });
    await criarMesa(outro);

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/combates/${combate.id}/proximo-turno`,
      headers: outro.cabecalhos,
    });

    expect(resposta.statusCode).toBe(403);
  });
});

describe('POST /combates/:combateId/encerrar (RV-062)', () => {
  it('encerra com 200 e ativo=false, e a leitura volta a null', async () => {
    const mesa = await montarMesa();
    const combate = await iniciarOk(mesa);

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/combates/${combate.id}/encerrar`,
      headers: mesa.mestre.cabecalhos,
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json<CombateDTO>().ativo).toBe(false);

    const painel = await contexto.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesa.mesaId}/combate`,
      headers: mesa.jogador.cabecalhos,
    });
    expect(painel.json<CombateAtivoDTO>().combate).toBeNull();
  });

  it('encerrar duas vezes é 409', async () => {
    const mesa = await montarMesa();
    const combate = await iniciarOk(mesa);
    const encerrar = () =>
      contexto.app.inject({
        method: 'POST',
        url: `/api/combates/${combate.id}/encerrar`,
        headers: mesa.mestre.cabecalhos,
      });
    expect((await encerrar()).statusCode).toBe(200);

    expect((await encerrar()).statusCode).toBe(409);
  });

  it('jogador recebe 403', async () => {
    const mesa = await montarMesa();
    const combate = await iniciarOk(mesa);

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/combates/${combate.id}/encerrar`,
      headers: mesa.jogador.cabecalhos,
    });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json<{ erro: string }>().erro).toBe(APENAS_MESTRE_ENCERRA_COMBATE);
  });

  it('encerrado libera a mesa para o próximo combate', async () => {
    const mesa = await montarMesa();
    const primeiro = await iniciarOk(mesa);
    await contexto.app.inject({
      method: 'POST',
      url: `/api/combates/${primeiro.id}/encerrar`,
      headers: mesa.mestre.cabecalhos,
    });

    const segundo = await iniciar(mesa, [mesa.tokenNpc]);

    expect(segundo.statusCode).toBe(201);
    expect(segundo.json<CombateDTO>().id).not.toBe(primeiro.id);
  });
});

describe('POST /combates/:combateId/participantes/:tokenId/pv (RV-065)', () => {
  async function aplicar(
    mesa: Mesa,
    combateId: string,
    tokenId: string,
    delta: number,
    quem = mesa.mestre,
  ) {
    return contexto.app.inject({
      method: 'POST',
      url: `/api/combates/${combateId}/participantes/${tokenId}/pv`,
      headers: quem.cabecalhos,
      payload: { delta },
    });
  }

  it('dano atualiza a ficha, registra no chat e devolve o PersonagemDTO', async () => {
    const mesa = await montarMesa();
    const combate = await iniciarOk(mesa);

    const resposta = await aplicar(mesa, combate.id, mesa.tokenHeroi, -7);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json<PersonagemDTO>().pvAtual).toBe(23);
    expect(await avisos(mesa)).toEqual([textoAlteracaoPv('Thorin', -7, 23, 30)]);
  });

  it('dano acima do PV para em 0 e marca "inconsciente" na peça', async () => {
    const mesa = await montarMesa();
    const combate = await iniciarOk(mesa);

    const resposta = await aplicar(mesa, combate.id, mesa.tokenHeroi, -100);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json<PersonagemDTO>().pvAtual).toBe(0);

    const cena = await contexto.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesa.mesaId}/cena`,
      headers: mesa.jogador.cabecalhos,
    });
    const tokens = cena.json<{ tokens: TokenDTO[] }>().tokens;
    expect(tokens.find((t) => t.id === mesa.tokenHeroi)?.condicoes).toContain(
      CONDICAO_INCONSCIENTE,
    );
  });

  it('cura respeita o PV máximo', async () => {
    const mesa = await montarMesa();
    const combate = await iniciarOk(mesa);
    expect((await aplicar(mesa, combate.id, mesa.tokenHeroi, -2)).statusCode).toBe(200);

    const resposta = await aplicar(mesa, combate.id, mesa.tokenHeroi, 10);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json<PersonagemDTO>().pvAtual).toBe(30);
  });

  it('token sem ficha vinculada é 400 em PT-BR', async () => {
    const mesa = await montarMesa();
    const combate = await iniciarOk(mesa);

    const resposta = await aplicar(mesa, combate.id, mesa.tokenNpc, -5);

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json<{ erro: string }>().erro).toBe(TOKEN_SEM_FICHA);
  });

  it('delta zero é 400 na borda, com a frase do contrato', async () => {
    const mesa = await montarMesa();
    const combate = await iniciarOk(mesa);

    const resposta = await aplicar(mesa, combate.id, mesa.tokenHeroi, 0);

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json<{ erro: string }>().erro).toBe(MENSAGEM_DELTA_PV);
  });

  it('jogador recebe 403 mesmo no próprio personagem — o PV dele continua editável na ficha', async () => {
    const mesa = await montarMesa();
    const combate = await iniciarOk(mesa);

    const resposta = await aplicar(mesa, combate.id, mesa.tokenHeroi, -7, mesa.jogador);

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json<{ erro: string }>().erro).toBe(APENAS_MESTRE_APLICA_DANO);

    // O caminho que continua aberto para ele: a própria ficha.
    const naFicha = await contexto.app.inject({
      method: 'PATCH',
      url: `/api/personagens/${mesa.personagemId}`,
      headers: mesa.jogador.cabecalhos,
      payload: { pvAtual: 23 },
    });
    expect(naFicha.statusCode).toBe(200);
    expect(naFicha.json<PersonagemDTO>().pvAtual).toBe(23);
  });

  it('token fora do combate é 404', async () => {
    const mesa = await montarMesa();
    const combate = await iniciarOk(mesa, [mesa.tokenNpc]);

    const resposta = await aplicar(mesa, combate.id, mesa.tokenHeroi, -7);

    expect(resposta.statusCode).toBe(404);
  });
});
