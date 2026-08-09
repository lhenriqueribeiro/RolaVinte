import { io, type Socket } from 'socket.io-client';
import type { EventosClienteParaServidor, EventosServidorParaCliente } from '@rolavinte/shared';
import { useSessao } from '@/features/auth/store-sessao';

/**
 * Único ponto de criação do socket. Componentes usam hooks de feature
 * (use-socket-mesa), nunca este módulo diretamente.
 *
 * O socket é tipado pelo contrato de `@rolavinte/shared` (RV-115): ouvir um
 * evento que o servidor não emite, ou tratar um payload com formato diferente
 * do publicado, deixa de compilar.
 */
export type SocketJogo = Socket<EventosServidorParaCliente, EventosClienteParaServidor>;

/**
 * Política de reconexão (RV-112).
 *
 * Quem lê estas opções é o `Backoff` do próprio socket.io-client: o atraso
 * dobra a cada tentativa a partir de `reconnectionDelay` e **para de crescer**
 * em `reconnectionDelayMax`. Dez quedas seguidas viram 0,5s, 1s, 2s, 4s, 8s,
 * 10s, 10s… — nunca uma tentativa por frame.
 *
 * `randomizationFactor` espalha as tentativas: sem ele, um servidor que
 * reiniciou receberia todas as mesas de volta no mesmo instante.
 *
 * `reconnectionAttempts` fica no padrão (infinito) de propósito. Desistir
 * transformaria uma queda longa de rede num estado do qual só o F5 tira o
 * jogador — e o estado `offline` da store existe justamente para os casos em
 * que o socket.io **decide** que não vai tentar (`socket.active === false`).
 */
export const OPCOES_RECONEXAO = {
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 10_000,
  randomizationFactor: 0.5,
} as const;

let socket: SocketJogo | null = null;

export function obterSocket(): SocketJogo {
  const token = useSessao.getState().token;
  if (socket && socket.auth && (socket.auth as { token?: string }).token !== token) {
    socket.disconnect();
    socket = null;
  }
  if (!socket) {
    socket = io('/', {
      auth: { token },
      transports: ['websocket'],
      autoConnect: true,
      ...OPCOES_RECONEXAO,
    });
  }
  return socket;
}

export function desconectarSocket(): void {
  socket?.disconnect();
  socket = null;
}
