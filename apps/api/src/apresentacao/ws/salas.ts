import { SALA_MESA, SALA_USUARIO_NA_MESA } from '@rolavinte/shared';
import type { DadosSocket } from './servidor-socket';

/** Onde a falha de um `leave` é registrada. O tempo real não tem tradutor central de erro. */
export type RegistrarErroWs = (erro: unknown, contexto: string) => void;

/**
 * O mínimo que `sairDasSalasDaMesa` precisa de um socket.
 *
 * Declarado estruturalmente de propósito: o gateway tem um `Socket` local e o
 * publicador tem um `RemoteSocket` vindo de `fetchSockets()`. São tipos
 * diferentes do socket.io, com a mesma capacidade — e é a capacidade que
 * interessa aqui. `leave` aparece como `void | Promise<void>` porque é isso que
 * as duas assinaturas somadas dão.
 */
export interface SocketQueSai {
  readonly data: DadosSocket;
  leave(sala: string): void | Promise<void>;
}

/**
 * As duas salas que um participante ocupa numa mesa: a da mesa e a pessoal
 * dentro dela (destino de sussurro e rolagem oculta — RV-070/RV-071).
 *
 * Elas entram juntas, depois da verificação de participação, e **saem juntas**.
 * Esta função existe para que esse "juntas" tenha um dono só: era uma lista
 * escrita à mão em cada lugar que mexia em sala, e a segunda cópia já nasceu
 * incompleta — `participanteRemovido` tirava o jogador removido da sala da mesa
 * e o deixava na pessoal, contra a invariante que `eventos-ws.ts` declara.
 */
export function salasDaMesa(mesaId: string, usuarioId: string): readonly string[] {
  return [SALA_MESA(mesaId), SALA_USUARIO_NA_MESA(mesaId, usuarioId)];
}

/**
 * Tira o socket de todas as salas daquela mesa, sem deixar promessa sem dono.
 *
 * `leave` é assíncrono quando há adapter, e o socket.io não observa o valor
 * devolvido por quem o chama: uma rejeição que escape aqui vira unhandled
 * rejection e derruba o processo inteiro — todas as mesas, todos os jogadores.
 * `void promessa` **não** resolve isso; ele cala o lint e deixa a rejeição
 * exatamente tão órfã quanto antes. Por isso o `catch` é explícito, e por isso
 * ninguém neste diretório chama `leave` direto.
 */
export function sairDasSalasDaMesa(
  socket: SocketQueSai,
  mesaId: string,
  usuarioId: string,
  registrarErro: RegistrarErroWs,
  contexto: string,
): void {
  for (const sala of salasDaMesa(mesaId, usuarioId)) {
    Promise.resolve(socket.leave(sala)).catch((erro) => registrarErro(erro, contexto));
  }
}
