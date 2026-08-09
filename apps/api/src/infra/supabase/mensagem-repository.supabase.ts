import type { SupabaseClient } from '@supabase/supabase-js';
import { TIPOS_MENSAGEM_PUBLICOS, type MensagemDTO } from '@rolavinte/shared';
import type { MensagemRepository } from '../../aplicacao/ports/repositorios';
import type { Mensagem } from '../../dominio/jogo/mensagem';
import { garantirSemErro } from './cliente';
import { mensagemParaRow, rowParaMensagemDTO, type RowMensagem } from './mensagem.mapper';

const COLUNAS =
  'id, mesa_id, autor_id, autor_nome, tipo, conteudo, rolagem, motivo, destinatario_id, destinatario_nome, criado_em';

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Filtro de visibilidade do histórico (RV-070/RV-071), em PostgREST.
 *
 * Lê-se: "é de um tipo público **ou** eu sou o autor **ou** eu sou o
 * destinatário". A lista de tipos públicos vem de `@rolavinte/shared`, derivada
 * do mesmo `Record` que o domínio usa — um tipo de mensagem novo entra aqui
 * como restrito por omissão, que é o lado seguro de errar.
 *
 * O filtro é aplicado **antes** do `limit`: fosse depois, o solicitante receberia
 * menos de 100 mensagens porque parte do bolo seria segredo alheio.
 */
function filtroVisibilidade(solicitanteId: string): string {
  const publicos = TIPOS_MENSAGEM_PUBLICOS.join(',');
  return `tipo.in.(${publicos}),autor_id.eq.${solicitanteId},destinatario_id.eq.${solicitanteId}`;
}

export class SupabaseMensagemRepository implements MensagemRepository {
  constructor(private readonly sb: SupabaseClient) {}

  async salvar(mensagem: Mensagem): Promise<void> {
    const { error } = await this.sb.from('mensagens').insert(mensagemParaRow(mensagem));
    garantirSemErro('salvar mensagem', error);
  }

  async listarDaMesa(
    mesaId: string,
    solicitanteId: string,
    limite: number,
  ): Promise<MensagemDTO[]> {
    // `or()` recebe uma string de filtro: um id com vírgula ou parêntese
    // reescreveria a expressão inteira e derrubaria o filtro de privacidade.
    // Os ids são UUID v4 gerados por nós, então isto é estado impossível —
    // exceção, não `Result` (regra de erros de `.claude/rules/01-arquitetura.md`).
    if (!UUID.test(solicitanteId)) {
      throw new Error('listar mensagens: identificador do solicitante fora do formato UUID.');
    }

    const { data, error } = await this.sb
      .from('mensagens')
      .select(COLUNAS)
      .eq('mesa_id', mesaId)
      .or(filtroVisibilidade(solicitanteId))
      .order('criado_em', { ascending: false })
      .limit(limite);
    garantirSemErro('listar mensagens', error);
    return ((data ?? []) as RowMensagem[]).map(rowParaMensagemDTO).reverse();
  }
}
