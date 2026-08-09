import { LIMITE_SEMENTE } from './atribuicao';

/**
 * Auditoria da semente de conteúdo de Pathfinder 2e (RV-150).
 *
 * A regra de licenciamento existe em prosa em `docs/licencas/pathfinder2e.md`.
 * Prosa é inerte: a classe **F1 — defesa que não defende** da
 * `docs/agentes/taxonomia-de-falhas.md` é exatamente "configuração que aparenta
 * proteger e não é lida por nenhuma linha de código". Esta é a linha de código
 * que lê a regra; `licenca.test.ts` a aponta para os arquivos reais do disco.
 *
 * O módulo é **puro de propósito**: recebe os arquivos já lidos e devolve
 * violações. Quem lê o disco é o teste (Node), o que mantém `packages/shared`
 * sem runtime de servidor — o mesmo pacote é empacotado para o navegador — e
 * permite que a API reaproveite a auditoria sobre uma semente vinda de outra
 * origem quando o catálogo (RV-157) existir.
 */

/** Um arquivo do diretório `semente/`, já lido do disco. */
export interface ArquivoDeSemente {
  /** Caminho relativo ao diretório da semente, ex.: `pericias.json`. */
  readonly caminho: string;
  /** Conteúdo bruto, exatamente como está no disco. */
  readonly conteudo: string;
  /** Tamanho do arquivo em bytes no disco — não o comprimento da string. */
  readonly bytes: number;
}

/**
 * Forma mínima de todo item de semente. `fonte` é obrigatório porque a
 * atribuição precisa viajar **junto do dado**: quem consome a API também
 * precisa dela, e um rodapé de tela não acompanha um JSON.
 */
export interface ItemDeSemente {
  /** Identificador estável dentro do tipo, ex.: `acrobacia`. */
  readonly chave: string;
  /** Nome exibido, em PT-BR. */
  readonly nome: string;
  /** De onde veio o dado — livro, página/ID e a licença que o cobre. */
  readonly fonte: string;
}

export type MotivoViolacao =
  | 'json-invalido'
  | 'formato-invalido'
  | 'excesso-de-itens'
  | 'arquivo-grande-demais'
  | 'item-sem-fonte'
  | 'atribuicao-incompleta';

export interface ViolacaoDeLicenca {
  readonly motivo: MotivoViolacao;
  /** Arquivo que causou a violação, relativo ao diretório da semente. */
  readonly arquivo: string;
  /** Chave do item, quando a violação é de um item específico. */
  readonly chave?: string;
  /** Mensagem em PT-BR que nomeia o problema **e** o que fazer com ele. */
  readonly mensagem: string;
}

export interface ContextoDeAuditoria {
  /**
   * Conteúdo de `docs/licencas/pathfinder2e.md`. Enquanto a semente está vazia
   * o documento pode estar pendente; no instante em que o primeiro item entra,
   * a atribuição completa passa a ser obrigatória.
   */
  readonly documentoDeLicenca: string;
}

/**
 * Marcador que o documento de licença carrega enquanto o texto verbatim da OGL
 * 1.0a e os avisos de copyright da Seção 15 não estiverem lá. Some do documento
 * no mesmo commit que trouxer o primeiro item de semente — do contrário a
 * auditoria fica vermelha, que é o ponto: distribuir Open Game Content sem a
 * licença junto é a violação que este card existe para impedir.
 */
export const MARCADOR_OGL_PENDENTE = 'OGL-PENDENTE';

/** Extensão dos arquivos que compõem a semente. O resto (README) é ignorado. */
const EXTENSAO_DE_SEMENTE = '.json';

/** `pericias.json` → `pericias`. Um tipo por arquivo. */
export function tipoDoArquivo(caminho: string): string {
  return caminho.slice(0, -EXTENSAO_DE_SEMENTE.length);
}

