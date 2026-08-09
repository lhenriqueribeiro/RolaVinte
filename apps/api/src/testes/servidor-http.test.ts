import { describe, expect, it } from 'vitest';
import { criarServidorHttp } from '../app';
import { criarAppDeTeste, ORIGEM_WEB_TESTE } from './harness';

describe('servidor HTTP', () => {
  it('responde a GET /api/saude mesmo sem casos de uso registrados', async () => {
    const app = criarServidorHttp({ origemWeb: ORIGEM_WEB_TESTE });

    const resposta = await app.inject({ method: 'GET', url: '/api/saude' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ ok: true, servico: 'rolavinte-api' });
    await app.close();
  });

  it('libera a origem do front no CORS', async () => {
    const { app, encerrar } = criarAppDeTeste();

    const resposta = await app.inject({
      method: 'GET',
      url: '/api/saude',
      headers: { origin: ORIGEM_WEB_TESTE },
    });

    expect(resposta.headers['access-control-allow-origin']).toBe(ORIGEM_WEB_TESTE);
    await encerrar();
  });

  it('devolve 404 em rota desconhecida', async () => {
    const { app, encerrar } = criarAppDeTeste();

    const resposta = await app.inject({ method: 'GET', url: '/api/inexistente' });

    expect(resposta.statusCode).toBe(404);
    await encerrar();
  });
});
