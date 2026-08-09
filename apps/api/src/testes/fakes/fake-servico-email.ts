import type { MensagemEmail, ServicoEmail } from '../../aplicacao/ports/infraestrutura';

/**
 * Fake em memória de `ServicoEmail`: nada sai para a rede, tudo fica guardado
 * para inspeção — é assim que um teste extrai, por exemplo, o token de convite
 * embutido no corpo do email.
 */
export class FakeServicoEmail implements ServicoEmail {
  private readonly mensagens: MensagemEmail[] = [];

  async enviar(mensagem: MensagemEmail): Promise<void> {
    this.mensagens.push({ ...mensagem });
  }

  get enviados(): readonly MensagemEmail[] {
    return this.mensagens;
  }

  /** Último email enviado para o destinatário, ou `null` se nenhum. */
  ultimoPara(para: string): MensagemEmail | null {
    const alvo = para.trim().toLowerCase();
    for (let i = this.mensagens.length - 1; i >= 0; i -= 1) {
      const mensagem = this.mensagens[i];
      if (mensagem && mensagem.para.trim().toLowerCase() === alvo) return mensagem;
    }
    return null;
  }

  limpar(): void {
    this.mensagens.length = 0;
  }
}
