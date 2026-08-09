import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type { Token } from '../../dominio/jogo/token';
import type { Mesa } from '../../dominio/mesas/mesa';
import type { CenaRepository, MesaRepository } from '../ports/repositorios';

export interface TokenComMesa {
  token: Token;
  mesa: Mesa;
}

/**
 * Carrega o token com a mesa dona e passa pela guarda de escrita do mestre.
 *
 * Gêmeo de `carregarCenaParaEscritaDoMestre`, e pela mesma razão: as escritas
 * de **propriedade** do token (renomear, recolorir, trocar a arte) são
 * privativas do mestre — o jogador move o token do próprio personagem, mas não
 * o edita (RV-040). Concentrar a sequência aqui impede que um caso de uso novo
 * nasça sem `autorizarEscritaDoMestre`, que é onde "só o mestre" e "mesa
 * encerrada" vivem juntos.
 *
 * Token de outra mesa cai como `nao-autorizado`: a mesa carregada é a dona da
 * cena do token, e o solicitante não é mestre dela.
 */
export async function carregarTokenParaEscritaDoMestre(
  cenas: CenaRepository,
  mesas: MesaRepository,
  usuarioId: string,
  tokenId: string,
  mensagemNegada: string,
): Promise<Result<TokenComMesa>> {
  const token = await cenas.buscarTokenPorId(tokenId);
  if (!token) return falha(ErroDominio.naoEncontrado('Token não encontrado.'));

  const cena = await cenas.buscarPorId(token.cenaId);
  if (!cena) return falha(ErroDominio.naoEncontrado('Cena não encontrada.'));

  const mesa = await mesas.buscarPorId(cena.mesaId);
  if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));

  const permitido = mesa.autorizarEscritaDoMestre(usuarioId, mensagemNegada);
  if (!permitido.ok) return falha(permitido.erro);

  return ok({ token, mesa });
}
