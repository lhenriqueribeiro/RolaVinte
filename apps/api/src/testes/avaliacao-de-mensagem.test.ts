import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { removerComentariosSql } from './check-de-sistemas';
import { COLUNAS } from '../infra/supabase/mensagem-repository.supabase';

/**
 * Guarda offline da coluna `mensagens.avaliacao` (RV-154).
 *
 * ## A classe de defeito que ela fecha
 *
 * **F10 — configuração que nunca foi exercitada**, com o agravante da **F2**. O
 * mapper e o `SELECT` do repositório passaram a nomear uma coluna nova; se a
 * migration não a criar (ou criar com outro nome), tudo compila, o lint passa e a
 * suíte inteira fica verde — porque **todos** os testes de caso de uso rodam com
 * fakes em memória, onde não existe schema. O erro aparece na primeira consulta
 * ao Postgres real, como um `42703 column mensagens.avaliacao does not exist`
 * que derruba o histórico do chat inteiro. Foi exatamente assim que a `0005`
 * derrubou o chat e a `0007` a aba de personagens.
 *
 * Ela **não** roda SQL: prova a *concordância entre as duas pontas em disco*, não
 * que o banco esteja migrado. Quem responde a segunda pergunta é
 * `npm run supabase:verificar`, e a resposta hoje é "0009 e 0010 pendentes".
 */

const DIR_MIGRATIONS = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'supabase',
  'migrations',
);

/** A coluna que este card criou, e o nome pelo qual as duas pontas a chamam. */
const COLUNA = 'avaliacao';

function sqlDeTodasAsMigrations(): string {
  return readdirSync(DIR_MIGRATIONS)
    .filter((nome) => nome.endsWith('.sql'))
    .sort()
    .map((nome) => removerComentariosSql(readFileSync(join(DIR_MIGRATIONS, nome), 'utf8')))
    .join('\n');
}

/** O `add column` de `avaliacao`, como está no SQL — sem comentários. */
function declaracaoDaColuna(): string | null {
  const sql = sqlDeTodasAsMigrations();
  const achado = new RegExp(
    `alter\\s+table\\s+mensagens\\s+add\\s+column(?:\\s+if\\s+not\\s+exists)?\\s+${COLUNA}\\b[^;]*`,
    'i',
  ).exec(sql);
  return achado ? achado[0] : null;
}

describe('a coluna que o código lê existe em disco (RV-154)', () => {
  it('alguma migration acrescenta `avaliacao` a `mensagens`', () => {
    const declaracao = declaracaoDaColuna();
    expect(
      declaracao,
      'Nenhuma migration acrescenta a coluna `avaliacao` a `mensagens`. O mapper e o SELECT do ' +
        'repositório a nomeiam: contra o Postgres real o histórico do chat quebraria inteiro.',
    ).not.toBeNull();
  });

  it('a coluna é `jsonb` — o mesmo tipo de `rolagem`, porque guarda um objeto', () => {
    expect(declaracaoDaColuna()?.toLowerCase()).toContain('jsonb');
  });

  it('a coluna é nullable: mensagem gravada antes deste card continua válida', () => {
    /**
     * O experimento que este teste representa: um `not null` aqui faria a
     * migration **falhar na aplicação**, porque toda linha já existente ficaria
     * sem valor. Pior, um `not null default '{}'::jsonb` aplicaria e inventaria
     * uma avaliação vazia para todo o histórico — um grau de sucesso que ninguém
     * rolou.
     */
    const declaracao = declaracaoDaColuna()?.toLowerCase() ?? '';
    expect(declaracao).not.toContain('not null');
    expect(declaracao).not.toContain('default');
  });

  it('o SELECT do repositório pede a coluna pelo mesmo nome', () => {
    // As duas pontas que precisam casar. Sem isto, o mapper leria `undefined`
    // para sempre e o selo simplesmente nunca apareceria — sem erro nenhum.
    const pedidas = COLUNAS.split(',').map((c) => c.trim());
    expect(pedidas).toContain(COLUNA);
    expect(pedidas).not.toContain('*');
  });

  it('o banco também recusa avaliação em mensagem que não é rolagem', () => {
    // Segunda tranca do invariante que o agregado já garante: `fala` com grau de
    // sucesso é estado impossível, e um caminho de escrita futuro não escapa dele.
    const sql = sqlDeTodasAsMigrations().toLowerCase();
    expect(sql).toContain('mensagens_avaliacao_check');
    expect(sql).toMatch(/check\s*\(\s*avaliacao\s+is\s+null\s+or\s+tipo\s+in\s*\(/);
  });

  it('a migration se registra em `migrations_aplicadas`', () => {
    // Sem esta linha, `supabase:verificar` acusaria a migration como pendente
    // para sempre, mesmo depois de aplicada — e o aviso perderia o valor.
    const sql = sqlDeTodasAsMigrations();
    expect(sql).toContain("'0010_avaliacao_mensagem'");
  });
});
