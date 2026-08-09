import type { MensagemDTO } from '@rolavinte/shared';
import type { Mensagem } from '../../dominio/jogo/mensagem';
import type { PublicadorEventosMesa } from '../ports/infraestrutura';

/**
 * Único ponto que decide **para quem** uma mensagem recém-criada é transmitida.
 *
 * Existe para que nenhum caso de uso futuro escolha o publicador na mão e
 * transmita um sussurro para a sala inteira: quem cria mensagem chama isto, e o
 * tipo da mensagem decide o alvo. É a mesma lição do `autorizarEscritaDo…` do
 * agregado `Mesa` — regra com um dono só, em vez de uma cópia por caso de uso.
 */
export function publicarMensagem(
  publicador: PublicadorEventosMesa,
  mensagem: Mensagem,
  dto: MensagemDTO,
): void {
  if (!mensagem.restrita) {
    publicador.mensagemNova(mensagem.mesaId, dto);
    return;
  }
  const alvos = mensagem.destinatariosPrivados;
  // Restrita sem alvo não vai para lugar nenhum — falha fechada, de propósito.
  if (alvos.length === 0) return;
  publicador.mensagemPrivada(mensagem.mesaId, alvos, dto);
}
