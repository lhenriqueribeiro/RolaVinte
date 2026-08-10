import type { CombateDTO } from '@rolavinte/shared';
import type { Combate } from '../../dominio/jogo/combate';

/**
 * Agregado → `CombateDTO`.
 *
 * Fica em arquivo próprio, e não em `aplicacao/mapeadores.ts`, para que os quatro
 * casos de uso de combate e a leitura compartilhem **uma** montagem: se cada um
 * montasse o seu, o `tokenIdDoTurno` sairia certo em três e esquecido no quarto.
 *
 * `ordemDesempate` não sai: é a mecânica que garante a ordem estável no servidor,
 * e expô-la convidaria o cliente a reordenar por conta própria. A lista já vem
 * ordenada por `combate.participantes` — é para ser renderizada como veio.
 */
export function combateParaDTO(combate: Combate): CombateDTO {
  return {
    id: combate.id,
    mesaId: combate.mesaId,
    cenaId: combate.cenaId,
    rodada: combate.rodada,
    indiceTurno: combate.indiceTurno,
    ativo: combate.ativo,
    participantes: combate.participantes.map((p) => ({
      tokenId: p.tokenId,
      nome: p.nome,
      iniciativa: p.iniciativa,
    })),
    // Derivado aqui, e uma vez só: o realce da peça no mapa não depende de o
    // cliente repetir a indexação — nem de ele acertá-la.
    tokenIdDoTurno: combate.participanteDoTurno?.tokenId ?? null,
  };
}
