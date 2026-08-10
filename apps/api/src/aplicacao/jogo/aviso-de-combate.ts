import { Mensagem } from '../../dominio/jogo/mensagem';
import { mensagemParaDTO } from '../mapeadores';
import type { MensagemRepository } from '../ports/repositorios';
import type { GeradorId, PublicadorEventosMesa, Relogio } from '../ports/infraestrutura';
import { publicarMensagem } from './publicar-mensagem';

/** As dependências que anunciar um fato no chat exige — nada além disso. */
export interface DependenciasAviso {
  mensagens: MensagemRepository;
  geradorId: GeradorId;
  relogio: Relogio;
  publicador: PublicadorEventosMesa;
}

/**
 * Escreve um aviso da plataforma no chat da mesa — "Rodada 2", "Thorin sofreu 7
 * de dano (23/30)" — e o transmite.
 *
 * ## Por que existe um lugar só para isto
 *
 * Três casos de uso de combate precisam anunciar um fato no chat, e a sequência é
 * sempre a mesma: montar a mensagem de sistema, gravar, mapear para DTO e
 * publicar **pelo `publicarMensagem`**, que é quem decide o alvo do broadcast. O
 * passo esquecível é o último: quem chamasse `publicador.mensagemNova` na mão
 * estaria reimplementando essa decisão, e o RV-070 já mostrou o preço de ter duas
 * opiniões sobre para quem uma mensagem vai.
 *
 * ## Por que a falha não interrompe quem chamou
 *
 * O aviso é **best-effort**: `Result` do domínio é ignorado de propósito. Passar o
 * turno é a operação de negócio; a linha no chat é o registro dela. Uma mensagem
 * longa demais (ou um nome estranho vindo do token) não pode fazer o turno não
 * passar depois de o agregado já ter sido gravado — seria uma falha de 400 numa
 * requisição que já mudou o estado do combate. É a mesma política do email de
 * convite em `.claude/rules/08-email.md`: efeito colateral não derruba o fato.
 */
export async function avisarNoChat(
  deps: DependenciasAviso,
  mesaId: string,
  conteudo: string,
): Promise<void> {
  const mensagem = Mensagem.criarSistema({
    id: deps.geradorId.gerar(),
    mesaId,
    conteudo,
    agora: deps.relogio.agora(),
  });
  if (!mensagem.ok) return;

  await deps.mensagens.salvar(mensagem.valor);
  publicarMensagem(deps.publicador, mensagem.valor, mensagemParaDTO(mensagem.valor));
}

/** Texto único da virada de rodada — o teste de contrato cita esta função. */
export function textoNovaRodada(rodada: number): string {
  return `Rodada ${rodada}`;
}

/**
 * Texto único do dano e da cura aplicados pelo painel (RV-065).
 *
 * O PV resultante entra entre parênteses porque é o que o card pede e porque é o
 * que torna a linha auditável depois: "sofreu 7 de dano" sozinho não diz se o
 * golpe foi absorvido por um teto, e o `(0/30)` mostra que parou no zero em vez de
 * ir a −7.
 */
export function textoAlteracaoPv(
  nome: string,
  delta: number,
  pvAtual: number,
  pvMax: number,
): string {
  const efeito = delta < 0 ? `sofreu ${Math.abs(delta)} de dano` : `recebeu ${delta} de cura`;
  return `${nome} ${efeito} (${pvAtual}/${pvMax})`;
}
