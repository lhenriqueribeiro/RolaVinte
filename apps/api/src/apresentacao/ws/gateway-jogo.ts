import { z } from 'zod';
import { SALA_MESA, type AckEntrarNaMesa } from '@rolavinte/shared';
import type { ServicoToken } from '../../aplicacao/ports/infraestrutura';
import type { VerificarParticipacao } from '../../aplicacao/jogo/verificar-participacao';
import type { ServidorJogo, SocketJogo } from './servidor-socket';

const mesaIdSchema = z.string().uuid();

/**
 * Fachada única do tempo real. Sockets só entram na sala da mesa após
 * autenticação (JWT no handshake) e verificação de participação.
 * Ações de jogo acontecem via REST; a sala recebe os broadcasts.
 *
 * Os payloads de entrada chegam como `unknown` (contrato bruto de
 * `@rolavinte/shared`) e **continuam** passando por Zod: o generico descreve o
 * que um cliente bem-comportado envia, não o que chegou pelo fio.
 */
export class GatewayJogo {
  constructor(
    private readonly io: ServidorJogo,
    private readonly servicoToken: ServicoToken,
    private readonly verificarParticipacao: VerificarParticipacao,
  ) {}

  iniciar(): void {
    this.io.use((socket, next) => {
      // O middleware do Socket.IO é síncrono: se a promessa fosse devolvida
      // crua, uma rejeição deixaria o handshake pendurado para sempre.
      // Por isso o `catch` também termina o middleware chamando `next`.
      this.autenticarHandshake(socket)
        .then((erro) => next(erro ?? undefined))
        .catch(() => next(new Error('Falha ao autenticar a conexão.')));
    });

    this.io.on('connection', (socket: SocketJogo) => {
      socket.on('mesa:entrar', async (mesaIdBruto: unknown, ack?: AckEntrarNaMesa) => {
        const responder = typeof ack === 'function' ? ack : () => {};
        const mesaId = mesaIdSchema.safeParse(mesaIdBruto);
        if (!mesaId.success) return responder({ ok: false, erro: 'Mesa inválida.' });

        const { usuarioId } = socket.data;
        const participa = await this.verificarParticipacao.executar(usuarioId, mesaId.data);
        if (!participa) return responder({ ok: false, erro: 'Você não participa desta mesa.' });

        await socket.join(SALA_MESA(mesaId.data));
        responder({ ok: true });
      });

      socket.on('mesa:sair', (mesaIdBruto: unknown) => {
        const mesaId = mesaIdSchema.safeParse(mesaIdBruto);
        if (mesaId.success) void socket.leave(SALA_MESA(mesaId.data));
      });
    });
  }

  /** Valida o JWT do handshake. Devolve o erro a propagar, ou `null` se autenticou. */
  private async autenticarHandshake(socket: SocketJogo): Promise<Error | null> {
    const token: unknown = socket.handshake.auth?.token;
    if (typeof token !== 'string') return new Error('Autenticação necessária.');
    const sessao = await this.servicoToken.verificar(token);
    if (!sessao) return new Error('Sessão inválida.');
    socket.data.usuarioId = sessao.usuarioId;
    return null;
  }
}
