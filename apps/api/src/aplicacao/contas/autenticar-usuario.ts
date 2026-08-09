import type { LoginEntrada, SessaoDTO } from '@rolavinte/shared';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import { usuarioParaDTO } from '../mapeadores';
import type { UsuarioRepository } from '../ports/repositorios';
import type { ServicoSenha, ServicoToken } from '../ports/infraestrutura';

const CREDENCIAIS_INVALIDAS = 'Email ou senha incorretos.';

export class AutenticarUsuario {
  constructor(
    private readonly usuarios: UsuarioRepository,
    private readonly servicoSenha: ServicoSenha,
    private readonly servicoToken: ServicoToken,
  ) {}

  async executar(entrada: LoginEntrada): Promise<Result<SessaoDTO>> {
    const usuario = await this.usuarios.buscarPorEmail(entrada.email);
    if (!usuario) return falha(ErroDominio.naoAutorizado(CREDENCIAIS_INVALIDAS));

    const senhaConfere = await this.servicoSenha.verificar(entrada.senha, usuario.senhaHash);
    if (!senhaConfere) return falha(ErroDominio.naoAutorizado(CREDENCIAIS_INVALIDAS));

    const token = await this.servicoToken.gerar({ usuarioId: usuario.id });
    return ok({ token, usuario: usuarioParaDTO(usuario) });
  }
}
