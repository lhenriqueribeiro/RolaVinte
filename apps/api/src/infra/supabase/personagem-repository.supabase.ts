import type { SupabaseClient } from '@supabase/supabase-js';
import type { PersonagemDTO } from '@rolavinte/shared';
import type { PersonagemRepository } from '../../aplicacao/ports/repositorios';
import type { Personagem } from '../../dominio/personagens/personagem';
import { garantirSemErro } from './cliente';
import { personagemParaRow, rowParaPersonagem, type RowPersonagem } from './personagem.mapper';

const COLUNAS = 'id, mesa_id, dono_id, nome, classe, nivel, pv_atual, pv_max, atributos, anotacoes';

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

  async listarDaMesa(mesaId: string): Promise<PersonagemDTO[]> {
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
    }));
  }
}
