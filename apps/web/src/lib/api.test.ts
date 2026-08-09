import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UsuarioDTO } from '@rolavinte/shared';
import { useSessao } from '@/features/auth/store-sessao';
import { ErroApi, requisitar } from './api';

const USUARIO: UsuarioDTO = { id: 'u1', nome: 'Aria', email: 'aria@mesa.dev' };

/** Resposta mínima da Fetch API, só com o que `requisitar` consome. */
function resposta(opcoes: { status: number; corpo?: unknown; corpoInvalido?: boolean }) {
  return {
    status: opcoes.status,
    ok: opcoes.status >= 200 && opcoes.status < 300,
    json: () =>
      opcoes.corpoInvalido
        ? Promise.reject(new SyntaxError('Unexpected token < in JSON'))
        : Promise.resolve(opcoes.corpo),
  };
}

function stubFetch(...respostas: ReturnType<typeof resposta>[]) {
  const espiao = vi.fn(() => Promise.resolve(respostas.shift() ?? resposta({ status: 200 })));
  vi.stubGlobal('fetch', espiao);
  return espiao;
}

/** Lê as opções passadas ao `fetch` na chamada informada, já tipadas. */
function opcoesDaChamada(espiao: ReturnType<typeof stubFetch>, indice = 0) {
  const chamada = espiao.mock.calls[indice] as unknown as [string, RequestInit];
  return { url: chamada[0], init: chamada[1] };
}

function cabecalhos(espiao: ReturnType<typeof stubFetch>, indice = 0): Record<string, string> {
  return (opcoesDaChamada(espiao, indice).init.headers ?? {}) as Record<string, string>;
}

beforeEach(() => {
  useSessao.setState({ token: null, usuario: null });
  vi.unstubAllGlobals();
});

describe('requisitar — injeção do token da sessão', () => {
  it('envia o header Authorization quando há token na sessão', async () => {
    useSessao.getState().entrar('token-abc', USUARIO);
    const espiao = stubFetch(resposta({ status: 200, corpo: { ok: true } }));

    await requisitar('/mesas');

    expect(cabecalhos(espiao).Authorization).toBe('Bearer token-abc');
  });

  it('omite o header Authorization quando não há sessão', async () => {
    const espiao = stubFetch(resposta({ status: 200, corpo: [] }));

    await requisitar('/mesas');

    expect(cabecalhos(espiao)).not.toHaveProperty('Authorization');
    expect(cabecalhos(espiao)['Content-Type']).toBe('application/json');
  });

  it('prefixa o caminho com /api e usa GET por padrão, sem corpo', async () => {
    const espiao = stubFetch(resposta({ status: 200, corpo: [] }));

    await requisitar('/mesas');

    const { url, init } = opcoesDaChamada(espiao);
    expect(url).toBe('/api/mesas');
    expect(init.method).toBe('GET');
    expect(init).not.toHaveProperty('body');
  });

  it('serializa o corpo em JSON no método informado', async () => {
    const espiao = stubFetch(resposta({ status: 200, corpo: { id: 'm1' } }));

    await requisitar('/mesas', { metodo: 'POST', corpo: { nome: 'Tumbas de Ravena' } });

    const { init } = opcoesDaChamada(espiao);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ nome: 'Tumbas de Ravena' }));
  });
});

describe('requisitar — respostas de sucesso', () => {
  it('devolve o JSON do corpo', async () => {
    stubFetch(resposta({ status: 200, corpo: [{ id: 'm1' }] }));

    await expect(requisitar<{ id: string }[]>('/mesas')).resolves.toEqual([{ id: 'm1' }]);
  });

  it('devolve undefined em 204 sem tentar ler o corpo', async () => {
    const semCorpo = {
      status: 204,
      ok: true,
      json: vi.fn(() => Promise.reject(new SyntaxError('sem corpo'))),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(semCorpo)),
    );

    await expect(requisitar<void>('/tokens/t1', { metodo: 'DELETE' })).resolves.toBeUndefined();
    expect(semCorpo.json).not.toHaveBeenCalled();
  });
});

describe('requisitar — tradução de erros', () => {
  it('usa a mensagem de { erro } devolvida pela API', async () => {
    stubFetch(resposta({ status: 403, corpo: { erro: 'Apenas o mestre pode convidar.' } }));

    await expect(requisitar('/mesas/m1/convites', { metodo: 'POST' })).rejects.toThrowError(
      new ErroApi(403, 'Apenas o mestre pode convidar.'),
    );
  });

  it('preserva o status no ErroApi', async () => {
    stubFetch(resposta({ status: 404, corpo: { erro: 'Mesa não encontrada.' } }));

    const erro = await requisitar('/mesas/x').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroApi);
    expect((erro as ErroApi).status).toBe(404);
    expect((erro as ErroApi).name).toBe('ErroApi');
  });

  it('cai numa mensagem genérica quando o corpo do erro não é JSON', async () => {
    stubFetch(resposta({ status: 502, corpoInvalido: true }));

    await expect(requisitar('/mesas')).rejects.toThrowError(
      new ErroApi(502, 'Erro inesperado. Tente novamente.'),
    );
  });

  it('cai numa mensagem genérica quando o corpo do erro não tem { erro }', async () => {
    stubFetch(resposta({ status: 500, corpo: { detalhe: 'boom' } }));

    await expect(requisitar('/mesas')).rejects.toThrowError(
      new ErroApi(500, 'Erro inesperado. Tente novamente.'),
    );
  });
});

describe('requisitar — 401 encerra a sessão no cliente', () => {
  it('limpa a sessão e lança ErroApi 401 com mensagem própria', async () => {
    useSessao.getState().entrar('token-expirado', USUARIO);
    stubFetch(resposta({ status: 401, corpo: { erro: 'Autenticação necessária.' } }));

    await expect(requisitar('/mesas')).rejects.toThrowError(
      new ErroApi(401, 'Sessão expirada. Entre novamente.'),
    );

    expect(useSessao.getState().token).toBeNull();
    expect(useSessao.getState().usuario).toBeNull();
  });

  it('apaga também a sessão persistida em localStorage', async () => {
    useSessao.getState().entrar('token-expirado', USUARIO);
    stubFetch(resposta({ status: 401 }));

    await requisitar('/mesas').catch(() => undefined);

    const bruto = localStorage.getItem('rolavinte-sessao');
    const persistido = JSON.parse(bruto ?? '{}') as { state?: { token?: string | null } };
    expect(persistido.state?.token).toBeNull();
  });
});
