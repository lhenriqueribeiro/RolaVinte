import type { MesaDTO } from '@rolavinte/shared';
import { ok, type Result } from '../../dominio/compartilhado/resultado';
import type { MesaRepository } from '../ports/repositorios';

export class ListarMesas {
  constructor(private readonly mesas: MesaRepository) {}

  async executar(usuarioId: string): Promise<Result<MesaDTO[]>> {
    return ok(await this.mesas.listarDoUsuario(usuarioId));
  }
}
