import type { SupabaseClient } from '@supabase/supabase-js';
import type { CenaRepository } from '../../aplicacao/ports/repositorios';
import type { Cena } from '../../dominio/jogo/cena';
import type { Token } from '../../dominio/jogo/token';
import { garantirSemErro } from './cliente';
import {
  cenaParaRow,
  rowParaCena,
  rowParaToken,
  tokenParaRow,
  type RowCena,
  type RowToken,
} from './cena.mapper';

const COLUNAS_CENA =
  'id, mesa_id, nome, largura_grid, altura_grid, cor_fundo, ativa, imagem_fundo_url, imagem_fundo_caminho, tamanho_celula, grid_visivel, cor_grid';
const COLUNAS_TOKEN = 'id, cena_id, nome, cor, x, y, personagem_id, imagem_url, imagem_caminho';

export class SupabaseCenaRepository implements CenaRepository {
  constructor(private readonly sb: SupabaseClient) {}

  async salvar(cena: Cena): Promise<void> {
    const { error } = await this.sb.from('cenas').upsert(cenaParaRow(cena));
    garantirSemErro('salvar cena', error);
  }

  async buscarPorId(id: string): Promise<Cena | null> {
    const { data, error } = await this.sb
      .from('cenas')
      .select(COLUNAS_CENA)
      .eq('id', id)
      .maybeSingle();
    garantirSemErro('buscar cena', error);
    return data ? rowParaCena(data as RowCena) : null;
  }

  async buscarAtivaDaMesa(mesaId: string): Promise<Cena | null> {
    const { data, error } = await this.sb
      .from('cenas')
      .select(COLUNAS_CENA)
      .eq('mesa_id', mesaId)
      .eq('ativa', true)
      .limit(1)
      .maybeSingle();
    garantirSemErro('buscar cena ativa', error);
    return data ? rowParaCena(data as RowCena) : null;
  }

  async listarDaMesa(mesaId: string): Promise<Cena[]> {
    const { data, error } = await this.sb
      .from('cenas')
      .select(COLUNAS_CENA)
      .eq('mesa_id', mesaId)
      .order('criado_em', { ascending: true });
    garantirSemErro('listar cenas da mesa', error);
    return ((data ?? []) as RowCena[]).map(rowParaCena);
  }

  async desativarTodasDaMesa(mesaId: string): Promise<void> {
    const { error } = await this.sb.from('cenas').update({ ativa: false }).eq('mesa_id', mesaId);
    garantirSemErro('desativar cenas', error);
  }

  /** Os tokens da cena vão junto pelo `on delete cascade` da migration inicial. */
  async remover(cenaId: string): Promise<void> {
    const { error } = await this.sb.from('cenas').delete().eq('id', cenaId);
    garantirSemErro('remover cena', error);
  }

  async salvarToken(token: Token): Promise<void> {
    const { error } = await this.sb.from('tokens').upsert(tokenParaRow(token));
    garantirSemErro('salvar token', error);
  }

  async buscarTokenPorId(id: string): Promise<Token | null> {
    const { data, error } = await this.sb
      .from('tokens')
      .select(COLUNAS_TOKEN)
      .eq('id', id)
      .maybeSingle();
    garantirSemErro('buscar token', error);
    return data ? rowParaToken(data as RowToken) : null;
  }

  async removerToken(id: string): Promise<void> {
    const { error } = await this.sb.from('tokens').delete().eq('id', id);
    garantirSemErro('remover token', error);
  }

  async listarTokensDaCena(cenaId: string): Promise<Token[]> {
    const { data, error } = await this.sb
      .from('tokens')
      .select(COLUNAS_TOKEN)
      .eq('cena_id', cenaId);
    garantirSemErro('listar tokens', error);
    return ((data ?? []) as RowToken[]).map(rowParaToken);
  }
}
