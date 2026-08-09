import { beforeEach, describe, expect, it } from 'vitest';
import type { CenaComTokensDTO, CenaDTO, MesaDTO } from '@rolavinte/shared';
import {
  CAMPO_IMAGEM_FUNDO,
  MENSAGEM_TAMANHO_CELULA,
  MENSAGEM_TIPO_IMAGEM_FUNDO,
  TAMANHO_MAXIMO_IMAGEM_FUNDO_BYTES,
} from '@rolavinte/shared';
import { LIMITE_CORPO_PADRAO_BYTES } from '../../app';
import {
  criarAppDeTeste,
  ORIGEM_WEB_TESTE,
  type AppDeTeste,
  type SessaoDeTeste,
} from '../../testes/harness';

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

async function criarCena(mestre: SessaoDeTeste, mesaId: string, nome: string): Promise<CenaDTO> {
  const resposta = await contexto.app.inject({
    method: 'POST',
    url: `/api/mesas/${mesaId}/cenas`,
    headers: mestre.cabecalhos,
    payload: { nome },
  });
  expect(resposta.statusCode).toBe(201);
  return resposta.json<CenaDTO>();
}

/** Convida e aceita em nome do jogador — devolve a mesa com 2 participantes. */
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

/**
 * Corpo multipart montado à mão: nenhuma dependência nova de teste, e o
 * `content-type` com boundary é exatamente o que um navegador enviaria.
 */
function multipart(
  conteudo: Buffer,
  tipo: string,
  nomeArquivo = 'mapa-do-cliente.png',
  campo: string = CAMPO_IMAGEM_FUNDO,
): { payload: Buffer; headers: Record<string, string> } {
  const limite = '----RolaVinteTeste0001';
  const abertura = Buffer.from(
    `--${limite}\r\n` +
      `Content-Disposition: form-data; name="${campo}"; filename="${nomeArquivo}"\r\n` +
      `Content-Type: ${tipo}\r\n\r\n`,
    'utf8',
  );
  const fechamento = Buffer.from(`\r\n--${limite}--\r\n`, 'utf8');
  const payload = Buffer.concat([abertura, conteudo, fechamento]);
  return {
    payload,
    headers: {
      'content-type': `multipart/form-data; boundary=${limite}`,
      'content-length': String(payload.byteLength),
    },
  };
}

describe('GET /api/mesas/:mesaId/cenas', () => {
  it('lista as cenas para o mestre, com a última criada ativa', async () => {
    const mestre = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre);
    await criarCena(mestre, mesa.id, 'Taverna');
    await criarCena(mestre, mesa.id, 'Cripta');

    const resposta = await contexto.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesa.id}/cenas`,
      headers: mestre.cabecalhos,
    });

    expect(resposta.statusCode).toBe(200);
    const cenas = resposta.json<CenaDTO[]>();
    expect(cenas.map((c) => c.nome)).toEqual(['Taverna', 'Cripta']);
    expect(cenas.filter((c) => c.ativa).map((c) => c.nome)).toEqual(['Cripta']);
    expect(cenas[0]?.tamanhoCelula).toBe(44);
    expect(cenas[0]?.imagemFundoUrl).toBeNull();
  });

  it('devolve 403 para o jogador — ele só enxerga a cena ativa', async () => {
    const mestre = await contexto.autenticarComo();
    const jogador = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre);
    await adicionarJogador(mestre, mesa.id, jogador);
    await criarCena(mestre, mesa.id, 'Cripta');

    const resposta = await contexto.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesa.id}/cenas`,
      headers: jogador.cabecalhos,
    });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json<{ erro: string }>().erro).toContain('Apenas o mestre vê a lista de cenas');
  });
});

