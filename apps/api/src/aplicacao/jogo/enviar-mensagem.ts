import type { MensagemDTO } from '@rolavinte/shared';
import { Mensagem } from '../../dominio/jogo/mensagem';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import { mensagemParaDTO } from '../mapeadores';
import { publicarMensagem } from './publicar-mensagem';
import type { MensagemRepository, MesaRepository, UsuarioRepository } from '../ports/repositorios';
import type { GeradorId, PublicadorEventosMesa, Relogio } from '../ports/infraestrutura';

export class EnviarMensagem {
  constructor(
    private readonly mensagens: MensagemRepository,
    private readonly mesas: MesaRepository,
    private readonly usuarios: UsuarioRepository,
    private readonly geradorId: GeradorId,
    private readonly relogio: Relogio,
    private readonly publicador: PublicadorEventosMesa,
  ) {}

  async executar(
    usuarioId: string,
    mesaId: string,
    conteudo: string,
  ): Promise<Result<MensagemDTO>> {
    const mesa = await this.mesas.buscarPorId(mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));
    const permitido = mesa.autorizarEscritaDeParticipante(usuarioId);
    if (!permitido.ok) return falha(permitido.erro);

    const autor = await this.usuarios.buscarPorId(usuarioId);
    if (!autor) return falha(ErroDominio.naoEncontrado('Usuário não encontrado.'));

    const mensagem = Mensagem.criarFala({
      id: this.geradorId.gerar(),
      mesaId,
      autorId: usuarioId,
      autorNome: autor.nome,
      conteudo,
      agora: this.relogio.agora(),
    });
    if (!mensagem.ok) return falha(mensagem.erro);

    await this.mensagens.salvar(mensagem.valor);
    const dto = mensagemParaDTO(mensagem.valor);
    publicarMensagem(this.publicador, mensagem.valor, dto);
    return ok(dto);
  }
}
