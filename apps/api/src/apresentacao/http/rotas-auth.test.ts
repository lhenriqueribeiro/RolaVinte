import { beforeEach, describe, expect, it } from 'vitest';
import type { SessaoDTO, UsuarioDTO } from '@rolavinte/shared';
import { criarAppDeTeste, type AppDeTeste } from '../../testes/harness';

const CREDENCIAIS = { nome: 'Aragorn', email: 'aragorn@gondor.com', senha: 'senha-de-teste' };

let contexto: AppDeTeste;

beforeEach(() => {
  contexto = criarAppDeTeste();
});

async function registrar(payload: Record<string, unknown> = CREDENCIAIS) {
  return contexto.app.inject({ method: 'POST', url: '/api/auth/registrar', payload });
}

describe('rotas de autenticação', () => {
  it('registra um usuário novo com 201 e devolve um JWT', async () => {
    const resposta = await registrar();

    expect(resposta.statusCode).toBe(201);
    const sessao = resposta.json<SessaoDTO>();
    expect(sessao.token.split('.')).toHaveLength(3); // JWT: header.payload.assinatura
    expect(sessao.usuario.email).toBe('aragorn@gondor.com');
    expect(sessao.usuario.nome).toBe('Aragorn');
    expect(contexto.fakes.usuarios.total).toBe(1);
  });

  it('recusa email já cadastrado com 409', async () => {
    await registrar();
    const resposta = await registrar({ ...CREDENCIAIS, nome: 'Outro' });

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json<{ erro: string }>().erro).toBe('Já existe uma conta com este email.');
    expect(contexto.fakes.usuarios.total).toBe(1);
  });

  it('recusa payload inválido com 400', async () => {
    const resposta = await registrar({ nome: 'A', email: 'nao-e-email', senha: '123' });

    expect(resposta.statusCode).toBe(400);
    expect(contexto.fakes.usuarios.total).toBe(0);
  });

  it('faz login com 200 e o token serve na rota protegida', async () => {
    await registrar();

    const login = await contexto.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: CREDENCIAIS.email, senha: CREDENCIAIS.senha },
    });
    expect(login.statusCode).toBe(200);
    const sessao = login.json<SessaoDTO>();
    expect(sessao.token.split('.')).toHaveLength(3);

    const eu = await contexto.app.inject({
      method: 'GET',
      url: '/api/auth/eu',
      headers: { authorization: `Bearer ${sessao.token}` },
    });
    expect(eu.statusCode).toBe(200);
    expect(eu.json<UsuarioDTO>().email).toBe(CREDENCIAIS.email);
  });

  it('recusa login com senha errada usando 403 sem revelar qual campo falhou', async () => {
    await registrar();

    const resposta = await contexto.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: CREDENCIAIS.email, senha: 'senha-errada' },
    });

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json<{ erro: string }>().erro).toBe('Email ou senha incorretos.');
  });

  it('recusa GET /api/auth/eu sem header Authorization com 401', async () => {
    const resposta = await contexto.app.inject({ method: 'GET', url: '/api/auth/eu' });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ erro: 'Autenticação necessária.' });
  });

  it('recusa token inválido com 401', async () => {
    const resposta = await contexto.app.inject({
      method: 'GET',
      url: '/api/auth/eu',
      headers: { authorization: 'Bearer token-falsificado' },
    });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toEqual({ erro: 'Sessão inválida ou expirada.' });
  });
});
