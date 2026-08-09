import { mensagemVisivelPara, type MensagemDTO } from '@rolavinte/shared';
import { mensagemParaDTO } from '../../aplicacao/mapeadores';
import type { MensagemRepository } from '../../aplicacao/ports/repositorios';
import type { Mensagem } from '../../dominio/jogo/mensagem';

/**
 * Fake em memória de `MensagemRepository`.
 *
 * Guarda o read model já mapeado: a port só expõe leitura por DTO, como o
 * adapter Supabase.
 *
 * O filtro de visibilidade (RV-070/RV-071) usa `mensagemVisivelPara`, o **mesmo**
 * predicado de `@rolavinte/shared` de onde sai a lista de tipos públicos da
 * consulta PostgREST. Reescrevê-lo aqui à mão seria plantar um fake generoso: a
 * suíte ficaria verde com o adapter real vazando (F3 da taxonomia).
 */
export class FakeMensagemRepository implements MensagemRepository {
  private readonly registros: MensagemDTO[] = [];

  async salvar(mensagem: Mensagem): Promise<void> {
    this.registros.push(mensagemParaDTO(mensagem));
  }

  async listarDaMesa(
    mesaId: string,
    solicitanteId: string,
    limite: number,
  ): Promise<MensagemDTO[]> {
    return this.registros
      .filter((m) => m.mesaId === mesaId)
      .filter((m) => mensagemVisivelPara(m, solicitanteId))
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
      .slice(0, limite)
      .reverse()
      .map((m) => ({ ...m }));
  }

  /** Apoio a testes: tudo o que foi persistido, em ordem de inserção. */
  get salvas(): readonly MensagemDTO[] {
    return this.registros;
  }
}
