import type { MensagemDTO } from '@rolavinte/shared';
import { ExpressaoDados } from '../../dominio/jogo/expressao-dados';
import { Mensagem } from '../../dominio/jogo/mensagem';
import type { ServicoRolagemDados } from '../../dominio/jogo/servico-rolagem';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import { mensagemParaDTO } from '../mapeadores';
import { publicarMensagem } from './publicar-mensagem';
import type { MensagemRepository, MesaRepository, UsuarioRepository } from '../ports/repositorios';
import type { GeradorId, PublicadorEventosMesa, Relogio } from '../ports/infraestrutura';

/** Motivo da recusa quando um jogador tenta rolar oculto (RV-071). */
export const ROLAGEM_OCULTA_SO_DO_MESTRE = 'Apenas o mestre pode fazer rolagens ocultas.';

export interface EntradaRolagem {
  expressao: string;
  motivo: string;
  /**
   * Rolagem secreta do mestre (RV-071): o resultado só volta para quem rolou, e
   * os jogadores não recebem nem aviso de que houve rolagem.
   */
  oculta?: boolean;
}

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
    entrada: EntradaRolagem,
  ): Promise<Result<MensagemDTO>> {
    const oculta = entrada.oculta === true;

    const mesa = await this.mesas.buscarPorId(mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));
    // Rolagem oculta é privilégio do mestre e reusa a guarda do agregado — que
    // já cobre participação e mesa encerrada juntas. A recusa acontece aqui, no
    // servidor: esconder o comando na interface não protege nada (F4).
    const permitido = oculta
      ? mesa.autorizarEscritaDoMestre(usuarioId, ROLAGEM_OCULTA_SO_DO_MESTRE)
      : mesa.autorizarEscritaDeParticipante(usuarioId);
    if (!permitido.ok) return falha(permitido.erro);

    const autor = await this.usuarios.buscarPorId(usuarioId);
    if (!autor) return falha(ErroDominio.naoEncontrado('Usuário não encontrado.'));

    const expressao = ExpressaoDados.criar(entrada.expressao);
    if (!expressao.ok) return falha(expressao.erro);

    const resultado = this.servicoRolagem.rolar(expressao.valor);
    const dados = {
      id: this.geradorId.gerar(),
      mesaId,
      autorId: usuarioId,
      autorNome: autor.nome,
      rolagem: resultado,
      motivo: entrada.motivo,
      agora: this.relogio.agora(),
    };
    const mensagem = oculta ? Mensagem.criarRolagemOculta(dados) : Mensagem.criarRolagem(dados);

    await this.mensagens.salvar(mensagem);
    const dto = mensagemParaDTO(mensagem);
    // Quem escolhe o alvo do broadcast é o tipo da mensagem, num ponto só.
    publicarMensagem(this.publicador, mensagem, dto);
    return ok(dto);
  }
}
