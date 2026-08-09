import { useSessao } from '@/features/auth/store-sessao';

const BASE = '/api';

export class ErroApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ErroApi';
  }
}

interface OpcoesRequisicao {
  metodo?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  corpo?: unknown;
}

/** Cliente HTTP central — injeta o token da sessão e traduz erros da API. */
export async function requisitar<T>(caminho: string, opcoes: OpcoesRequisicao = {}): Promise<T> {
  const token = useSessao.getState().token;
  const resposta = await fetch(`${BASE}${caminho}`, {
    method: opcoes.metodo ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(opcoes.corpo !== undefined ? { body: JSON.stringify(opcoes.corpo) } : {}),
  });

  return interpretarResposta<T>(resposta);
}

/**
 * Tradução única de resposta HTTP → valor ou `ErroApi`. Compartilhada por
 * `requisitar` e `enviarArquivo` para que upload e JSON tratem 401, 204 e o
 * corpo `{ erro }` da API exatamente do mesmo jeito.
 */
async function interpretarResposta<T>(resposta: Response): Promise<T> {
  if (resposta.status === 401) {
    useSessao.getState().sair();
    throw new ErroApi(401, 'Sessão expirada. Entre novamente.');
  }

  if (resposta.status === 204) return undefined as T;

  const dados: unknown = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const mensagem =
      dados && typeof dados === 'object' && 'erro' in dados && typeof dados.erro === 'string'
        ? dados.erro
        : 'Erro inesperado. Tente novamente.';
    throw new ErroApi(resposta.status, mensagem);
  }
  return dados as T;
}

/**
 * Upload multipart (imagem de fundo da cena e arte do token). O `Content-Type`
 * é deixado a cargo do `FormData`: escrever `multipart/form-data` à mão apaga o
 * boundary que o navegador gera, e o servidor recusa o corpo.
 */
export async function enviarArquivo<T>(caminho: string, campo: string, arquivo: File): Promise<T> {
  const token = useSessao.getState().token;
  const corpo = new FormData();
  corpo.append(campo, arquivo);
  const resposta = await fetch(`${BASE}${caminho}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: corpo,
  });
  return interpretarResposta<T>(resposta);
}
