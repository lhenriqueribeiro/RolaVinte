import type { Server, Socket } from 'socket.io';
import type {
  EventosClienteParaServidorBruto,
  EventosServidorParaCliente,
} from '@rolavinte/shared';

/**
 * Tipos do socket.io já parametrizados pelo contrato de `@rolavinte/shared`
 * (RV-115). Todo `Server`/`Socket` do projeto passa por aqui — `Server` cru
 * aceitaria qualquer nome de evento e qualquer payload, que é como uma ponta
 * pode divergir da outra sem ninguém perceber.
 *
 * Repare na assimetria proposital: o que o servidor **emite** é tipado pelo
 * contrato (nós produzimos, então garantimos o formato); o que ele **ouve**
 * chega como `unknown` pelo contrato bruto, porque quem produz é o cliente.
 */

/** Dados anexados ao socket pelo gateway depois de autenticar o handshake. */
export interface DadosSocket {
  usuarioId: string;
}

/** Eventos entre instâncias do servidor: nenhum — o broadcast é por sala. */
export type EventosEntreServidores = Record<string, never>;

export type ServidorJogo = Server<
  EventosClienteParaServidorBruto,
  EventosServidorParaCliente,
  EventosEntreServidores,
  DadosSocket
>;

export type SocketJogo = Socket<
  EventosClienteParaServidorBruto,
  EventosServidorParaCliente,
  EventosEntreServidores,
  DadosSocket
>;
