import type { UsuarioDTO } from '@rolavinte/shared';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import { usuarioParaDTO } from '../mapeadores';
import type { UsuarioRepository } from '../ports/repositorios';

export class ObterUsuarioAtual {
  constructor(private readonly usuarios: UsuarioRepository) {}

  async executar(usuarioId: string): Promise<Result<UsuarioDTO>> {
    const usuario = await this.usuarios.buscarPorId(usuarioId);
    if (!usuario) return falha(ErroDominio.naoEncontrado('Usuário não encontrado.'));
    return ok(usuarioParaDTO(usuario));
  }
}
