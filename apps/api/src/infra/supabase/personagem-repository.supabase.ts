import type { SupabaseClient } from '@supabase/supabase-js';
import type { PersonagemDaMesaDTO } from '@rolavinte/shared';
import type { PersonagemRepository } from '../../aplicacao/ports/repositorios';
import type { Personagem } from '../../dominio/personagens/personagem';
import { garantirSemErro } from './cliente';
import { personagemParaRow, rowParaPersonagem, type RowPersonagem } from './personagem.mapper';

const COLUNAS =
  'id, mesa_id, dono_id, nome, classe, nivel, pv_atual, pv_max, atributos, anotacoes, dados';

export class SupabasePersonagemRepository implements PersonagemRepository {
  constructor(private readonly sb: SupabaseClient) {}

  async salvar(personagem: Personagem): Promise<void> {
    const { error } = await this.sb.from('personagens').upsert(personagemParaRow(personagem));
    garantirSemErro('salvar personagem', error);
  }

  async buscarPorId(id: string): Promise<Personagem | null> {
    const { data, error } = await this.sb
      .from('personagens')
      .select(COLUNAS)
      .eq('id', id)
      .maybeSingle();
    garantirSemErro('buscar personagem', error);
    return data ? rowParaPersonagem(data as RowPersonagem) : null;
  }

  /**
   * Exclusão da ficha (RV-093).
   *
   * `tokens.personagem_id` é `on delete set null` desde a migration 0001: as
   * peças que apontavam para esta ficha **continuam no mapa**, desvinculadas.
   * É o comportamento que o card pede, e vem do banco — não há nada para o
   * repositório limpar depois. Também não há arquivo em Storage associado a um
   * personagem (F7 da taxonomia): a arte pertence ao token, não à ficha.
   */
  async remover(id: string): Promise<void> {
    const { error } = await this.sb.from('personagens').delete().eq('id', id);
    garantirSemErro('remover personagem', error);
  }

  async listarDaMesa(mesaId: string): Promise<PersonagemDaMesaDTO[]> {
    const { data, error } = await this.sb
      .from('personagens')
      .select(`${COLUNAS}, usuarios(nome)`)
      .eq('mesa_id', mesaId)
      .order('nome');
    garantirSemErro('listar personagens', error);
    const rows = (data ?? []) as unknown as (RowPersonagem & {
      usuarios: { nome: string } | null;
    })[];
    return rows.map((r) => ({
      id: r.id,
      mesaId: r.mesa_id,
      donoId: r.dono_id,
      donoNome: r.usuarios?.nome ?? 'Jogador',
      nome: r.nome,
      classe: r.classe,
      nivel: r.nivel,
      pvAtual: r.pv_atual,
      pvMax: r.pv_max,
      atributos: r.atributos,
      anotacoes: r.anotacoes,
      dados: rowParaPersonagem(r).dados,
    }));
  }
}
