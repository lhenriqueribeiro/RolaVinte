import type {
  GeradorId,
  Relogio,
  ServicoSenha,
  ServicoToken,
} from '../../aplicacao/ports/infraestrutura';

/**
 * Gerador determinístico de ids. Emite UUIDs válidos (versão 4) porque os
 * schemas Zod dos contratos exigem `uuid` — trocar por ids "bonitinhos"
 * quebraria a substituição pelo `UuidGeradorId`.
 */
export class GeradorIdSequencial implements GeradorId {
  private contador = 0;

  gerar(): string {
    this.contador += 1;
    const sufixo = this.contador.toString(16).padStart(12, '0');
    return `00000000-0000-4000-8000-${sufixo}`;
  }
}

/** Relógio parado num instante conhecido; testes avançam o tempo à mão. */
export class RelogioFixo implements Relogio {
  private instante: Date;

  constructor(instanteInicial: Date = new Date('2026-08-08T12:00:00.000Z')) {
    this.instante = new Date(instanteInicial);
  }

  agora(): Date {
    return new Date(this.instante);
  }

  avancar(milissegundos: number): void {
    this.instante = new Date(this.instante.getTime() + milissegundos);
  }

  definir(instante: Date): void {
    this.instante = new Date(instante);
  }
}

const PREFIXO_HASH = 'hash-de-teste:';

/** Hash reversível e instantâneo — bcrypt real deixaria a suíte lenta sem ganho. */
export class FakeServicoSenha implements ServicoSenha {
  async gerarHash(senha: string): Promise<string> {
    return `${PREFIXO_HASH}${senha}`;
  }

  async verificar(senha: string, hash: string): Promise<boolean> {
    return hash === `${PREFIXO_HASH}${senha}`;
  }
}

const PREFIXO_TOKEN = 'token-de-teste:';

/**
 * Token opaco determinístico para testes de caso de uso. O harness HTTP usa o
 * `JwtServicoToken` real (offline, com segredo fixo) para exercitar de verdade
 * o preHandler de autenticação.
 */
export class FakeServicoToken implements ServicoToken {
  async gerar(payload: { usuarioId: string }): Promise<string> {
    return `${PREFIXO_TOKEN}${payload.usuarioId}`;
  }

  async verificar(token: string): Promise<{ usuarioId: string } | null> {
    if (!token.startsWith(PREFIXO_TOKEN)) return null;
    const usuarioId = token.slice(PREFIXO_TOKEN.length);
    return usuarioId.length > 0 ? { usuarioId } : null;
  }
}
