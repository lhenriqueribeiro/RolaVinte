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
    });
  }
  return socket;
}

export function desconectarSocket(): void {
  socket?.disconnect();
  socket = null;
}
