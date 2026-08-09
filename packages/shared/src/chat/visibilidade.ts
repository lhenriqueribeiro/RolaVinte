import type { TipoMensagem } from '../tipos/dtos';

/**
 * Quem pode ver cada mensagem (RV-070, RV-071).
 *
 * Isto **não** é apresentação. Sussurro e rolagem oculta não podem sair do
 * servidor para quem não é destinatário — nem no broadcast, nem no histórico.
 * Filtrar no cliente seria o mesmo que não filtrar (F4 da taxonomia de falhas).
 * A regra mora aqui, num único lugar, e é consumida pelo agregado `Mensagem`, pelo
 * caso de uso de listagem e pelo repositório que monta a consulta ao Postgres.
 */

/**
 * `true` = mensagem restrita a autor/destinatário.
 *
 * `Record<TipoMensagem, boolean>` de propósito: um tipo novo de mensagem **para
 * de compilar** aqui até alguém decidir se ele é público ou privado. Uma lista
 * solta de tipos privados deixaria o tipo novo público por omissão — e o
 * esquecimento seria um vazamento, não um bug cosmético.
 */
const RESTRICAO_POR_TIPO: Record<TipoMensagem, boolean> = {
  fala: false,
  rolagem: false,
  sistema: false,
  sussurro: true,
  'rolagem-oculta': true,
};

/** Tipos que todo participante da mesa enxerga — derivados do mapa acima. */
export const TIPOS_MENSAGEM_PUBLICOS: readonly TipoMensagem[] = Object.freeze(
  (Object.keys(RESTRICAO_POR_TIPO) as TipoMensagem[]).filter((t) => !RESTRICAO_POR_TIPO[t]),
);

/** Tipos que só chegam a autor e destinatário. */
export const TIPOS_MENSAGEM_RESTRITOS: readonly TipoMensagem[] = Object.freeze(
  (Object.keys(RESTRICAO_POR_TIPO) as TipoMensagem[]).filter((t) => RESTRICAO_POR_TIPO[t]),
);

export function mensagemEhRestrita(tipo: TipoMensagem): boolean {
  return RESTRICAO_POR_TIPO[tipo];
}

/** O mínimo de uma mensagem para decidir visibilidade — serve entidade e row. */
export interface VisibilidadeMensagem {
  tipo: TipoMensagem;
  autorId: string | null;
  destinatarioId: string | null;
}

export function mensagemVisivelPara(mensagem: VisibilidadeMensagem, usuarioId: string): boolean {
  if (!mensagemEhRestrita(mensagem.tipo)) return true;
  return mensagem.autorId === usuarioId || mensagem.destinatarioId === usuarioId;
}
