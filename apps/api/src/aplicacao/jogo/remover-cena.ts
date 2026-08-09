import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type { CenaRepository, MesaRepository } from '../ports/repositorios';
import type { ArmazenamentoArquivos } from '../ports/infraestrutura';
import { carregarCenaParaEscritaDoMestre } from './acesso-cena';

/** Mensagens únicas dos dois conflitos — o contrato do RV-030 depende delas. */
export const UNICA_CENA_DA_MESA =
  'Esta é a única cena da mesa. Crie ou ative outra cena antes de excluí-la.';

export const CENA_ATIVA_NAO_EXCLUI = 'Esta cena está ativa. Ative outra cena antes de excluí-la.';

/**
 * Exclui uma cena preparada (RV-030).
 *
 * A mesa nunca fica sem cena ativa: a única cena e a cena ativa são recusadas
 * com `conflito`. Os tokens da cena vão junto (cascata no banco); o mapa no
 * armazenamento é apagado depois, em best-effort — arquivo órfão é lixo, não
 * inconsistência de domínio.
 */
export class RemoverCena {
  constructor(
    private readonly cenas: CenaRepository,
    private readonly mesas: MesaRepository,
    private readonly armazenamento: ArmazenamentoArquivos,
  ) {}

  async executar(usuarioId: string, cenaId: string): Promise<Result<void>> {
    const acesso = await carregarCenaParaEscritaDoMestre(
      this.cenas,
      this.mesas,
      usuarioId,
      cenaId,
      'Apenas o mestre remove cenas.',
    );
    if (!acesso.ok) return falha(acesso.erro);
    const { cena } = acesso.valor;

    const daMesa = await this.cenas.listarDaMesa(cena.mesaId);
    if (daMesa.length <= 1) return falha(ErroDominio.conflito(UNICA_CENA_DA_MESA));
    if (cena.ativa) return falha(ErroDominio.conflito(CENA_ATIVA_NAO_EXCLUI));

    await this.cenas.remover(cena.id);

    const caminho = cena.imagemFundoCaminho;
    if (caminho) {
      try {
        await this.armazenamento.remover(caminho);
      } catch {
        // Falha ao limpar o arquivo não desfaz a exclusão já persistida.
      }
    }
    return ok(undefined);
  }
}
