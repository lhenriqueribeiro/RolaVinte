import { z } from 'zod';
import { SALA_MESA, SALA_USUARIO_NA_MESA, type AckEntrarNaMesa } from '@rolavinte/shared';
import type { ServicoToken } from '../../aplicacao/ports/infraestrutura';
import type { VerificarParticipacao } from '../../aplicacao/jogo/verificar-participacao';
import type { ServidorJogo, SocketJogo } from './servidor-socket';

const mesaIdSchema = z.string().uuid();

/** O que o cliente vê quando a infraestrutura falha — sem revelar a causa. */
const ERRO_INDISPONIVEL = 'Não foi possível entrar na mesa agora. Tente de novo.';

/**
 * Fachada única do tempo real. Sockets só entram na sala da mesa após
 * autenticação (JWT no handshake) e verificação de participação.
 * Ações de jogo acontecem via REST; a sala recebe os broadcasts.
 *
 * Os payloads de entrada chegam como `unknown` (contrato bruto de
 * `@rolavinte/shared`) e **continuam** passando por Zod: o generico descreve o
 * que um cliente bem-comportado envia, não o que chegou pelo fio.
 *
 * **Nenhuma promessa sai daqui sem dono.** O Socket.IO não observa o valor
 * devolvido por um listener, então uma rejeição que escape vira unhandled
 * rejection e derruba o processo inteiro — todas as salas, todos os jogadores.
 * O caminho HTTP sobrevive à mesma falha porque tem o tradutor central de erro
 * de `apresentacao/http`; aqui, o equivalente é esta fachada. Listener novo
 * nasce com o mesmo tratamento.
 */
export class GatewayJogo {
  constructor(
    private readonly io: ServidorJogo,
    private readonly servicoToken: ServicoToken,
    private readonly verificarParticipacao: VerificarParticipacao,
    private readonly registrarErro: (erro: unknown, evento: string) => void,
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
        const responder = this.criarResponder(ack);
        try {
          await this.entrarNaMesa(socket, mesaIdBruto, responder);
        } catch (erro) {
          this.registrarErro(erro, 'mesa:entrar');
          responder({ ok: false, erro: ERRO_INDISPONIVEL });
        }
      });

      socket.on('mesa:sair', (mesaIdBruto: unknown) => {
        const mesaId = mesaIdSchema.safeParse(mesaIdBruto);
        if (!mesaId.success) return;
        this.sairDaSala(socket, SALA_MESA(mesaId.data));
        // Sair da mesa é parar de receber tudo dela, inclusive o que era privado.
        this.sairDaSala(socket, SALA_USUARIO_NA_MESA(mesaId.data, socket.data.usuarioId));
      });
    });
  }

  /** Valida o payload, autoriza e coloca o socket nas salas da mesa. */
  private async entrarNaMesa(
    socket: SocketJogo,
    mesaIdBruto: unknown,
    responder: AckEntrarNaMesa,
  ): Promise<void> {
    const mesaId = mesaIdSchema.safeParse(mesaIdBruto);
    if (!mesaId.success) return responder({ ok: false, erro: 'Mesa inválida.' });

    const { usuarioId } = socket.data;
    const participa = await this.verificarParticipacao.executar(usuarioId, mesaId.data);
    if (!participa) return responder({ ok: false, erro: 'Você não participa desta mesa.' });

    // A sala pessoal desta mesa é o destino de sussurro e rolagem oculta
    // (RV-070/RV-071). Entra no mesmo instante da sala da mesa, depois da
    // mesma verificação de participação: não existe caminho para receber
    // mensagem privada de uma mesa da qual não se participa.
    await socket.join([SALA_MESA(mesaId.data), SALA_USUARIO_NA_MESA(mesaId.data, usuarioId)]);
    responder({ ok: true });
  }

  /** `leave` é assíncrono: sem este `catch` a rejeição ficaria sem dono. */
  private sairDaSala(socket: SocketJogo, sala: string): void {
    Promise.resolve(socket.leave(sala)).catch((erro) => this.registrarErro(erro, 'mesa:sair'));
  }

  /**
   * O ack é um callback do **cliente**: pode não existir, pode lançar, e
   * responder duas vezes confundiria quem espera uma resposta só. A trava de
   * uma resposta só é o que impede um ack duplicado quando a falha acontece
   * já no fim do fluxo, com o cliente já respondido.
   */
  private criarResponder(ack: AckEntrarNaMesa | undefined): AckEntrarNaMesa {
    let respondido = false;
    return (resposta) => {
      if (respondido || typeof ack !== 'function') return;
      respondido = true;
      try {
        ack(resposta);
      } catch (erro) {
        // O callback é do cliente, mas quem pagaria a rejeição sem dono
        // seria este processo.
        this.registrarErro(erro, 'mesa:entrar/ack');
      }
    };
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