/** Só arquivos `.json` são semente; `README.md` documenta e não conta. */
export function ehArquivoDeSemente(caminho: string): boolean {
  return caminho.endsWith(EXTENSAO_DE_SEMENTE);
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function textoPreenchido(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim().length > 0;
}

/** Rótulo do item nas mensagens: a chave quando existe, o índice quando não. */
function rotuloDoItem(item: unknown, indice: number): string {
  if (ehObjeto(item) && textoPreenchido(item['chave'])) return item['chave'];
  return `#${indice}`;
}

/**
 * Audita a semente inteira. Devolve **todas** as violações, não a primeira: a
 * pessoa que colou um dump precisa ver o tamanho do estrago de uma vez.
 */
export function auditarSemente(
  arquivos: readonly ArquivoDeSemente[],
  contexto: ContextoDeAuditoria,
): ViolacaoDeLicenca[] {
  const violacoes: ViolacaoDeLicenca[] = [];
  let totalDeItens = 0;

  for (const arquivo of arquivos) {
    if (!ehArquivoDeSemente(arquivo.caminho)) continue;

    if (arquivo.bytes > LIMITE_SEMENTE.bytesPorArquivo) {
      violacoes.push({
        motivo: 'arquivo-grande-demais',
        arquivo: arquivo.caminho,
        mensagem:
          `${arquivo.caminho} tem ${arquivo.bytes} bytes e o teto é ${LIMITE_SEMENTE.bytesPorArquivo} ` +
          `(LIMITE_SEMENTE.bytesPorArquivo). A semente é curada e pequena, não um dump: ` +
          `corte o arquivo, ou mude LIMITE_SEMENTE em atribuicao.ts com o motivo escrito no diff. ` +
          `Ver docs/licencas/pathfinder2e.md.`,
      });
    }

    let conteudo: unknown;
    try {
      conteudo = JSON.parse(arquivo.conteudo);
    } catch (erro) {
      violacoes.push({
        motivo: 'json-invalido',
        arquivo: arquivo.caminho,
        mensagem:
          `${arquivo.caminho} não é JSON válido (${erro instanceof Error ? erro.message : 'erro desconhecido'}). ` +
          `A auditoria de licença precisa ler cada item para conferir a atribuição; ` +
          `arquivo ilegível é conteúdo sem fronteira.`,
      });
      continue;
    }

    if (!Array.isArray(conteudo)) {
      violacoes.push({
        motivo: 'formato-invalido',
        arquivo: arquivo.caminho,
        mensagem:
          `${arquivo.caminho} precisa conter um array de itens no topo. ` +
          `Ver o formato em packages/shared/src/sistemas/pathfinder2e/semente/README.md.`,
      });
      continue;
    }

    totalDeItens += conteudo.length;

    if (conteudo.length > LIMITE_SEMENTE.itensPorTipo) {
      violacoes.push({
        motivo: 'excesso-de-itens',
        arquivo: arquivo.caminho,
        mensagem:
          `${arquivo.caminho} tem ${conteudo.length} itens do tipo "${tipoDoArquivo(arquivo.caminho)}" ` +
          `e o teto é ${LIMITE_SEMENTE.itensPorTipo} (LIMITE_SEMENTE.itensPorTipo). ` +
          `Não podemos distribuir o corpus de Pathfinder: a semente é uma amostra curada. ` +
          `Corte a lista, ou mude LIMITE_SEMENTE em atribuicao.ts com o motivo escrito no diff. ` +
          `Ver docs/licencas/pathfinder2e.md.`,
      });
    }

    conteudo.forEach((item: unknown, indice) => {
      if (!ehObjeto(item) || !textoPreenchido(item['fonte'])) {
        violacoes.push({
          motivo: 'item-sem-fonte',
          arquivo: arquivo.caminho,
          chave: rotuloDoItem(item, indice),
          mensagem:
            `O item "${rotuloDoItem(item, indice)}" de ${arquivo.caminho} não declara "fonte". ` +
            `A atribuição viaja junto do dado, não só no rodapé da tela: preencha "fonte" com ` +
            `o livro e a licença que cobrem o item. Ver docs/licencas/pathfinder2e.md.`,
        });
      }
    });
  }

  if (totalDeItens > 0 && contexto.documentoDeLicenca.includes(MARCADOR_OGL_PENDENTE)) {
    violacoes.push({
      motivo: 'atribuicao-incompleta',
      arquivo: 'docs/licencas/pathfinder2e.md',
      mensagem:
        `A semente passou a ter ${totalDeItens} item(ns), mas docs/licencas/pathfinder2e.md ainda ` +
        `carrega o marcador ${MARCADOR_OGL_PENDENTE}. Distribuir Open Game Content exige o texto ` +
        `verbatim da OGL 1.0a e os avisos de copyright da Seção 15 junto do conteúdo: complete o ` +
        `documento e apague o marcador no mesmo commit que trouxe o conteúdo.`,
    });
  }

  return violacoes;
}

/** Relatório legível para a mensagem de falha do teste. */
export function descreverViolacoes(violacoes: readonly ViolacaoDeLicenca[]): string {
  return violacoes.map((v) => `- [${v.motivo}] ${v.mensagem}`).join('\n');
}
