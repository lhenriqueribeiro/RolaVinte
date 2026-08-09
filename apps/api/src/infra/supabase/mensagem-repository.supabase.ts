import type { SupabaseClient } from '@supabase/supabase-js';
import type { MensagemDTO } from '@rolavinte/shared';
import type { MensagemRepository } from '../../aplicacao/ports/repositorios';
import type { Mensagem } from '../../dominio/jogo/mensagem';
import { garantirSemErro } from './cliente';
import { mensagemParaRow, rowParaMensagemDTO, type RowMensagem } from './mensagem.mapper';

const COLUNAS = 'id, mesa_id, autor_id, autor_nome, tipo, conteudo, rolagem, motivo, criado_em';

export class SupabaseMensagemRepository implements MensagemRepository {
  constructor(private readonly sb: SupabaseClient) {}

  async salvar(mensagem: Mensagem): Promise<void> {
    const { error } = await this.sb.from('mensagens').insert(mensagemParaRow(mensagem));
    garantirSemErro('salvar mensagem', error);
  }

  async listarDaMesa(mesaId: string, limite: number): Promise<MensagemDTO[]> {
    const { data, error } = await this.sb
      .from('mensagens')
      .select(COLUNAS)
      .eq('mesa_id', mesaId)
      .order('criado_em', { ascending: false })
      .limit(limite);
    garantirSemErro('listar mensagens', error);
    return ((data ?? []) as RowMensagem[]).map(rowParaMensagemDTO).reverse();
  }
}
