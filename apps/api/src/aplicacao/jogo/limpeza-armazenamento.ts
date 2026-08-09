import type { ArmazenamentoArquivos } from '../ports/infraestrutura';

/**
 * Apaga arquivos do armazenamento em **best-effort** (RV-047).
 *
 * A política, escrita uma vez só para não divergir entre os casos de uso:
 * arquivo que sobrou é lixo, não inconsistência de domínio. O registro já saiu
 * do banco quando esta função roda, e desfazer a exclusão porque o Storage
 * piscou seria trocar um problema de custo por um problema de correção —
 * inclusive impossível de desfazer no caso da cena, cuja cascata já levou os
 * tokens. Por isso a falha é engolida: nenhum `Result` muda por causa dela.
 *
 * Cada caminho é tentado isoladamente, para que um arquivo problemático não
 * impeça a limpeza dos demais.
 *
 * Não confunda com varredura de bucket: só se apaga o que a entidade guardava
 * em `imagemCaminho`/`imagemFundoCaminho`. Coletar órfãos antigos é outro
 * problema, e outro card.
 */
export async function removerArquivosBestEffort(
  armazenamento: ArmazenamentoArquivos,
  caminhos: readonly (string | null)[],
): Promise<void> {
  for (const caminho of caminhos) {
    if (!caminho) continue;
    try {
      await armazenamento.remover(caminho);
    } catch {
      // Silêncio proposital — ver o bloco acima.
    }
  }
}
