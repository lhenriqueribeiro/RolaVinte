import { beforeEach, describe, expect, it } from 'vitest';
import {
  CAMPO_IMAGEM_TOKEN,
  MENSAGEM_TIPO_IMAGEM_TOKEN,
  TAMANHO_MAXIMO_IMAGEM_TOKEN_BYTES,
  type CenaDTO,
  type MesaDTO,
  type PersonagemDTO,
  type TokenDTO,
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

/** Corpo multipart montado à mão — sem dependência nova de teste. */
function multipart(
  conteudo: Buffer,
  tipo: string,
  nomeArquivo = 'arte-do-cliente.png',
  campo: string = CAMPO_IMAGEM_TOKEN,
): { payload: Buffer; headers: Record<string, string> } {
  const limite = '----RolaVinteToken0001';
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

describe('PATCH /api/tokens/:tokenId (RV-040)', () => {
  it('renomeia e recolore, devolvendo o token pronto para remendar o cache', async () => {
    const mestre = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre);
    const cena = await criarCena(mestre, mesa.id);
    const token = await criarToken(mestre, cena.id, { nome: 'Gob1', cor: '#e74c3c' });

    const resposta = await contexto.app.inject({
      method: 'PATCH',
      url: `/api/tokens/${token.id}`,
      headers: mestre.cabecalhos,
      payload: { nome: 'Chefe Goblin', cor: '#2ecc71' },
    });

    expect(resposta.statusCode).toBe(200);
    const atualizado = resposta.json<TokenDTO>();
    expect(atualizado).toMatchObject({
      id: token.id,
      nome: 'Chefe Goblin',
      cor: '#2ecc71',
      x: 2,
      y: 3,
      imagemUrl: null,
    });
    expect(contexto.fakes.publicador.doTipo('token:atualizado')).toHaveLength(1);
  });

  it('campo ausente do PATCH não volta ao default do contrato', async () => {
    const mestre = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre);
    const cena = await criarCena(mestre, mesa.id);
    const token = await criarToken(mestre, cena.id, { nome: 'Gob1', cor: '#2ecc71' });

    const resposta = await contexto.app.inject({
      method: 'PATCH',
      url: `/api/tokens/${token.id}`,
      headers: mestre.cabecalhos,
      payload: { nome: 'Chefe Goblin' },
    });

    expect(resposta.statusCode).toBe(200);
    // Sem este caso, `cor` voltaria ao '#e74c3c' padrão de `criarTokenSchema`.
    expect(resposta.json<TokenDTO>().cor).toBe('#2ecc71');
  });

  it('devolve 403 para o jogador dono do personagem vinculado', async () => {
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

    const resposta = await contexto.app.inject({
      method: 'PATCH',
      url: `/api/tokens/${token.id}`,
      headers: jogador.cabecalhos,
      payload: { nome: 'Thorin, o Bravo' },
    });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json<{ erro: string }>().erro).toContain('jogador move');

    // O mesmo jogador continua movendo o token do seu personagem.
    const movimento = await contexto.app.inject({
      method: 'PATCH',
      url: `/api/tokens/${token.id}/posicao`,
      headers: jogador.cabecalhos,
      payload: { x: 7, y: 9 },
    });
    expect(movimento.statusCode).toBe(200);
  });

  it('devolve 400 com a mensagem do domínio para nome vazio', async () => {
    const mestre = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre);
    const cena = await criarCena(mestre, mesa.id);
    const token = await criarToken(mestre, cena.id, { nome: 'Gob1' });

    const resposta = await contexto.app.inject({
      method: 'PATCH',
      url: `/api/tokens/${token.id}`,
      headers: mestre.cabecalhos,
      payload: { nome: '   ' },
    });

    expect(resposta.statusCode).toBe(400);
  });

  it('devolve 404 para token inexistente', async () => {
    const mestre = await contexto.autenticarComo();

    const resposta = await contexto.app.inject({
      method: 'PATCH',
      url: '/api/tokens/00000000-0000-4000-9000-0000000000ff',
      headers: mestre.cabecalhos,
      payload: { nome: 'Fantasma' },
    });

    expect(resposta.statusCode).toBe(404);
  });
});

