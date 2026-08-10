import { SALA_MESA, SALA_USUARIO_NA_MESA, type PayloadEventoServidor } from '@rolavinte/shared';
import type { PublicadorEventosMesa } from '../../aplicacao/ports/infraestrutura';
import type { ServidorJogo } from './servidor-socket';

/**
 * Adapter Socket.IO da port PublicadorEventosMesa — broadcast por sala da mesa.
 * O `io` é tipado pelo contrato: nome de evento inexistente ou payload em
 * formato diferente do que o cliente espera não compila (RV-115).
 */
export class PublicadorSocket implements PublicadorEventosMesa {
  constructor(private readonly io: ServidorJogo) {}

  mensagemNova(mesaId: string, mensagem: PayloadEventoServidor<'mensagem:nova'>): void {
    this.io.to(SALA_MESA(mesaId)).emit('mensagem:nova', mensagem);
  }

  /**
   * Sussurro e rolagem oculta (RV-070/RV-071): mesmo evento, salas pessoais.
   *
   * `to([...])` com várias salas entrega **uma vez** por socket, mesmo que ele
   * esteja em duas delas — é o caso do sussurro para si mesmo. Lista vazia
   * jamais vira `to([])`: no Socket.IO isso é "broadcast para todo mundo", o
   * oposto exato do que este método existe para fazer.
   */
  mensagemPrivada(
    mesaId: string,
    usuarioIds: readonly string[],
    mensagem: PayloadEventoServidor<'mensagem:nova'>,
  ): void {
    if (usuarioIds.length === 0) return;
    const salas = usuarioIds.map((usuarioId) => SALA_USUARIO_NA_MESA(mesaId, usuarioId));
    this.io.to(salas).emit('mensagem:nova', mensagem);
  }

  tokenCriado(mesaId: string, token: PayloadEventoServidor<'token:criado'>): void {
    this.io.to(SALA_MESA(mesaId)).emit('token:criado', token);
  }

  tokenAtualizado(mesaId: string, token: PayloadEventoServidor<'token:atualizado'>): void {
    this.io.to(SALA_MESA(mesaId)).emit('token:atualizado', token);
  }

  tokenRemovido(mesaId: string, dados: PayloadEventoServidor<'token:removido'>): void {
    this.io.to(SALA_MESA(mesaId)).emit('token:removido', dados);
  }

  cenaAtivada(mesaId: string, cena: PayloadEventoServidor<'cena:ativada'>): void {
    this.io.to(SALA_MESA(mesaId)).emit('cena:ativada', cena);
  }

  personagemAtualizado(
    mesaId: string,
    personagem: PayloadEventoServidor<'personagem:atualizado'>,
  ): void {
    this.io.to(SALA_MESA(mesaId)).emit('personagem:atualizado', personagem);
  }

  combateAtualizado(mesaId: string, combate: PayloadEventoServidor<'combate:atualizado'>): void {
    this.io.to(SALA_MESA(mesaId)).emit('combate:atualizado', combate);
  }

  participanteRemovido(
    mesaId: string,
    dados: Omit<PayloadEventoServidor<'mesa:participante-removido'>, 'mesaId'>,
  ): void {
    const sala = SALA_MESA(mesaId);
    this.io.to(sala).emit('mesa:participante-removido', { mesaId, usuarioId: dados.usuarioId });
    // O removido perde o acesso na hora: sai da sala sem esperar reconexão.
    this.io
      .in(sala)
      .fetchSockets()
      .then((sockets) => {
        for (const socket of sockets) {
          if (socket.data.usuarioId === dados.usuarioId) void socket.leave(sala);
        }
      })
      .catch(() => {
        // Broadcast é best-effort: falhar aqui não pode derrubar a operação de negócio.
      });
  }
}
