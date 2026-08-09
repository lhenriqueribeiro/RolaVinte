/**
 * Socket falso: registra ouvintes e emissões em memória, sem nenhuma conexão.
 *
 * Compartilhado por `use-socket-mesa.test.ts` (comportamento) e
 * `cobertura-eventos-ws.test.ts` (cobertura de eventos do contrato) — os dois
 * precisam inspecionar exatamente os mesmos ouvintes, e duas cópias do fake
 * poderiam divergir justamente no que está sendo medido.
 */
export type Ouvinte = (...args: never[]) => void;

export interface Emissao {
  evento: string;
  args: unknown[];
}

export class SocketFalso {
  readonly ouvintes = new Map<string, Ouvinte[]>();
  readonly emitidos: Emissao[] = [];

  /**
   * Os dois sinais de estado que o socket.io-client expõe e que o RV-112 lê:
   * `connected` (o socket está de pé agora) e `active` (o socket.io ainda vai
   * tentar reconectar sozinho — falso em `io server disconnect`, em falha de
   * handshake e quando as tentativas se esgotam).
   */
  connected = true;
  active = true;

  on(evento: string, ouvinte: Ouvinte): this {
    this.ouvintes.set(evento, [...(this.ouvintes.get(evento) ?? []), ouvinte]);
    return this;
  }

  off(evento: string, ouvinte: Ouvinte): this {
    const restantes = (this.ouvintes.get(evento) ?? []).filter((o) => o !== ouvinte);
    if (restantes.length === 0) this.ouvintes.delete(evento);
    else this.ouvintes.set(evento, restantes);
    return this;
  }

  emit(evento: string, ...args: unknown[]): this {
    this.emitidos.push({ evento, args });
    return this;
  }

  /** Simula um evento vindo do servidor. */
  disparar(evento: string, ...args: unknown[]): void {
    for (const ouvinte of [...(this.ouvintes.get(evento) ?? [])]) {
      (ouvinte as (...args: unknown[]) => void)(...args);
    }
  }

  /**
   * Nomes de eventos com pelo menos um ouvinte registrado. É o que o teste de
   * cobertura compara com o contrato — e o que prova ausência de vazamento
   * depois do cleanup.
   */
  get eventosOuvidos(): string[] {
    return [...this.ouvintes.keys()];
  }

  get totalOuvintes(): number {
    let total = 0;
    for (const lista of this.ouvintes.values()) total += lista.length;
    return total;
  }

  emissoesDe(evento: string): Emissao[] {
    return this.emitidos.filter((e) => e.evento === evento);
  }
}
