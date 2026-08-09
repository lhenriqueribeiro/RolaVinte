import { randomUUID } from 'node:crypto';
import type { GeradorId } from '../../aplicacao/ports/infraestrutura';

export class UuidGeradorId implements GeradorId {
  gerar(): string {
    return randomUUID();
  }
}