describe('PATCH /api/cenas/:cenaId', () => {
  it('ajusta tamanho de célula, visibilidade e cor do grid', async () => {
    const mestre = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre);
    const cena = await criarCena(mestre, mesa.id, 'Cripta');

    const resposta = await contexto.app.inject({
      method: 'PATCH',
      url: `/api/cenas/${cena.id}`,
      headers: mestre.cabecalhos,
      payload: { tamanhoCelula: 64, gridVisivel: false, corGrid: '#ff0000' },
    });

    expect(resposta.statusCode).toBe(200);
    const atualizada = resposta.json<CenaDTO>();
    expect(atualizada.tamanhoCelula).toBe(64);
    expect(atualizada.gridVisivel).toBe(false);
    expect(atualizada.corGrid).toBe('#ff0000');
    // Campo ausente do PATCH não é redefinido para o default do contrato.
    expect(atualizada.nome).toBe('Cripta');
  });

  it('devolve 400 com a mensagem do limite de célula', async () => {
    const mestre = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre);
    const cena = await criarCena(mestre, mesa.id, 'Cripta');

    const resposta = await contexto.app.inject({
      method: 'PATCH',
      url: `/api/cenas/${cena.id}`,
      headers: mestre.cabecalhos,
      payload: { tamanhoCelula: 5 },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json<{ erro: string }>().erro).toBe(MENSAGEM_TAMANHO_CELULA);
  });

  it('devolve 403 para o jogador', async () => {
    const mestre = await contexto.autenticarComo();
    const jogador = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre);
    await adicionarJogador(mestre, mesa.id, jogador);
    const cena = await criarCena(mestre, mesa.id, 'Cripta');

    const resposta = await contexto.app.inject({
      method: 'PATCH',
      url: `/api/cenas/${cena.id}`,
      headers: jogador.cabecalhos,
      payload: { nome: 'Cripta do Bruno' },
    });

    expect(resposta.statusCode).toBe(403);
  });
});

describe('DELETE /api/cenas/:cenaId', () => {
  it('devolve 409 ao excluir a única cena da mesa', async () => {
    const mestre = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre);
    const cena = await criarCena(mestre, mesa.id, 'Cripta');

    const resposta = await contexto.app.inject({
      method: 'DELETE',
      url: `/api/cenas/${cena.id}`,
      headers: mestre.cabecalhos,
    });

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json<{ erro: string }>().erro).toContain('única cena da mesa');
  });

  it('exclui a cena inativa com 204 e leva os tokens dela', async () => {
    const mestre = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre);
    const taverna = await criarCena(mestre, mesa.id, 'Taverna');
    for (const indice of [0, 1, 2]) {
      const token = await contexto.app.inject({
        method: 'POST',
        url: `/api/cenas/${taverna.id}/tokens`,
        headers: mestre.cabecalhos,
        payload: { nome: `Aldeão ${indice}`, x: indice, y: 0 },
      });
      expect(token.statusCode).toBe(201);
    }
    await criarCena(mestre, mesa.id, 'Cripta');

    const resposta = await contexto.app.inject({
      method: 'DELETE',
      url: `/api/cenas/${taverna.id}`,
      headers: mestre.cabecalhos,
    });

    expect(resposta.statusCode).toBe(204);
    expect(await contexto.fakes.cenas.buscarPorId(taverna.id)).toBeNull();
    expect(await contexto.fakes.cenas.listarTokensDaCena(taverna.id)).toHaveLength(0);
  });
});

