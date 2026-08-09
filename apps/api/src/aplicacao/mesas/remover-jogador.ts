import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type { MesaRepository } from '../ports/repositorios';
import type { PublicadorEventosMesa } from '../ports/infraestrutura';

export class RemoverJogador {
  constructor(
    private readonly mesas: MesaRepository,
    private readonly publicador: PublicadorEventosMesa,
  ) {}

  async executar(usuarioId: string, mesaId: string, alvoId: string): Promise<Result<void>> {
    const mesa = await this.mesas.buscarPorId(mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));

    const removido = mesa.removerJogador(usuarioId, alvoId);
    if (!removido.ok) return falha(removido.erro);

    await this.mesas.salvar(mesa);
    this.publicador.participanteRemovido(mesaId, { usuarioId: alvoId });
    return ok(undefined);
  }
}
