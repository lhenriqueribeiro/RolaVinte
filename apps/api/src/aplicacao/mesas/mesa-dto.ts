import type { MesaDTO } from '@rolavinte/shared';
import type { Mesa } from '../../dominio/mesas/mesa';

/**
 * Projeção única do agregado para o contrato de leitura. Fica num só lugar para
 * que um campo novo (ex.: `encerradaEm`) não precise ser lembrado em cada caso de uso.
 */
export function mesaParaDTO(
  mesa: Mesa,
  contexto: { usuarioId: string; mestreNome: string; totalJogadores?: number },
): MesaDTO {
  return {
    id: mesa.id,
    nome: mesa.nome,
    descricao: mesa.descricao,
    sistema: mesa.sistema,
    mestreId: mesa.mestreId,
    mestreNome: contexto.mestreNome,
    meuPapel: mesa.ehMestre(contexto.usuarioId) ? 'mestre' : 'jogador',
    totalJogadores: contexto.totalJogadores ?? mesa.participantes.length,
    criadoEm: mesa.criadoEm.toISOString(),
    encerradaEm: mesa.encerradaEm?.toISOString() ?? null,
  };
}