describe('POST /api/cenas/:cenaId/ativar', () => {
  it('troca a cena ativa, devolve os tokens e emite cena:ativada', async () => {
    const mestre = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre);
    const taverna = await criarCena(mestre, mesa.id, 'Taverna');
    await criarCena(mestre, mesa.id, 'Cripta');

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/cenas/${taverna.id}/ativar`,
      headers: mestre.cabecalhos,
    });

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json<CenaComTokensDTO>();
    expect(corpo.cena?.nome).toBe('Taverna');
    expect(corpo.cena?.ativa).toBe(true);
    expect(corpo.tokens).toEqual([]);
    expect(contexto.fakes.publicador.doTipo('cena:ativada').map((e) => e.dados.nome)).toContain(
      'Taverna',
    );

    const lista = await contexto.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesa.id}/cenas`,
      headers: mestre.cabecalhos,
    });
    const ativas = lista.json<CenaDTO[]>().filter((c) => c.ativa);
    expect(ativas.map((c) => c.nome)).toEqual(['Taverna']);
  });

  it('devolve 403 para o jogador', async () => {
    const mestre = await contexto.autenticarComo();
    const jogador = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre);
    await adicionarJogador(mestre, mesa.id, jogador);
    const cena = await criarCena(mestre, mesa.id, 'Cripta');

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/cenas/${cena.id}/ativar`,
      headers: jogador.cabecalhos,
    });

    expect(resposta.statusCode).toBe(403);
  });
});

describe('POST /api/cenas/:cenaId/fundo', () => {
  it('aceita um PNG bem maior que o limite global de 256 KB', async () => {
    const mestre = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre);
    const cena = await criarCena(mestre, mesa.id, 'Cripta');
    // 2 MB: o mapa real do card. Oito vezes o body limit global do RV-004.
    const imagem = Buffer.alloc(2 * 1024 * 1024, 7);
    expect(imagem.byteLength).toBeGreaterThan(LIMITE_CORPO_PADRAO_BYTES);
    const { payload, headers } = multipart(imagem, 'image/png');

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/cenas/${cena.id}/fundo`,
      headers: { ...mestre.cabecalhos, ...headers },
      payload,
    });

    expect(resposta.statusCode).toBe(200);
    const atualizada = resposta.json<CenaDTO>();
    expect(atualizada.imagemFundoUrl).toBeTruthy();
    const salvo = contexto.fakes.armazenamento.salvos[0];
    expect(salvo?.bytes).toBe(imagem.byteLength);
    // Nome do cliente descartado: o caminho é gerado pela aplicação.
    expect(salvo?.caminho).not.toContain('mapa-do-cliente');
    expect(salvo?.caminho.startsWith(`cenas/${cena.id}/`)).toBe(true);
  });

  it('devolve 400 em PT-BR para tipo não aceito, sem gravar nada', async () => {
    const mestre = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre);
    const cena = await criarCena(mestre, mesa.id, 'Cripta');
    const { payload, headers } = multipart(Buffer.from('%PDF-1.7'), 'application/pdf', 'mapa.pdf');

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/cenas/${cena.id}/fundo`,
      headers: { ...mestre.cabecalhos, ...headers },
      payload,
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json<{ erro: string }>().erro).toBe(MENSAGEM_TIPO_IMAGEM_FUNDO);
    expect(contexto.fakes.armazenamento.salvos).toHaveLength(0);
  });

  it('devolve 413 em PT-BR para imagem acima de 8 MB, sem gravar nada', async () => {
    const mestre = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre);
    const cena = await criarCena(mestre, mesa.id, 'Cripta');
    const imagem = Buffer.alloc(TAMANHO_MAXIMO_IMAGEM_FUNDO_BYTES + 1024, 7);
    const { payload, headers } = multipart(imagem, 'image/png');

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/cenas/${cena.id}/fundo`,
      headers: { ...mestre.cabecalhos, ...headers },
      payload,
    });

    expect(resposta.statusCode).toBe(413);
    expect(resposta.json<{ erro: string }>().erro).toBe(
      'Corpo da requisição excede o limite permitido.',
    );
    expect(contexto.fakes.armazenamento.salvos).toHaveLength(0);
  });

  it('devolve 400 quando nenhum arquivo é enviado', async () => {
    const mestre = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre);
    const cena = await criarCena(mestre, mesa.id, 'Cripta');

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/cenas/${cena.id}/fundo`,
      headers: {
        ...mestre.cabecalhos,
        'content-type': 'multipart/form-data; boundary=----RolaVinteVazio',
      },
      payload: Buffer.from('------RolaVinteVazio--\r\n', 'utf8'),
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json<{ erro: string }>().erro).toContain(CAMPO_IMAGEM_FUNDO);
  });

  it('devolve 403 para o jogador, sem gravar nada', async () => {
    const mestre = await contexto.autenticarComo();
    const jogador = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre);
    await adicionarJogador(mestre, mesa.id, jogador);
    const cena = await criarCena(mestre, mesa.id, 'Cripta');
    const { payload, headers } = multipart(Buffer.alloc(1024, 3), 'image/png');

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/cenas/${cena.id}/fundo`,
      headers: { ...jogador.cabecalhos, ...headers },
      payload,
    });

    expect(resposta.statusCode).toBe(403);
    expect(contexto.fakes.armazenamento.salvos).toHaveLength(0);
  });
});
