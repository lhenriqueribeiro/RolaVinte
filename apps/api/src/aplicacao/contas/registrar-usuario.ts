import type { RegistrarEntrada, SessaoDTO } from '@rolavinte/shared';
import { Usuario } from '../../dominio/contas/usuario';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import { usuarioParaDTO } from '../mapeadores';
import type { UsuarioRepository } from '../ports/repositorios';
import type { GeradorId, Relogio, ServicoSenha, ServicoToken } from '../ports/infraestrutura';

export class RegistrarUsuario {
  constructor(
    private readonly usuarios: UsuarioRepository,
    private readonly servicoSenha: ServicoSenha,
    private readonly servicoToken: ServicoToken,
    private readonly geradorId: GeradorId,
    private readonly relogio: Relogio,
  ) {}

  async executar(entrada: RegistrarEntrada): Promise<Result<SessaoDTO>> {
    const existente = await this.usuarios.buscarPorEmail(entrada.email);
    if (existente) return falha(ErroDominio.conflito('Já existe uma conta com este email.'));

    const senhaHash = await this.servicoSenha.gerarHash(entrada.senha);
    const usuario = Usuario.criar({
      id: this.geradorId.gerar(),
      nome: entrada.nome,
      email: entrada.email,
      senhaHash,
      agora: this.relogio.agora(),
    });
    if (!usuario.ok) return falha(usuario.erro);

    await this.usuarios.salvar(usuario.valor);
    const token = await this.servicoToken.gerar({ usuarioId: usuario.valor.id });
    return ok({ token, usuario: usuarioParaDTO(usuario.valor) });
  }
}