describe('POST /api/tokens/:tokenId/imagem (RV-041)', () => {
  it('aceita um PNG bem maior que o limite global de 256 KB', async () => {
    const mestre = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre);
    const cena = await criarCena(mestre, mesa.id);
    const token = await criarToken(mestre, cena.id, { nome: 'Chefe Goblin' });
    const arte = Buffer.alloc(1024 * 1024, 7);
    expect(arte.byteLength).toBeGreaterThan(LIMITE_CORPO_PADRAO_BYTES);
    const { payload, headers } = multipart(arte, 'image/png');

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/tokens/${token.id}/imagem`,
      headers: { ...mestre.cabecalhos, ...headers },
      payload,
    });

    expect(resposta.statusCode).toBe(200);
    const atualizado = resposta.json<TokenDTO>();
    expect(atualizado.imagemUrl).toBeTruthy();
    // A borda mantém a cor definida mesmo com arte (RV-041).
    expect(atualizado.cor).toBe('#e74c3c');

    const salvo = contexto.fakes.armazenamentoTokens.salvos[0];
    expect(salvo?.bytes).toBe(arte.byteLength);
    expect(salvo?.caminho).not.toContain('arte-do-cliente');
    expect(salvo?.caminho.startsWith(`tokens/${token.id}/`)).toBe(true);
    // Bucket separado: a arte do token não cai no armazenamento dos mapas.
    expect(contexto.fakes.armazenamento.salvos).toHaveLength(0);
  });

  it('devolve 400 em PT-BR para tipo não aceito, sem gravar nada', async () => {
    const mestre = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre);
    const cena = await criarCena(mestre, mesa.id);
    const token = await criarToken(mestre, cena.id, { nome: 'Chefe Goblin' });
    const { payload, headers } = multipart(Buffer.from('%PDF-1.7'), 'application/pdf', 'arte.pdf');

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/tokens/${token.id}/imagem`,
      headers: { ...mestre.cabecalhos, ...headers },
      payload,
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json<{ erro: string }>().erro).toBe(MENSAGEM_TIPO_IMAGEM_TOKEN);
    expect(contexto.fakes.armazenamentoTokens.salvos).toHaveLength(0);
  });

  it('devolve 413 em PT-BR acima do limite de arquivo, sem gravar nada', async () => {
    const mestre = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre);
    const cena = await criarCena(mestre, mesa.id);
    const token = await criarToken(mestre, cena.id, { nome: 'Chefe Goblin' });
    const { payload, headers } = multipart(
      Buffer.alloc(TAMANHO_MAXIMO_IMAGEM_TOKEN_BYTES + 1024, 7),
      'image/png',
    );

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/tokens/${token.id}/imagem`,
      headers: { ...mestre.cabecalhos, ...headers },
      payload,
    });

    expect(resposta.statusCode).toBe(413);
    expect(resposta.json<{ erro: string }>().erro).toBe(
      'Corpo da requisição excede o limite permitido.',
    );
    expect(contexto.fakes.armazenamentoTokens.salvos).toHaveLength(0);
  });

  it('devolve 400 citando o campo quando nenhum arquivo é enviado', async () => {
    const mestre = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre);
    const cena = await criarCena(mestre, mesa.id);
    const token = await criarToken(mestre, cena.id, { nome: 'Chefe Goblin' });

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/tokens/${token.id}/imagem`,
      headers: {
        ...mestre.cabecalhos,
        'content-type': 'multipart/form-data; boundary=----RolaVinteVazio',
      },
      payload: Buffer.from('------RolaVinteVazio--\r\n', 'utf8'),
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json<{ erro: string }>().erro).toContain(CAMPO_IMAGEM_TOKEN);
  });

  it('devolve 403 para o jogador, sem gravar nada', async () => {
    const mestre = await contexto.autenticarComo();
    const jogador = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre);
    await adicionarJogador(mestre, mesa.id, jogador);
    const cena = await criarCena(mestre, mesa.id);
    const token = await criarToken(mestre, cena.id, { nome: 'Chefe Goblin' });
    const { payload, headers } = multipart(Buffer.alloc(1024, 3), 'image/png');

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/tokens/${token.id}/imagem`,
      headers: { ...jogador.cabecalhos, ...headers },
      payload,
    });

    expect(resposta.statusCode).toBe(403);
    expect(contexto.fakes.armazenamentoTokens.salvos).toHaveLength(0);
  });
});

describe('DELETE /api/tokens/:tokenId (RV-047)', () => {
  const png = () => Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  async function tokenComArte(
    mestre: SessaoDeTeste,
    cenaId: string,
  ): Promise<{ token: TokenDTO; caminho: string }> {
    const token = await criarToken(mestre, cenaId, { nome: 'Chefe Goblin' });
    const upload = multipart(png(), 'image/png');
    const resposta = await contexto.app.inject({
      method: 'POST',
      url: `/api/tokens/${token.id}/imagem`,
      headers: { ...mestre.cabecalhos, ...upload.headers },
      payload: upload.payload,
    });
    expect(resposta.statusCode).toBe(200);
    const caminho = contexto.fakes.armazenamentoTokens.salvos.at(-1)?.caminho ?? '';
    expect(caminho).not.toBe('');
    return { token, caminho };
  }

  it('devolve 204 e apaga a arte do bucket de tokens', async () => {
    const mestre = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre);
    const cena = await criarCena(mestre, mesa.id);
    const { token, caminho } = await tokenComArte(mestre, cena.id);

    const resposta = await contexto.app.inject({
      method: 'DELETE',
      url: `/api/tokens/${token.id}`,
      headers: mestre.cabecalhos,
    });

    expect(resposta.statusCode).toBe(204);
    expect(await contexto.fakes.cenas.buscarTokenPorId(token.id)).toBeNull();
    expect(contexto.fakes.armazenamentoTokens.contem(caminho)).toBe(false);
    expect(contexto.fakes.armazenamentoTokens.caminhosRemovidos).toEqual([caminho]);
    // O bucket de mapas não é tocado pela exclusão de uma peça.
    expect(contexto.fakes.armazenamento.caminhosRemovidos).toEqual([]);
  });

  it('devolve 403 ao jogador e mantém o arquivo no bucket', async () => {
    const mestre = await contexto.autenticarComo();
    const jogador = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre);
    await adicionarJogador(mestre, mesa.id, jogador);
    const cena = await criarCena(mestre, mesa.id);
    const { token, caminho } = await tokenComArte(mestre, cena.id);

    const resposta = await contexto.app.inject({
      method: 'DELETE',
      url: `/api/tokens/${token.id}`,
      headers: jogador.cabecalhos,
    });

    expect(resposta.statusCode).toBe(403);
    expect(await contexto.fakes.cenas.buscarTokenPorId(token.id)).not.toBeNull();
    expect(contexto.fakes.armazenamentoTokens.contem(caminho)).toBe(true);
  });

  it('Storage indisponível não vira erro na rota — a exclusão fecha em 204', async () => {
    const mestre = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre);
    const cena = await criarCena(mestre, mesa.id);
    const { token } = await tokenComArte(mestre, cena.id);
    contexto.fakes.armazenamentoTokens.falharAoRemover = true;

    const resposta = await contexto.app.inject({
      method: 'DELETE',
      url: `/api/tokens/${token.id}`,
      headers: mestre.cabecalhos,
    });

    expect(resposta.statusCode).toBe(204);
    expect(await contexto.fakes.cenas.buscarTokenPorId(token.id)).toBeNull();
  });
});

describe('PATCH /api/personagens/:id publica personagem:atualizado (RV-042)', () => {
  it('o dano na ficha vira evento para a mesa, sem tocar no token', async () => {
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
    const personagem = ficha.json<PersonagemDTO>();
    const token = await criarToken(mestre, cena.id, {
      nome: 'Thorin',
      personagemId: personagem.id,
    });
    contexto.fakes.publicador.limpar();

    const resposta = await contexto.app.inject({
      method: 'PATCH',
      url: `/api/personagens/${personagem.id}`,
      headers: mestre.cabecalhos,
      payload: { pvAtual: 12 },
    });

    expect(resposta.statusCode).toBe(200);
    const eventos = contexto.fakes.publicador.doTipo('personagem:atualizado');
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.mesaId).toBe(mesa.id);
    expect(eventos[0]?.dados).toMatchObject({ id: personagem.id, pvAtual: 12, pvMax: 30 });

    // Zero estado duplicado: o token continua sem PV, só com o vínculo.
    const cenaAtiva = await contexto.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesa.id}/cena`,
      headers: mestre.cabecalhos,
    });
    const tokens = cenaAtiva.json<{ tokens: TokenDTO[] }>().tokens;
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toEqual(token);
    expect(Object.keys(tokens[0] ?? {})).not.toContain('pvAtual');
  });

  it('atualização negada não publica evento nenhum', async () => {
    const mestre = await contexto.autenticarComo();
    const jogador = await contexto.autenticarComo();
    const intruso = await contexto.autenticarComo();
    const mesa = await criarMesa(mestre);
    await adicionarJogador(mestre, mesa.id, jogador);

    const ficha = await contexto.app.inject({
      method: 'POST',
      url: `/api/mesas/${mesa.id}/personagens`,
      headers: jogador.cabecalhos,
      payload: { nome: 'Thorin', pvMax: 30 },
    });
    const personagem = ficha.json<PersonagemDTO>();
    contexto.fakes.publicador.limpar();

    const resposta = await contexto.app.inject({
      method: 'PATCH',
      url: `/api/personagens/${personagem.id}`,
      headers: intruso.cabecalhos,
      payload: { pvAtual: 1 },
    });

    expect(resposta.statusCode).toBe(403);
    expect(contexto.fakes.publicador.publicados).toHaveLength(0);
  });
});
