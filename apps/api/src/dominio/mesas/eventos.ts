import type { EventoDominio } from '../compartilhado/evento-dominio';

export class JogadorConvidado implements EventoDominio {
  readonly nome = 'mesas.jogador-convidado';
  constructor(
    readonly ocorridoEm: Date,
    readonly dados: {
      mesaId: string;
      mesaNome: string;
      emailConvidado: string;
      tokenConvite: string;
      nomeMestre: string;
    },
  ) {}
}
