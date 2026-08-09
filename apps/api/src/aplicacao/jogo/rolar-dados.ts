import type { MensagemDTO } from '@rolavinte/shared';
import { ExpressaoDados } from '../../dominio/jogo/expressao-dados';
import { Mensagem } from '../../dominio/jogo/mensagem';
import type { ServicoRolagemDados } from '../../dominio/jogo/servico-rolagem';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import { mensagemParaDTO } from '../mapeadores';
import type { MensagemRepository, MesaRepository, UsuarioRepository } from '../ports/repositorios';
import type { GeradorId, PublicadorEventosMesa, Relogio } from '../ports/infraestrutura';

export class RolarDados {
  constructor(
    private readonly mensagens: MensagemRepository,
    private readonly mesas: MesaRepository,
    private readonly usuarios: UsuarioRepository,
    private readonly servicoRolagem: ServicoRolagemDados,
    private readonly geradorId: GeradorId,
    private readonly relogio: Relogio,
    private readonly publicador: PublicadorEventosMesa,
  ) {}

  async executar(
    usuarioId: string,
    mesaId: string,
    entrada: { expressao: string; motivo: string },
  ): Promise<Result<MensagemDTO>> {
    const mesa = await this.mesas.buscarPorId(mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));
    const permitido = mesa.autorizarEscritaDeParticipante(usuarioId);
    if (!permitido.ok) return falha(permitido.erro);

    const autor = await this.usuarios.buscarPorId(usuarioId);
    if (!autor) return falha(ErroDominio.naoEncontrado('Usuário não encontrado.'));

    const expressao = ExpressaoDados.criar(entrada.expressao);
    if (!expressao.ok) return falha(expressao.erro);

    const resultado = this.servicoRolagem.rolar(expressao.valor);
    const mensagem = Mensagem.criarRolagem({
      id: this.geradorId.gerar(),
      mesaId,
      autorId: usuarioId,
      autorNome: autor.nome,
      rolagem: resultado,
      motivo: entrada.motivo,
      agora: this.relogio.agora(),
    });

    await this.mensagens.salvar(mensagem);
    const dto = mensagemParaDTO(mensagem);
    this.publicador.mensagemNova(mesaId, dto);
    return ok(dto);
  }
}
