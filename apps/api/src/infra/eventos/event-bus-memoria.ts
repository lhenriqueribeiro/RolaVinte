import type { EventoDominio } from '../../dominio/compartilhado/evento-dominio';
import type { EventBus, HandlerEvento } from '../../aplicacao/ports/infraestrutura';

/**
 * EventBus em memória do monolito. Handlers rodam de forma assíncrona e
 * isolada: falha num assinante (ex.: email fora do ar) não afeta a operação
 * de negócio que publicou o evento.
 */
export class EventBusMemoria implements EventBus {
  private readonly handlers = new Map<string, HandlerEvento[]>();

  constructor(private readonly registrarErro: (erro: unknown, nomeEvento: string) => void) {}

  assinar(nomeEvento: string, handler: HandlerEvento): void {
    const lista = this.handlers.get(nomeEvento) ?? [];
    lista.push(handler);
    this.handlers.set(nomeEvento, lista);
  }

  publicar(eventos: EventoDominio[]): void {
    for (const evento of eventos) {
      for (const handler of this.handlers.get(evento.nome) ?? []) {
        Promise.resolve()
          .then(() => handler(evento))
          .catch((erro) => this.registrarErro(erro, evento.nome));
      }
    }
  }
}
