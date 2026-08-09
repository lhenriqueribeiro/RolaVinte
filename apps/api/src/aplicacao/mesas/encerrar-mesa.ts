import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type { MesaRepository } from '../ports/repositorios';
import type { Relogio } from '../ports/infraestrutura';

/** Arquivamento (soft) do RV-023: a mesa continua legível, mas não aceita escrita. */
export class EncerrarMesa {
  constructor(
    private readonly mesas: MesaRepository,
    private readonly relogio: Relogio,
  ) {}

  async executar(usuarioId: string, mesaId: string): Promise<Result<void>> {
    const mesa = await this.mesas.buscarPorId(mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));

    const encerrada = mesa.encerrar(usuarioId, this.relogio.agora());
    if (!encerrada.ok) return falha(encerrada.erro);

    await this.mesas.salvar(mesa);
    return ok(undefined);
  }
}
