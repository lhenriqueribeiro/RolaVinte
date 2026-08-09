import type { MensagemEmail, ServicoEmail } from '../../aplicacao/ports/infraestrutura';

/** Fallback de desenvolvimento: sem RESEND_API_KEY, emails caem no console. */
export class ConsoleServicoEmail implements ServicoEmail {
  async enviar(mensagem: MensagemEmail): Promise<void> {
    console.log(
      [
        '',
        '═══════════════ 📧 EMAIL (modo console) ═══════════════',
        `Para:    ${mensagem.para}`,
        `Assunto: ${mensagem.assunto}`,
        '─────────────────────────────────────────────────────',
        mensagem.html
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
        '═════════════════════════════════════════════════════',
        '',
      ].join('\n'),
    );
  }
}
