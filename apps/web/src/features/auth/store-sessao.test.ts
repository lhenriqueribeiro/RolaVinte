import { beforeEach, describe, expect, it } from 'vitest';
import type { UsuarioDTO } from '@rolavinte/shared';
import { useSessao } from './store-sessao';

const USUARIO: UsuarioDTO = { id: 'u1', nome: 'Aria', email: 'aria@mesa.dev' };
const CHAVE = 'rolavinte-sessao';

function lerPersistido(): { token: string | null; usuario: UsuarioDTO | null } | null {
  const bruto = localStorage.getItem(CHAVE);
  if (!bruto) return null;
  const conteudo = JSON.parse(bruto) as {
    state?: { token: string | null; usuario: UsuarioDTO | null };
  };
  return conteudo.state ?? null;
}

beforeEach(() => {
  useSessao.setState({ token: null, usuario: null });
  localStorage.clear();
});

describe('store de sessão', () => {
  it('começa sem token e sem usuário', () => {
    expect(useSessao.getState().token).toBeNull();
    expect(useSessao.getState().usuario).toBeNull();
  });

  it('entrar guarda token e usuário', () => {
    useSessao.getState().entrar('token-abc', USUARIO);

    expect(useSessao.getState().token).toBe('token-abc');
    expect(useSessao.getState().usuario).toEqual(USUARIO);
  });

  it('sair limpa token e usuário', () => {
    useSessao.getState().entrar('token-abc', USUARIO);

    useSessao.getState().sair();

    expect(useSessao.getState().token).toBeNull();
    expect(useSessao.getState().usuario).toBeNull();
  });

  it('persiste a sessão em localStorage sob a chave rolavinte-sessao', () => {
    useSessao.getState().entrar('token-abc', USUARIO);

    expect(lerPersistido()).toEqual({ token: 'token-abc', usuario: USUARIO });
  });

  it('sair também apaga a sessão persistida', () => {
    useSessao.getState().entrar('token-abc', USUARIO);

    useSessao.getState().sair();

    expect(lerPersistido()).toEqual({ token: null, usuario: null });
  });

  it('notifica os assinantes a cada transição de sessão', () => {
    const vistos: (string | null)[] = [];
    const cancelar = useSessao.subscribe((estado) => vistos.push(estado.token));

    useSessao.getState().entrar('token-abc', USUARIO);
    useSessao.getState().sair();
    cancelar();

    expect(vistos).toEqual(['token-abc', null]);
  });
});
