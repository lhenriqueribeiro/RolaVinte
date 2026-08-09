import type { SupabaseClient } from '@supabase/supabase-js';
import { TIPOS_MENSAGEM_PUBLICOS, type CursorMensagens, type MensagemDTO } from '@rolavinte/shared';
import type { MensagemRepository, PaginaHistorico } from '../../aplicacao/ports/repositorios';
import type { Mensagem } from '../../dominio/jogo/mensagem';
import { garantirSemErro } from './cliente';
import { mensagemParaRow, rowParaMensagemDTO, type RowMensagem } from './mensagem.mapper';

const COLUNAS =
  'id, mesa_id, autor_id, autor_nome, tipo, conteudo, rolagem, motivo, destinatario_id, destinatario_nome, criado_em';

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** ISO 8601 com fuso — o formato em que `criado_em` sai do Postgres. */
const INSTANTE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

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

/**
 * "Estritamente anterior ao cursor" na ordem `(criado_em desc, id desc)`
 * (RV-073) — a mesma ordem do `ORDER BY`, senão a janela não fecha.
 *
 * `criado_em.lt` sozinho engoliria as mensagens empatadas no instante do
 * cursor; `lte` as repetiria na página seguinte. O empate é resolvido pelo par:
 * instante menor, **ou** mesmo instante com id menor.
 */
function filtroAnterioresAoCursor(cursor: CursorMensagens): string {
  return `criado_em.lt.${cursor.antesDe},and(criado_em.eq.${cursor.antesDe},id.lt.${cursor.antesDeId})`;
}

/**
 * Visibilidade **e** cursor num único parâmetro `or`.
 *
 * Poderiam ser dois `.or()` encadeados — o supabase-js faz `append`, e o
 * PostgREST combina parâmetros repetidos com `AND`. Não fazemos isso de
 * propósito: privacidade que depende de como uma dependência trata chave
 * duplicada é defesa que ninguém consegue apontar no código (F1 da taxonomia de
 * falhas). Uma expressão só, `and(or(visibilidade), or(anteriores))`, é lida
 * pelo PostgREST como uma árvore explícita e não tem esse "depende".
 */
function filtroDoHistorico(solicitanteId: string, cursor: CursorMensagens | null): string {
  const visibilidade = filtroVisibilidade(solicitanteId);
  if (!cursor) return visibilidade;
  return `and(or(${visibilidade}),or(${filtroAnterioresAoCursor(cursor)}))`;
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
    pagina: PaginaHistorico,
  ): Promise<MensagemDTO[]> {
    // Tudo o que entra na string de `or()` é validado antes: um valor com
    // vírgula ou parêntese reescreveria a expressão inteira e derrubaria o
    // filtro de privacidade. Ids são UUID v4 gerados por nós e o cursor é um
    // par que saiu daqui, então isto é estado impossível — exceção, não
    // `Result` (regra de erros de `.claude/rules/01-arquitetura.md`).
    if (!UUID.test(solicitanteId)) {
      throw new Error('listar mensagens: identificador do solicitante fora do formato UUID.');
    }
    const cursor = pagina.antesDe;
    if (cursor && (!UUID.test(cursor.antesDeId) || !INSTANTE_ISO.test(cursor.antesDe))) {
      throw new Error('listar mensagens: cursor fora do formato (instante ISO + UUID).');
    }

    const { data, error } = await this.sb
      .from('mensagens')
      .select(COLUNAS)
      .eq('mesa_id', mesaId)
      .or(filtroDoHistorico(solicitanteId, cursor))
      // O desempate por id acompanha o cursor: sem ele o Postgres pode devolver
      // duas mensagens do mesmo instante em qualquer ordem, e a mesma linha cai
      // em duas páginas.
      .order('criado_em', { ascending: false })
      .order('id', { ascending: false })
      .limit(pagina.limite);
    garantirSemErro('listar mensagens', error);
    return ((data ?? []) as RowMensagem[]).map(rowParaMensagemDTO).reverse();
  }
}
