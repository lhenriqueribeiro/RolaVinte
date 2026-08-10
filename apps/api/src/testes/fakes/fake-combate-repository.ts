import type { CombateRepository } from '../../aplicacao/ports/repositorios';
import { Combate, type ParticipanteCombate } from '../../dominio/jogo/combate';

interface RegistroCombate {
  id: string;
  mesaId: string;
  cenaId: string;
  rodada: number;
  indiceTurno: number;
  ativo: boolean;
  participantes: ParticipanteCombate[];
}

/**
 * Fake em memória de `CombateRepository`.
 *
 * Ele regrava o agregado inteiro a cada `salvar`, então **não prova nada** sobre
 * a sincronização de participantes do adapter real — essa metade é medida em
 * `infra/supabase/combate-repository.supabase.test.ts` (F3 da taxonomia).
 *
 * O que ele imita de propósito é a **volta pelo banco**: guarda cópias planas e
 * reconstitui pelo `Combate.reconstituir`, com as linhas em ordem **invertida**.
 * Assim, um caso de uso que só funcionasse porque a instância em memória já
 * estava ordenada fica exposto, e a ordenação na reconstituição é exercitada em
 * toda leitura de teste — não apenas contra o Postgres.
 */
export class FakeCombateRepository implements CombateRepository {
  private readonly combates = new Map<string, RegistroCombate>();

  async salvar(combate: Combate): Promise<void> {
    this.combates.set(combate.id, {
      id: combate.id,
      mesaId: combate.mesaId,
      cenaId: combate.cenaId,
      rodada: combate.rodada,
      indiceTurno: combate.indiceTurno,
      ativo: combate.ativo,
      participantes: combate.participantes.map((p) => ({ ...p })),
    });
  }

  async buscarPorId(id: string): Promise<Combate | null> {
    const registro = this.combates.get(id);
    return registro ? FakeCombateRepository.hidratar(registro) : null;
  }

  async buscarAtivoDaMesa(mesaId: string): Promise<Combate | null> {
    for (const registro of this.combates.values()) {
      if (registro.mesaId === mesaId && registro.ativo) {
        return FakeCombateRepository.hidratar(registro);
      }
    }
    return null;
  }

  /** Quantos combates existem — apoio a teste que afirma que nada foi gravado. */
  get total(): number {
    return this.combates.size;
  }

  private static hidratar(registro: RegistroCombate): Combate {
    return Combate.reconstituir({
      ...registro,
      // Invertida de propósito: ver o comentário da classe.
      participantes: [...registro.participantes].reverse().map((p) => ({ ...p })),
    });
  }
}
