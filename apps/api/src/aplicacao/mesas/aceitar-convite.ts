import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type { MesaRepository, UsuarioRepository } from '../ports/repositorios';
import type { Relogio } from '../ports/infraestrutura';

export class AceitarConvite {
  constructor(
    private readonly mesas: MesaRepository,
    private readonly usuarios: UsuarioRepository,
    private readonly relogio: Relogio,
  ) {}

  async executar(usuarioId: string, token: string): Promise<Result<{ mesaId: string }>> {
    const mesa = await this.mesas.buscarPorTokenConvite(token);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Convite não encontrado.'));

    const usuario = await this.usuarios.buscarPorId(usuarioId);
    if (!usuario) return falha(ErroDominio.naoEncontrado('Usuário não encontrado.'));

    const aceito = mesa.aceitarConvite({
      token,
      usuarioId,
      emailUsuario: usuario.email.valor,
      agora: this.relogio.agora(),
    });
    if (!aceito.ok) return falha(aceito.erro);

    await this.mesas.salvar(mesa);
    return ok({ mesaId: mesa.id });
  }
}
