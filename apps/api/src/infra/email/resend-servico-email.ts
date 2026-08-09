import { Resend } from 'resend';
import type { MensagemEmail, ServicoEmail } from '../../aplicacao/ports/infraestrutura';

export class ResendServicoEmail implements ServicoEmail {
  private readonly resend: Resend;

  constructor(
    apiKey: string,
    private readonly remetente: string,
    private readonly registrarEnvio: (info: { para: string; id: string | null }) => void,
  ) {
    this.resend = new Resend(apiKey);
  }

  async enviar(mensagem: MensagemEmail): Promise<void> {
    const { data, error } = await this.resend.emails.send({
      from: this.remetente,
      to: mensagem.para,
      subject: mensagem.assunto,
      html: mensagem.html,
    });
    if (error) {
      throw new Error(`Falha ao enviar email via Resend: ${error.message}`);
    }
    this.registrarEnvio({ para: mensagem.para, id: data?.id ?? null });
  }
}
