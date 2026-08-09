import type { EventoDominio } from './evento-dominio';

export abstract class Entidade {
  private eventosPendentes: EventoDominio[] = [];

  protected constructor(readonly id: string) {}

  protected registrarEvento(evento: EventoDominio): void {
    this.eventosPendentes.push(evento);
  }

  /** Drena os eventos acumulados — chamado pelo use case após persistir. */
  puxarEventos(): EventoDominio[] {
    const eventos = this.eventosPendentes;
    this.eventosPendentes = [];
    return eventos;
  }
}
