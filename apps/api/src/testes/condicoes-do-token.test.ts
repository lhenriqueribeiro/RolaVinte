import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONDICOES_DISPONIVEIS } from '@rolavinte/shared';
import { removerComentariosSql } from './check-de-sistemas';
import { COLUNAS_TOKEN } from '../infra/supabase/cena-repository.supabase';

/**
 * Guarda offline da coluna `tokens.condicoes` (RV-064).
 *
 * ## A classe de defeito que ela fecha
 *
 * **F10 — configuração que nunca foi exercitada.** `COLUNAS_TOKEN` passou a
 * nomear uma coluna nova, e `tokenParaRow` passou a escrevê-la. Se a migration
 * não a criar (ou criar com outro nome), tudo compila, o lint passa e a suíte
 * inteira fica verde — porque todo teste de caso de uso roda com fake em
 * memória, onde não existe schema. Contra o Postgres real o erro é um
 * `42703 column tokens.condicoes does not exist`, e como essa coluna entra em
 * **todo** select de token, o efeito não é "condição não aparece": é o tabletop
 * inteiro fora do ar. Foi exatamente assim que a `0005` derrubou o chat e a
 * `0007` a aba de personagens.
 *
 * Ela **não** roda SQL: prova a concordância entre as duas pontas em disco. Quem
 * responde "o banco está migrado?" é `npm run supabase:verificar -w @rolavinte/api`.
 *
 * ## Por que ela também proíbe um `check` com a lista de condições
 *
 * O catálogo `CONDICOES` é a única lista de condições do projeto, por decisão
 * escrita na `0011`. Um `check (condicoes <@ array['caido', …])` seria a mesma
 * lista em SQL — a forma exata do defeito que o `mesas.sistema` cobrou (RV-096)
 * e que só se conserta com uma guarda comparando as duas pontas. O caso abaixo
 * é o consumidor dessa decisão: quem copiar o catálogo para o SQL fica vermelho
 * com a instrução do que fazer, em vez de criar a segunda verdade em silêncio.
 */

const DIR_MIGRATIONS = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'supabase',
  'migrations',
);

/** A coluna que este card criou, e o nome pelo qual as duas pontas a chamam. */
const COLUNA = 'condicoes';

function sqlDeTodasAsMigrations(): string {
  return readdirSync(DIR_MIGRATIONS)
    .filter((nome) => nome.endsWith('.sql'))
    .sort()
    .map((nome) => removerComentariosSql(readFileSync(join(DIR_MIGRATIONS, nome), 'utf8')))
    .join('\n');
}

/** O `add column` de `condicoes`, como está no SQL — sem comentários. */
function declaracaoDaColuna(): string | null {
  const sql = sqlDeTodasAsMigrations();
  const achado = new RegExp(
    `alter\\s+table\\s+tokens\\s+add\\s+column(?:\\s+if\\s+not\\s+exists)?\\s+${COLUNA}\\b[^;]*`,
    'i',
  ).exec(sql);
  return achado ? achado[0] : null;
}

describe('a coluna que o código lê existe em disco (RV-064)', () => {
  it('alguma migration acrescenta `condicoes` a `tokens`', () => {
    const declaracao = declaracaoDaColuna();
    expect(
      declaracao,
      'Nenhuma migration acrescenta a coluna `condicoes` a `tokens`. Ela entra em COLUNAS_TOKEN, ' +
        'ou seja em TODO select de token: contra o Postgres real o tabletop quebraria inteiro.',
    ).not.toBeNull();
  });

  it('a coluna é um array de texto — o conjunto cabe na linha do token', () => {
    expect(declaracaoDaColuna()?.toLowerCase()).toContain('text[]');
  });

  it('a coluna é `not null default \'{}\'`: "sem condição" tem uma representação só', () => {
    /**
     * O experimento que este caso representa: sem o default, toda linha já
     * gravada ficaria `null`, e "sem condição" passaria a ter duas formas no
     * banco (`null` e `{}`) que a aplicação teria de tratar como sinônimos —
     * a semente de uma F12. Sem o `not null`, nada impede que uma escrita futura
     * grave `null` de novo depois de a coluna ter sido preenchida.
     */
    const declaracao = declaracaoDaColuna()?.toLowerCase() ?? '';
    expect(declaracao).toContain('not null');
    expect(declaracao).toMatch(/default\s+'\{\}'/);
  });

  it('o SELECT do repositório pede a coluna pelo mesmo nome', () => {
    // As duas pontas que precisam casar. Sem isto, o mapper leria `undefined`
    // para sempre e nenhuma condição apareceria — sem erro nenhum.
    const pedidas = COLUNAS_TOKEN.split(',').map((c) => c.trim());
    expect(pedidas).toContain(COLUNA);
    expect(pedidas).not.toContain('*');
  });

  it('o catálogo de condições NÃO foi copiado para o SQL', () => {
    // Derivado do catálogo, não de uma lista escrita aqui: uma condição nova
    // passa a ser vigiada sozinha.
    const sql = sqlDeTodasAsMigrations().toLowerCase();

    const copiadas = CONDICOES_DISPONIVEIS.filter((chave) => sql.includes(`'${chave}'`));

    expect(
      copiadas,
      `Chave(s) do catálogo CONDICOES aparecendo como literal no SQL das migrations: ` +
        `${copiadas.join(', ')}. Isso é uma segunda lista da mesma coisa em outra linguagem — ` +
        `o defeito que o check de mesas.sistema cobrou (RV-096). Se a intenção é integridade ` +
        `referencial de verdade, semeie uma tabela A PARTIR do catálogo com migration gerada e ` +
        `escreva a guarda que compara as duas direções; um check copiado à mão, não.`,
    ).toEqual([]);
  });

  it('a migration se registra em `migrations_aplicadas`', () => {
    // Sem esta linha, `supabase:verificar` acusaria a migration como pendente
    // para sempre, mesmo depois de aplicada — e o aviso perderia o valor.
    const sql = sqlDeTodasAsMigrations();
    expect(sql).toContain("'0011_condicoes'");
  });
});
