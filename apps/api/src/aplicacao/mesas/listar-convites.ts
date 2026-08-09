import type { ConviteDTO } from '@rolavinte/shared';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type { MesaRepository } from '../ports/repositorios';

/** Painel do mestre (RV-020): histórico completo de convites, inclusive revogados. */
export class ListarConvites {
  constructor(private readonly mesas: MesaRepository) {}

  async executar(usuarioId: string, mesaId: string): Promise<Result<ConviteDTO[]>> {
    const mesa = await this.mesas.buscarPorId(mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));
    if (!mesa.ehMestre(usuarioId)) {
      return falha(ErroDominio.naoAutorizado('Apenas o mestre pode gerir os convites da mesa.'));
    }

    return ok(
      mesa.convites
        .map((c) => ({
          id: c.id,
          email: c.email,
          status: c.status,
          criadoEm: c.criadoEm.toISOString(),
        }))
        .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)),
    );
  }
}
