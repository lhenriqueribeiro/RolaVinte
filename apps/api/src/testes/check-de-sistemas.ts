/**
 * Extração do `check` vigente de `mesas.sistema` a partir dos arquivos de
 * migration (RV-096).
 *
 * ## Por que isto existe
 *
 * A lista de sistemas de RPG existe em duas pontas que precisam casar e que
 * nada comparava: `SISTEMAS_RPG` (TypeScript) e a restrição de valor da coluna
 * `mesas.sistema` (SQL). Acrescentar um sistema só na primeira compila, passa
 * no lint e passa na suíte inteira — que roda com fakes — e estoura no primeiro
 * `INSERT` contra o Postgres real. É a classe **F2 — órfão de contrato** da
 * taxonomia, com o agravante da **F10**: a configuração nunca é exercitada
 * porque nenhum teste toca o banco.
 *
 * Este módulo é a metade puramente funcional da guarda: recebe o conteúdo dos
 * arquivos já lidos e devolve qual restrição está valendo. Quem lê o disco é o
 * teste — assim a extração pode ser exercitada com SQL sintético, que é a única
 * forma de provar que ela entende as formas que ainda não existem em disco
 * (restrição em várias linhas, restrição recriada por uma migration posterior,
 * restrição removida e não recriada).
 *
 * ## O modelo: eventos em ordem, e vale o último
 *
 * Migration aplicada é imutável, então a única forma de mudar a restrição é uma
 * migration nova que a recria. A extração percorre os arquivos na ordem do
 * nome (a numeração `NNNN_` garante a ordem de aplicação) e registra dois tipos
 * de evento:
 *
 * - **declaração** — `check (sistema in ('a', 'b'))`, em qualquer lugar do
 *   arquivo, seja inline na coluna ou dentro de um `add constraint`;
 * - **remoção** — `drop constraint [if exists] <nome>` cujo nome mencione
 *   `sistema`.
 *
 * Vale o último evento. Se ele for uma remoção, a coluna ficou **sem**
 * restrição — e isso é reportado como tal, não como "continua valendo a
 * anterior". Uma guarda que devolvesse a lista antiga aqui passaria verde com o
 * banco aceitando qualquer texto, que é exatamente o defeito que ela deveria
 * denunciar.
 *
 * ## Limites conhecidos desta extração
 *
 * - Reconhece a restrição pela expressão `sistema in (...)`, sem amarrar à
 *   tabela: se outra tabela ganhar uma coluna `sistema` com a mesma forma de
 *   restrição, a extração passa a ver o `check` errado. Hoje só `mesas` tem
 *   essa coluna, e o teste que consome este módulo falharia ruidosamente (a
 *   lista não bateria com o enum) em vez de passar em silêncio.
 * - A remoção é reconhecida pelo nome do constraint conter `sistema`. Removê-la
 *   por um nome que não o mencione escaparia.
 * - Valores só são reconhecidos como literais de string simples. `check` escrito
 *   com `= any(array[...])` ou com enum nativo do Postgres não seria visto —
 *   e o teste denunciaria como "nenhuma restrição vigente".
 */

export interface ArquivoDeMigration {
  /** Nome do arquivo, como aparece no diretório. Usado nas mensagens de falha. */
  nome: string;
  /** Conteúdo bruto do arquivo, comentários inclusive. */
  sql: string;
}

export interface CheckDeSistema {
  /** Arquivo do último evento — o que declarou ou o que removeu a restrição. */
  arquivo: string;
  /** Valores aceitos, na ordem declarada. `null` quando o último evento foi uma remoção. */
  valores: string[] | null;
}

/** `check (sistema in ('a', 'b'))` — a lista de valores não contém parênteses. */
const RE_CHECK = /check\s*\(\s*sistema\s+in\s*\(([^)]*)\)\s*\)/gi;

/** `drop constraint [if exists] nome` — com ou sem aspas duplas em volta do nome. */
const RE_DROP = /drop\s+constraint\s+(?:if\s+exists\s+)?"?([a-z0-9_]+)"?/gi;

