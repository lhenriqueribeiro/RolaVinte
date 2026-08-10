import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type { Combate } from '../../dominio/jogo/combate';
import type { Mesa } from '../../dominio/mesas/mesa';
import type { CombateRepository, MesaRepository } from '../ports/repositorios';

export interface CombateComMesa {
  combate: Combate;
  mesa: Mesa;
}

/**
 * Carrega o combate com a mesa dona e passa pela guarda de escrita do mestre.
 *
 * Gêmeo de `carregarCenaParaEscritaDoMestre` e de
 * `carregarTokenParaEscritaDoMestre`, e pela mesma razão: as três escritas do
 * combate (passar turno, encerrar, aplicar dano) são privativas do mestre, e a
 * decisão de quem passa o turno foi tomada no RV-062 para **evitar corrida entre
 * dois clientes** — dois jogadores clicando "próximo" ao mesmo tempo avançariam
 * dois turnos.
 *
 * Concentrar a sequência aqui é o que impede um caso de uso novo de nascer sem
 * `autorizarEscritaDoMestre`, que é onde "só o mestre" e "mesa encerrada" vivem
 * juntas (F5 da taxonomia). Reimplementar `ehMestre` + `if (mesa.encerrada)` à mão
 * já furou neste projeto.
 *
 * Combate de outra mesa cai como `nao-autorizado`: a mesa carregada é a dona do
 * combate, e o solicitante não é mestre dela.
 */
export async function carregarCombateParaEscritaDoMestre(
  combates: CombateRepository,
  mesas: MesaRepository,
  usuarioId: string,
  combateId: string,
  mensagemNegada: string,
): Promise<Result<CombateComMesa>> {
  const combate = await combates.buscarPorId(combateId);
  if (!combate) return falha(ErroDominio.naoEncontrado('Combate não encontrado.'));

  const mesa = await mesas.buscarPorId(combate.mesaId);
  if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));

  const permitido = mesa.autorizarEscritaDoMestre(usuarioId, mensagemNegada);
  if (!permitido.ok) return falha(permitido.erro);

  return ok({ combate, mesa });
}
