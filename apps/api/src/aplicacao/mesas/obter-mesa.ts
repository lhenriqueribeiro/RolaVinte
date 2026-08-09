import type { MesaDetalheDTO } from '@rolavinte/shared';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type { MesaRepository, UsuarioRepository } from '../ports/repositorios';
import { mesaParaDTO } from './mesa-dto';

export class ObterMesa {
  constructor(
    private readonly mesas: MesaRepository,
    private readonly usuarios: UsuarioRepository,
  ) {}

  async executar(usuarioId: string, mesaId: string): Promise<Result<MesaDetalheDTO>> {
    const mesa = await this.mesas.buscarPorId(mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));
    if (!mesa.ehParticipante(usuarioId)) {
      return falha(ErroDominio.naoAutorizado('Você não participa desta mesa.'));
    }

    const [mestre, jogadores] = await Promise.all([
      this.usuarios.buscarPorId(mesa.mestreId),
      this.mesas.listarJogadores(mesaId),
    ]);

    return ok({
      ...mesaParaDTO(mesa, {
        usuarioId,
        mestreNome: mestre?.nome ?? 'Mestre',
        totalJogadores: jogadores.length,
      }),
      jogadores,
    });
  }
}
