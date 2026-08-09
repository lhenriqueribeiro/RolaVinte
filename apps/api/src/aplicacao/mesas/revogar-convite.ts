import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type { MesaRepository } from '../ports/repositorios';

export class RevogarConvite {
  constructor(private readonly mesas: MesaRepository) {}

  async executar(usuarioId: string, mesaId: string, conviteId: string): Promise<Result<void>> {
    const mesa = await this.mesas.buscarPorId(mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));

    const revogado = mesa.revogarConvite(usuarioId, conviteId);
    if (!revogado.ok) return falha(revogado.erro);

    await this.mesas.salvar(mesa);
    return ok(undefined);
  }
}
