import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type { MesaRepository } from '../ports/repositorios';
import type { PublicadorEventosMesa } from '../ports/infraestrutura';

export class SairDaMesa {
  constructor(
    private readonly mesas: MesaRepository,
    private readonly publicador: PublicadorEventosMesa,
  ) {}

  async executar(usuarioId: string, mesaId: string): Promise<Result<void>> {
    const mesa = await this.mesas.buscarPorId(mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));

    const saiu = mesa.sair(usuarioId);
    if (!saiu.ok) return falha(saiu.erro);

    await this.mesas.salvar(mesa);
    this.publicador.participanteRemovido(mesaId, { usuarioId });
    return ok(undefined);
  }
}
