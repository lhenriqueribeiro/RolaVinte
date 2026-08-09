import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type { CenaRepository, MesaRepository } from '../ports/repositorios';
import type { ArmazenamentoArquivos } from '../ports/infraestrutura';
import { carregarCenaParaEscritaDoMestre } from './acesso-cena';
import { removerArquivosBestEffort } from './limpeza-armazenamento';

/** Mensagens únicas dos dois conflitos — o contrato do RV-030 depende delas. */
export const UNICA_CENA_DA_MESA =
  'Esta é a única cena da mesa. Crie ou ative outra cena antes de excluí-la.';

export const CENA_ATIVA_NAO_EXCLUI = 'Esta cena está ativa. Ative outra cena antes de excluí-la.';

/**
 * Exclui uma cena preparada (RV-030).
 *
 * A mesa nunca fica sem cena ativa: a única cena e a cena ativa são recusadas
 * com `conflito`. Os tokens da cena vão junto (cascata no banco); os arquivos
 * são apagados depois, em best-effort — arquivo órfão é lixo, não
 * inconsistência de domínio.
 *
 * São **dois** armazenamentos porque são dois buckets (RV-041): o mapa de fundo
 * vive em `mapas` e as artes das peças em `tokens`. A cascata de FK não alcança
 * o Storage, então a arte de cada token precisa ser apagada aqui — e os
 * caminhos têm de ser lidos **antes** de `cenas.remover`, porque depois da
 * cascata não há mais de onde tirá-los (RV-047).
 */
export class RemoverCena {
  constructor(
    private readonly cenas: CenaRepository,
    private readonly mesas: MesaRepository,
    private readonly armazenamento: ArmazenamentoArquivos,
    private readonly armazenamentoTokens: ArmazenamentoArquivos,
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

    // Só depois das duas guardas: exclusão recusada não paga uma leitura extra.
    const artesDosTokens = (await this.cenas.listarTokensDaCena(cena.id)).map(
      (token) => token.imagemCaminho,
    );

    await this.cenas.remover(cena.id);

    await removerArquivosBestEffort(this.armazenamento, [cena.imagemFundoCaminho]);
    await removerArquivosBestEffort(this.armazenamentoTokens, artesDosTokens);
    return ok(undefined);
  }
}
