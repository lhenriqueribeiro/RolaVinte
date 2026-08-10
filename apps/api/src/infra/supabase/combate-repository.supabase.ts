import type { SupabaseClient } from '@supabase/supabase-js';
import type { CombateRepository } from '../../aplicacao/ports/repositorios';
import type { Combate } from '../../dominio/jogo/combate';
import { garantirSemErro } from './cliente';
import {
  combateParaRows,
  COLUNAS_COMBATE,
  COLUNAS_COMBATE_PARTICIPANTE,
  rowsParaCombate,
  type RowCombate,
  type RowCombateParticipante,
} from './combate.mapper';

export class SupabaseCombateRepository implements CombateRepository {
  constructor(private readonly sb: SupabaseClient) {}

  /**
   * Persiste o agregado inteiro.
   *
   * A ordem das três operações não é arbitrária:
   *
   * 1. `upsert` em `combates` primeiro — `combate_participantes.combate_id` é FK,
   *    então a linha do combate tem de existir antes dos filhos na primeira gravação;
   * 2. `delete` dos participantes que não estão mais no agregado — **é esta
   *    operação que o fake não pode provar** (ele regrava a lista inteira por
   *    construção, F3 da taxonomia): sem ela, remover alguém do combate deixaria a
   *    linha no banco e ele voltaria na próxima leitura, como aconteceu com
   *    `mesa_jogadores` na v0.3.0;
   * 3. `upsert` dos que ficaram, com a iniciativa e o desempate atuais.
   *
   * O delete vem **antes** do upsert para que um token removido e readicionado na
   * mesma sessão não dispute o índice único `(combate_id, ordem_desempate)` com a
   * própria linha antiga.
   */
  async salvar(combate: Combate): Promise<void> {
    const rows = combateParaRows(combate);

    const { error: erroCombate } = await this.sb.from('combates').upsert(rows.combate);
    garantirSemErro('salvar combate', erroCombate);

    await this.removerParticipantesAusentes(
      combate.id,
      rows.participantes.map((p) => p.token_id),
    );

    if (rows.participantes.length > 0) {
      const { error } = await this.sb.from('combate_participantes').upsert(rows.participantes);
      garantirSemErro('salvar participantes do combate', error);
    }
  }

  /** Apaga as participações que não existem mais no agregado. */
  private async removerParticipantesAusentes(
    combateId: string,
    tokenIds: readonly string[],
  ): Promise<void> {
    const exclusao = this.sb.from('combate_participantes').delete().eq('combate_id', combateId);
    // PostgREST não tem `notIn` no builder: a lista vai como filtro literal, como
    // em `SupabaseMesaRepository`. Lista vazia = o combate ficou sem ninguém, e o
    // delete sem filtro extra é exatamente o que se quer.
    const { error } =
      tokenIds.length > 0
        ? await exclusao.not('token_id', 'in', `(${tokenIds.map((id) => `"${id}"`).join(',')})`)
        : await exclusao;
    garantirSemErro('sincronizar participantes do combate', error);
  }

  async buscarPorId(id: string): Promise<Combate | null> {
    const { data, error } = await this.sb
      .from('combates')
      .select(COLUNAS_COMBATE)
      .eq('id', id)
      .maybeSingle();
    garantirSemErro('buscar combate', error);
    if (!data) return null;
    return this.montarAgregado(data as RowCombate);
  }

  async buscarAtivoDaMesa(mesaId: string): Promise<Combate | null> {
    const { data, error } = await this.sb
      .from('combates')
      .select(COLUNAS_COMBATE)
      .eq('mesa_id', mesaId)
      .eq('ativo', true)
      .maybeSingle();
    // `maybeSingle` e não `limit(1)`: o índice único parcial da `0012` garante no
    // máximo um ativo por mesa, então mais de uma linha aqui é corrupção de dados
    // e tem de estourar, não ser escondida por um "pega o primeiro".
    garantirSemErro('buscar combate ativo da mesa', error);
    if (!data) return null;
    return this.montarAgregado(data as RowCombate);
  }

  private async montarAgregado(combate: RowCombate): Promise<Combate> {
    const { data, error } = await this.sb
      .from('combate_participantes')
      .select(COLUNAS_COMBATE_PARTICIPANTE)
      .eq('combate_id', combate.id);
    garantirSemErro('carregar participantes do combate', error);
    return rowsParaCombate(combate, (data ?? []) as RowCombateParticipante[]);
  }
}
