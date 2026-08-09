import { describe, expect, it } from 'vitest';
import type { SessaoDTO } from '@rolavinte/shared';

import { CABECALHO_REQUISICAO_ID, LIMITE_CORPO_PADRAO_BYTES } from '../app';
import { criarAppDeTeste } from './harness';

interface CorpoDeErro {
  erro: string;
  requisicaoId: string;
}

interface LinhaDeLog {
  requisicaoId?: string;
  err?: { stack?: string; message?: string };
}

/** Coletor de log do pino: cada `write` recebe uma linha JSON completa. */
function coletorDeLog(): { linhas: string[]; stream: { write(linha: string): void } } {
  const linhas: string[] = [];
  return {
    linhas,
    stream: {
      write(linha: string) {
        linhas.push(linha);
      },
    },
  };
}

describe('endurecimento HTTP — cabeçalhos de segurança', () => {
  it('devolve os cabeçalhos do helmet em GET /api/saude', async () => {
    const { app, encerrar } = criarAppDeTeste();

    const resposta = await app.inject({ method: 'GET', url: '/api/saude' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.headers['x-content-type-options']).toBe('nosniff');
    expect(resposta.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(resposta.headers['strict-transport-security']).toContain('max-age=');
    expect(resposta.headers['content-security-policy']).toContain("default-src 'none'");
    expect(resposta.headers['referrer-policy']).toBeDefined();
    await encerrar();
  });

  it('devolve o id da requisição em um cabeçalho de correlação', async () => {
    const { app, encerrar } = criarAppDeTeste();

    const resposta = await app.inject({ method: 'GET', url: '/api/saude' });

    expect(resposta.headers[CABECALHO_REQUISICAO_ID]).toMatch(/^[0-9a-f-]{36}$/);
    await encerrar();
  });

  it('não confia no id de requisição enviado pelo cliente', async () => {
    const { app, encerrar } = criarAppDeTeste();

    const resposta = await app.inject({
      method: 'GET',
      url: '/api/saude',
      headers: { [CABECALHO_REQUISICAO_ID]: 'id-forjado-pelo-cliente' },
    });

    expect(resposta.headers[CABECALHO_REQUISICAO_ID]).not.toBe('id-forjado-pelo-cliente');
    await encerrar();
  });
});

describe('endurecimento HTTP — rate limit', () => {
  it('barra a 11ª tentativa de login do mesmo IP dentro da janela', async () => {
    const { app, encerrar } = criarAppDeTeste({
      rateLimit: { max: 300, janelaMs: 60_000, maxAutenticacao: 10 },
    });
    const tentativa = {
      method: 'POST' as const,
      url: '/api/auth/login',
      payload: { email: 'invasor@teste.local', senha: 'chute-de-senha' },
    };

    for (let i = 1; i <= 10; i += 1) {
      const resposta = await app.inject(tentativa);
      expect(resposta.statusCode).not.toBe(429);
    }
    const decimaPrimeira = await app.inject(tentativa);

    expect(decimaPrimeira.statusCode).toBe(429);
    expect(decimaPrimeira.headers['retry-after']).toBeDefined();
    const corpo = decimaPrimeira.json<CorpoDeErro>();
    expect(corpo.erro).toBe('Muitas requisições. Aguarde um instante e tente novamente.');
    expect(corpo.requisicaoId).toEqual(expect.any(String));
    await encerrar();
  });

  it('conta o login num balde próprio, sem consumir o limite global', async () => {
    const { app, encerrar } = criarAppDeTeste({
      rateLimit: { max: 300, janelaMs: 60_000, maxAutenticacao: 2 },
    });
    const tentativa = {
      method: 'POST' as const,
      url: '/api/auth/login',
      payload: { email: 'invasor@teste.local', senha: 'chute-de-senha' },
    };

    await app.inject(tentativa);
    await app.inject(tentativa);
    const esgotado = await app.inject(tentativa);
    const saude = await app.inject({ method: 'GET', url: '/api/saude' });

    expect(esgotado.statusCode).toBe(429);
    expect(saude.statusCode).toBe(200);
    await encerrar();
  });

  it('fica desligado por padrão no harness, para não poluir os demais contratos', async () => {
    const { app, encerrar } = criarAppDeTeste();

    for (let i = 1; i <= 20; i += 1) {
      const resposta = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'invasor@teste.local', senha: 'chute-de-senha' },
      });
      expect(resposta.statusCode).not.toBe(429);
    }

    await encerrar();
  });
});

