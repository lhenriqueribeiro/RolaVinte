import type { ConvitePublicoDTO } from '@rolavinte/shared';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type { MesaRepository, UsuarioRepository } from '../ports/repositorios';

/** Página pública de convite: mostra a mesa antes do login, sem expor participantes. */
export class ObterConvitePublico {
  constructor(
    private readonly mesas: MesaRepository,
    private readonly usuarios: UsuarioRepository,
  ) {}

  async executar(token: string): Promise<Result<ConvitePublicoDTO>> {
    const mesa = await this.mesas.buscarPorTokenConvite(token);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Convite não encontrado ou já utilizado.'));

    const convite = mesa.convites.find((c) => c.token === token);
    if (!convite || convite.status !== 'pendente') {
      return falha(ErroDominio.naoEncontrado('Convite não encontrado ou já utilizado.'));
    }

    const mestre = await this.usuarios.buscarPorId(mesa.mestreId);
    return ok({ mesaNome: mesa.nome, mestreNome: mestre?.nome ?? 'Mestre', email: convite.email });
  }
}
