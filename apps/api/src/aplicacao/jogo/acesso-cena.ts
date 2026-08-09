import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type { Cena } from '../../dominio/jogo/cena';
import type { Mesa } from '../../dominio/mesas/mesa';
import type { CenaRepository, MesaRepository } from '../ports/repositorios';

export interface CenaComMesa {
  cena: Cena;
  mesa: Mesa;
}

/**
 * Carrega a cena com a mesa dona e passa pela guarda de escrita do mestre.
 *
 * Existe para que os quatro casos de uso de escrita em cena (ativar, atualizar,
 * remover, definir fundo) não repitam a sequência — e, principalmente, para que
 * nenhum deles esqueça `autorizarEscritaDoMestre`, que é onde "só o mestre" e
 * "mesa encerrada" vivem juntos.
 *
 * Cena de outra mesa cai aqui como `nao-autorizado`: a mesa carregada é a dona
 * da cena, e o solicitante não é mestre dela.
 */
export async function carregarCenaParaEscritaDoMestre(
  cenas: CenaRepository,
  mesas: MesaRepository,
  usuarioId: string,
  cenaId: string,
  mensagemNegada: string,
): Promise<Result<CenaComMesa>> {
  const cena = await cenas.buscarPorId(cenaId);
  if (!cena) return falha(ErroDominio.naoEncontrado('Cena não encontrada.'));

  const mesa = await mesas.buscarPorId(cena.mesaId);
  if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));

  const permitido = mesa.autorizarEscritaDoMestre(usuarioId, mensagemNegada);
  if (!permitido.ok) return falha(permitido.erro);

  return ok({ cena, mesa });
}