describe('endurecimento HTTP — limite de corpo', () => {
  it('recusa com 413 um corpo acima do limite', async () => {
    const { app, encerrar } = criarAppDeTeste();

    const resposta = await app.inject({
      method: 'POST',
      url: '/api/auth/registrar',
      payload: {
        nome: 'a'.repeat(LIMITE_CORPO_PADRAO_BYTES + 1024),
        email: 'gigante@teste.local',
        senha: 'senha-de-teste',
      },
    });

    expect(resposta.statusCode).toBe(413);
    const corpo = resposta.json<CorpoDeErro>();
    expect(corpo.erro).toBe('Corpo da requisição excede o limite permitido.');
    expect(corpo.requisicaoId).toEqual(expect.any(String));
    await encerrar();
  });

  it('aceita normalmente um corpo dentro do limite', async () => {
    const { app, autenticarComo, encerrar } = criarAppDeTeste();
    const sessao = await autenticarComo();

    const resposta = await app.inject({
      method: 'POST',
      url: '/api/mesas',
      headers: sessao.cabecalhos,
      payload: { nome: 'Mesa comum', descricao: 'd'.repeat(400), sistema: 'generico' },
    });

    expect(resposta.statusCode).toBe(201);
    await encerrar();
  });
});

describe('erro global e rastreabilidade', () => {
  it('converte exceção de infraestrutura em 500 padronizado, sem vazar detalhe', async () => {
    const { stream } = coletorDeLog();
    const { app, fakes, autenticarComo, encerrar } = criarAppDeTeste({
      logger: { level: 'error', stream },
    });
    const sessao = await autenticarComo();
    fakes.mesas.listarDoUsuario = () =>
      Promise.reject(new Error('conexao com o banco recusada: 10.0.0.7:5432'));

    const resposta = await app.inject({
      method: 'GET',
      url: '/api/mesas',
      headers: sessao.cabecalhos,
    });

    expect(resposta.statusCode).toBe(500);
    const corpo = resposta.json<CorpoDeErro>();
    expect(corpo.erro).toBe('Erro interno. Tente novamente.');
    expect(corpo.requisicaoId).toEqual(expect.any(String));
    expect(Object.keys(corpo).sort()).toEqual(['erro', 'requisicaoId']);
    expect(resposta.body).not.toContain('10.0.0.7');
    expect(resposta.body).not.toContain('at ');
    expect(resposta.headers[CABECALHO_REQUISICAO_ID]).toBe(corpo.requisicaoId);
    await encerrar();
  });

  it('grava o stack trace no log sob o mesmo requisicaoId devolvido ao cliente', async () => {
    const { linhas, stream } = coletorDeLog();
    const { app, fakes, autenticarComo, encerrar } = criarAppDeTeste({
      logger: { level: 'error', stream },
    });
    const sessao = await autenticarComo();
    fakes.mesas.listarDoUsuario = () => Promise.reject(new Error('falha de infraestrutura'));

    const resposta = await app.inject({
      method: 'GET',
      url: '/api/mesas',
      headers: sessao.cabecalhos,
    });
    const { requisicaoId } = resposta.json<CorpoDeErro>();

    const registro = linhas
      .map((linha): LinhaDeLog => JSON.parse(linha) as LinhaDeLog)
      .find((l) => l.requisicaoId === requisicaoId);
    expect(registro).toBeDefined();
    expect(registro?.err?.stack).toContain('falha de infraestrutura');
    await encerrar();
  });

  it('responde 404 em rota desconhecida no formato de erro do projeto', async () => {
    const { app, encerrar } = criarAppDeTeste();

    const resposta = await app.inject({ method: 'GET', url: '/api/inexistente' });

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json<CorpoDeErro>().erro).toBe('Rota não encontrada.');
    await encerrar();
  });

  it('responde 400 em PT-BR quando o JSON do corpo é inválido', async () => {
    const { app, encerrar } = criarAppDeTeste();

    const resposta = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{ isto nao e json',
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json<CorpoDeErro>().erro).toBe('JSON inválido no corpo da requisição.');
    await encerrar();
  });

  it('não deixa senha nem token emitido sobreviverem no log de um login', async () => {
    const { linhas, stream } = coletorDeLog();
    const { app, autenticarComo, encerrar } = criarAppDeTeste({
      logger: { level: 'trace', stream },
    });
    const sessao = await autenticarComo({ email: 'mestre@teste.local', senha: 'senha-secreta-01' });

    const resposta = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'mestre@teste.local', senha: 'senha-secreta-01' },
    });
    await app.inject({ method: 'GET', url: '/api/auth/eu', headers: sessao.cabecalhos });

    expect(resposta.statusCode).toBe(200);
    const token = resposta.json<SessaoDTO>().token;
    const logCompleto = linhas.join('\n');
    expect(logCompleto.length).toBeGreaterThan(0);
    expect(logCompleto).not.toContain('senha-secreta-01');
    expect(logCompleto).not.toContain(token);
    expect(logCompleto).not.toContain(sessao.token);
    await encerrar();
  });
});
