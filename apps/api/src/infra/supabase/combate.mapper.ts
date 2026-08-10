import { Combate, type ParticipanteCombate } from '../../dominio/jogo/combate';

export interface RowCombate {
  id: string;
  mesa_id: string;
  cena_id: string;
  rodada: number;
  indice_turno: number;
  ativo: boolean;
  criado_em: string;
}

export interface RowCombateParticipante {
  combate_id: string;
  token_id: string;
  nome: string;
  /** `null` = ainda não rolou (migration `0012`). */
  iniciativa: number | null;
  ordem_desempate: number;
}

/** Colunas de `combates` — nunca `select('*')` em produção. */
export const COLUNAS_COMBATE = 'id, mesa_id, cena_id, rodada, indice_turno, ativo, criado_em';

export const COLUNAS_COMBATE_PARTICIPANTE =
  'combate_id, token_id, nome, iniciativa, ordem_desempate';

/**
 * Row + filhos → agregado.
 *
 * Não ordena aqui de propósito: `Combate.reconstituir` **é** quem aplica a ordem
 * canônica e reposiciona o turno. Ordenar no mapper daria a impressão de que a
 * ordem é responsabilidade da infraestrutura, e um `order by` esquecido numa
 * consulta futura passaria a mudar o comportamento do painel.
 */
export function rowsParaCombate(
  combate: RowCombate,
  participantes: readonly RowCombateParticipante[],
): Combate {
  const lista: ParticipanteCombate[] = participantes.map((p) => ({
    tokenId: p.token_id,
    nome: p.nome,
    iniciativa: p.iniciativa,
    ordemDesempate: p.ordem_desempate,
  }));
  return Combate.reconstituir({
    id: combate.id,
    mesaId: combate.mesa_id,
    cenaId: combate.cena_id,
    rodada: combate.rodada,
    indiceTurno: combate.indice_turno,
    ativo: combate.ativo,
    participantes: lista,
  });
}

/**
 * Agregado → rows. `criado_em` fica de fora: o `default now()` do banco é a
 * verdade sobre quando o combate começou, e o agregado não guarda esse instante.
 */
export function combateParaRows(combate: Combate): {
  combate: Omit<RowCombate, 'criado_em'>;
  participantes: RowCombateParticipante[];
} {
  return {
    combate: {
      id: combate.id,
      mesa_id: combate.mesaId,
      cena_id: combate.cenaId,
      rodada: combate.rodada,
      indice_turno: combate.indiceTurno,
      ativo: combate.ativo,
    },
    participantes: combate.participantes.map((p) => ({
      combate_id: combate.id,
      token_id: p.tokenId,
      nome: p.nome,
      iniciativa: p.iniciativa,
      ordem_desempate: p.ordemDesempate,
    })),
  };
}
