import type { AtualizarMesaEntrada, MesaDTO } from '@rolavinte/shared';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type { MesaRepository, UsuarioRepository } from '../ports/repositorios';
import { mesaParaDTO } from './mesa-dto';

export class AtualizarMesa {
  constructor(
    private readonly mesas: MesaRepository,
    private readonly usuarios: UsuarioRepository,
  ) {}

  async executar(
    usuarioId: string,
    mesaId: string,
    entrada: AtualizarMesaEntrada,
  ): Promise<Result<MesaDTO>> {
    const mesa = await this.mesas.buscarPorId(mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));

    const atualizada = mesa.atualizar(usuarioId, entrada);
    if (!atualizada.ok) return falha(atualizada.erro);

    await this.mesas.salvar(mesa);

    const mestre = await this.usuarios.buscarPorId(mesa.mestreId);
    return ok(mesaParaDTO(mesa, { usuarioId, mestreNome: mestre?.nome ?? 'Mestre' }));
  }
}
