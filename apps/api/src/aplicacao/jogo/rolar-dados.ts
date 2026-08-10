import {
  cdValida,
  definicaoDoSistema,
  mensagemSistemaSemAvaliacao,
  MENSAGEM_CD_INVALIDA,
  type AvaliacaoRolagem,
  type MensagemDTO,
  type ResultadoRolagem,
  type SistemaRpg,
} from '@rolavinte/shared';
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

/**
 * O avaliador de grau de sucesso do sistema **daquela** mesa (RV-154).
 *
 * É o ponto de extensão inteiro: o caso de uso pergunta ao registro de sistemas e
 * chama o que vier. Nenhum `switch (mesa.sistema)` aqui, nem um `if` com o nome
 * de um sistema — quem decide se avalia, e como, é a definição
 * (`.claude/rules/04-design-patterns.md`: `Map<chave, definicao>`).
 */
function avaliadorDe(sistema: SistemaRpg) {
  return definicaoDoSistema(sistema).avaliarRolagem;
}

/**
 * A recusa da CD, ou `null` se ela pode seguir.
 *
 * Dois motivos, os dois com 400 em PT-BR e sem gravar mensagem:
 *
 * 1. **o sistema não avalia** — descartar a CD em silêncio seria o jogador
 *    digitando `cd 15` para sempre sem entender por que nada aparece (F6);
 * 2. **a CD está fora da faixa** — a mesma `cdValida` que o parser do chat e o
 *    schema da rota consultam. É o terceiro *call site* de uma regra só, e não uma
 *    terceira regra: a defesa da borda não pode ser a única, porque um caminho de
 *    escrita novo (o RV-156 vai criar um) não passaria por nenhuma das duas.
 */
function recusarCd(
  sistema: SistemaRpg,
  cd: number | null,
  avaliador: ReturnType<typeof avaliadorDe>,
): ErroDominio | null {
  if (cd === null) return null;
  if (!avaliador) {
    return ErroDominio.validacao(mensagemSistemaSemAvaliacao(definicaoDoSistema(sistema).nome));
  }
  if (!cdValida(cd)) return ErroDominio.validacao(MENSAGEM_CD_INVALIDA);
  return null;
}

/** Sem CD não há grau: a mensagem continua sendo a rolagem que já era. */
function avaliar(
  avaliador: ReturnType<typeof avaliadorDe>,
  resultado: ResultadoRolagem,
  cd: number | null,
): AvaliacaoRolagem | null {
  return cd !== null && avaliador ? avaliador(resultado, cd) : null;
}

export interface EntradaRolagem {
  expressao: string;
  motivo: string;
  /**
   * Rolagem secreta do mestre (RV-071): o resultado só volta para quem rolou, e
   * os jogadores não recebem nem aviso de que houve rolagem.
   */
  oculta?: boolean;
  /**
   * CD da checagem (RV-154). Ausente ou `null` = **sem CD**, e a mensagem sai
   * exatamente como saía antes deste card: sem grau de sucesso.
   *
   * Chega já como número, dos dois caminhos possíveis — o sufixo `cd N` que o
   * parser do chat leu, ou o campo `cd` do corpo de `POST /mesas/:id/rolagens`
   * que a ficha manda. Este caso de uso **não** interpreta texto.
   */
  cd?: number | null;
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

    // A CD é recusada ANTES de rolar: mesa que não avalia grau de sucesso não
    // gasta uma mensagem para depois dizer que não sabia o que fazer com o
    // número (o card exige "nenhuma mensagem é criada").
    const cd = entrada.cd ?? null;
    const avaliador = avaliadorDe(mesa.sistema);
    const recusa = recusarCd(mesa.sistema, cd, avaliador);
    if (recusa) return falha(recusa);

    const resultado = this.servicoRolagem.rolar(expressao.valor);
    const dados = {
      id: this.geradorId.gerar(),
      mesaId,
      autorId: usuarioId,
      autorNome: autor.nome,
      rolagem: resultado,
      motivo: entrada.motivo,
      avaliacao: avaliar(avaliador, resultado, cd),
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
