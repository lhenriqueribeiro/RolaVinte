import { mensagemVisivelPara, type MensagemDTO } from '@rolavinte/shared';
import { mensagemParaDTO } from '../../aplicacao/mapeadores';
import type { MensagemRepository, PaginaHistorico } from '../../aplicacao/ports/repositorios';
import type { Mensagem } from '../../dominio/jogo/mensagem';

/** Posição na ordem `(criadoEm, id)` — a mesma do `ORDER BY` do adapter (RV-073). */
function compararPosicao(
  a: { criadoEm: string; id: string },
  b: { criadoEm: string; id: string },
): number {
  const instante = Date.parse(a.criadoEm) - Date.parse(b.criadoEm);
  return instante !== 0 ? instante : a.id.localeCompare(b.id);
}

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
    pagina: PaginaHistorico,
  ): Promise<MensagemDTO[]> {
    const cursor = pagina.antesDe;
    return (
      this.registros
        .filter((m) => m.mesaId === mesaId)
        .filter((m) => mensagemVisivelPara(m, solicitanteId))
        // A janela é recortada depois do filtro, como no adapter: o cursor anda
        // sobre o histórico que o solicitante enxerga, não sobre o bolo inteiro.
        .filter(
          (m) =>
            cursor === null ||
            compararPosicao(m, { criadoEm: cursor.antesDe, id: cursor.antesDeId }) < 0,
        )
        .sort((a, b) => compararPosicao(b, a))
        .slice(0, pagina.limite)
        .reverse()
        .map((m) => ({ ...m }))
    );
  }

  /** Apoio a testes: tudo o que foi persistido, em ordem de inserção. */
  get salvas(): readonly MensagemDTO[] {
    return this.registros;
  }
}
