import type { CombateDTO } from '@rolavinte/shared';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type { CombateRepository, MesaRepository } from '../ports/repositorios';
import type { PublicadorEventosMesa } from '../ports/infraestrutura';
import { carregarCombateParaEscritaDoMestre } from './acesso-combate';
import { combateParaDTO } from './combate-dto';

export const APENAS_MESTRE_ENCERRA_COMBATE = 'Apenas o mestre pode encerrar o combate.';

/**
 * Encerra a luta e libera a mesa para a próxima (RV-062).
 *
 * O combate **não é apagado**: vira `ativo = false` e continua no banco como
 * histórico da sessão — a mesma política dos convites revogados (RV-020). É isso
 * que faz "encerrei e comecei outro" funcionar sem perder o registro do que
 * aconteceu, e é por isso que `CombateRepository` não tem `remover`.
 *
 * O `combate:atualizado` é publicado **mesmo encerrando**, com `ativo: false`: é o
 * que esvazia o painel de todo mundo na hora. Sem ele, os jogadores continuariam
 * vendo a ordem de iniciativa de uma luta que terminou até dar F5 — exatamente o
 * defeito F2 que o `mesa:participante-removido` produziu na v0.3.0.
 */
export class EncerrarCombate {
  constructor(
    private readonly combates: CombateRepository,
    private readonly mesas: MesaRepository,
    private readonly publicador: PublicadorEventosMesa,
  ) {}

  async executar(usuarioId: string, combateId: string): Promise<Result<CombateDTO>> {
    const acesso = await carregarCombateParaEscritaDoMestre(
      this.combates,
      this.mesas,
      usuarioId,
      combateId,
      APENAS_MESTRE_ENCERRA_COMBATE,
    );
    if (!acesso.ok) return falha(acesso.erro);
    const { combate, mesa } = acesso.valor;

    // Encerrar duas vezes é `conflito` → 409, e a regra é do agregado.
    const encerrado = combate.encerrar();
    if (!encerrado.ok) return falha(encerrado.erro);

    await this.combates.salvar(combate);
    const dto = combateParaDTO(combate);
    this.publicador.combateAtualizado(mesa.id, dto);
    return ok(dto);
  }
}
