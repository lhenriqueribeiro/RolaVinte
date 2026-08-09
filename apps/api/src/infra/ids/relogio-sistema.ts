import type { Relogio } from '../../aplicacao/ports/infraestrutura';

export class RelogioSistema implements Relogio {
  agora(): Date {
    return new Date();
  }
}