/** Literal de string do SQL, com `''` como aspa escapada. */
const RE_LITERAL = /'((?:[^']|'')*)'/g;

/**
 * Remove comentários (`--` de linha e `/* *\/` de bloco) preservando o conteúdo
 * dos literais de string.
 *
 * Não é preciosismo: o arquivo `0008` explica em prosa o que a restrição faz, e
 * uma explicação que cite a forma da expressão seria lida como declaração real.
 * Uma guarda derivada de comentário mede documentação, não schema.
 */
export function removerComentariosSql(sql: string): string {
  let saida = '';
  let i = 0;

  // `charAt` em vez de `sql[i]`: com `noUncheckedIndexedAccess` o índice devolve
  // `string | undefined`, e o fim da string aqui não é um caso especial.
  while (i < sql.length) {
    const atual = sql.charAt(i);
    const proximo = sql.charAt(i + 1);

    if (atual === "'") {
      saida += atual;
      i++;
      while (i < sql.length) {
        if (sql.charAt(i) === "'") {
          if (sql.charAt(i + 1) === "'") {
            saida += "''";
            i += 2;
            continue;
          }
          saida += "'";
          i++;
          break;
        }
        saida += sql.charAt(i);
        i++;
      }
      continue;
    }

    if (atual === '-' && proximo === '-') {
      while (i < sql.length && sql.charAt(i) !== '\n') i++;
      continue;
    }

    if (atual === '/' && proximo === '*') {
      i += 2;
      while (i < sql.length && !(sql.charAt(i) === '*' && sql.charAt(i + 1) === '/')) i++;
      i += 2;
      continue;
    }

    saida += atual;
    i++;
  }

  return saida;
}

interface EventoDeCheck {
  posicao: number;
  arquivo: string;
  valores: string[] | null;
}

function valoresDaLista(lista: string): string[] {
  const valores: string[] = [];
  for (const achado of lista.matchAll(RE_LITERAL)) {
    valores.push((achado[1] ?? '').replaceAll("''", "'"));
  }
  return valores;
}

function eventosDoArquivo(arquivo: ArquivoDeMigration): EventoDeCheck[] {
  const sql = removerComentariosSql(arquivo.sql);
  const eventos: EventoDeCheck[] = [];

  for (const achado of sql.matchAll(RE_CHECK)) {
    eventos.push({
      posicao: achado.index ?? 0,
      arquivo: arquivo.nome,
      valores: valoresDaLista(achado[1] ?? ''),
    });
  }

  for (const achado of sql.matchAll(RE_DROP)) {
    if (!(achado[1] ?? '').toLowerCase().includes('sistema')) continue;
    eventos.push({ posicao: achado.index ?? 0, arquivo: arquivo.nome, valores: null });
  }

  return eventos.sort((a, b) => a.posicao - b.posicao);
}

/**
 * Devolve a restrição vigente de `mesas.sistema`, ou `null` se nenhuma migration
 * jamais tocou no assunto.
 *
 * @param arquivos na ordem de aplicação (a numeração `NNNN_` do nome).
 */
export function checkEfetivoDeMesasSistema(
  arquivos: readonly ArquivoDeMigration[],
): CheckDeSistema | null {
  const eventos = arquivos.flatMap(eventosDoArquivo);
  const ultimo = eventos.at(-1);
  if (!ultimo) return null;
  return { arquivo: ultimo.arquivo, valores: ultimo.valores };
}

/**
 * SQL pronto para colar numa migration nova que recria a restrição com os
 * valores informados. Vai dentro da mensagem de falha: a guarda tem de dizer o
 * que fazer, não só que algo divergiu.
 */
export function sqlDoCheckDeSistemas(valores: readonly string[]): string {
  const lista = valores.map((valor) => `'${valor.replaceAll("'", "''")}'`).join(', ');
  return [
    'alter table mesas',
    '  drop constraint if exists mesas_sistema_check;',
    '',
    'alter table mesas',
    '  add constraint mesas_sistema_check',
    `  check (sistema in (${lista}));`,
  ].join('\n');
}
