import type { MesaRepository } from '../ports/repositorios';

/** Usado pelo gateway de tempo real para autorizar entrada na sala da mesa. */
export class VerificarParticipacao {
  constructor(private readonly mesas: MesaRepository) {}

  async executar(usuarioId: string, mesaId: string): Promise<boolean> {
    const mesa = await this.mesas.buscarPorId(mesaId);
    return mesa !== null && mesa.ehParticipante(usuarioId);
  }
}
