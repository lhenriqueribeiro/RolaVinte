import type { MensagemDTO } from '@rolavinte/shared';
import { mensagemParaDTO } from '../../aplicacao/mapeadores';
import type { MensagemRepository } from '../../aplicacao/ports/repositorios';
import type { Mensagem } from '../../dominio/jogo/mensagem';

/**
 * Fake em memória de `MensagemRepository`.
 *
 * Guarda o read model já mapeado: a port só expõe leitura por DTO, como o
 * adapter Supabase.
 */
export class FakeMensagemRepository implements MensagemRepository {
  private readonly registros: MensagemDTO[] = [];

  async salvar(mensagem: Mensagem): Promise<void> {
    this.registros.push(mensagemParaDTO(mensagem));
  }

  async listarDaMesa(mesaId: string, limite: number): Promise<MensagemDTO[]> {
    return this.registros
      .filter((m) => m.mesaId === mesaId)
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
