import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SISTEMAS_RPG } from '@rolavinte/shared';
import { describe, expect, it } from 'vitest';
import {
  checkEfetivoDeMesasSistema,
  removerComentariosSql,
  sqlDoCheckDeSistemas,
  type ArquivoDeMigration,
} from './check-de-sistemas';

/**
 * A quinta lista de sistemas morre aqui (RV-096).
 *
 * `SISTEMAS_RPG` e a restrição de valor de `mesas.sistema` são duas listas da
 * mesma coisa. Depois do RV-091 o lado do TypeScript fecha nas duas portas
 * (`Record` total no registro de sistemas + teste em runtime), e sobrou o
 * banco: acrescentar um sistema ao enum passa em `check`, `lint`, `test` e
 * `build`, e falha **só** no primeiro `INSERT` contra o Postgres real. Classe
 * **F2 — órfão de contrato**, agravada pela **F10**: a restrição nunca é
 * exercitada porque nenhum teste toca o banco.
 *
 * A guarda não pode depender de banco — a suíte roda sem rede, sem credencial e
 * sem container. Ela deriva do que está em disco: lê `supabase/migrations/`,
 * extrai a restrição vigente (considerando que uma migration posterior pode
 * recriar a de uma anterior) e compara com o enum, **nas duas direções**.
 *
 * A extração mora em `check-de-sistemas.ts` e tem teste próprio logo abaixo,
 * com SQL sintético: a forma que existe hoje em disco é uma só, e uma guarda
 * cuja extração só foi provada contra o caso atual quebra em silêncio na
 * primeira migration escrita de outro jeito.
 */

const DIR_MIGRATIONS = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'supabase',
  'migrations',
);

const ARQUIVOS: ArquivoDeMigration[] = readdirSync(DIR_MIGRATIONS)
  .filter((nome) => nome.endsWith('.sql'))
  .sort() // a numeração NNNN_ é a ordem de aplicação
  .map((nome) => ({ nome, sql: readFileSync(join(DIR_MIGRATIONS, nome), 'utf8') }));

/**
 * Valores que a restrição já aceita e que `SISTEMAS_RPG` ainda **não** declara.
 *
 * Existe por um motivo de coordenação, não de design: o RV-152 acrescenta
 * `'pathfinder2e'` ao enum na mesma sprint e não tem número de migration
 * reservado, então a `0008` deixou o valor pronto no banco para que dois
 * agentes concorrentes não disputassem o número da próxima migration.
 *
 * É uma reserva **temporária e verificada**: o último teste deste arquivo fica
 * vermelho no dia em que o valor entrar no enum, pedindo a remoção da linha.
 * Sem esse vencimento, a lista viraria de novo a quinta lista de sistemas —
 * escrita à mão, permanente e capaz de esconder divergência real.
 *
 * Não acrescente nada aqui para "silenciar" uma falha: valor no banco que o
 * enum não conhece é inalcançável pela aplicação, e o normal é tirá-lo do
 * banco numa migration nova.
 */
// Vazia desde o RV-152: `'pathfinder2e'` entrou em SISTEMAS_RPG e a comparação
// normal passou a cobri-lo, como o teste de vencimento abaixo exigiu.
const SISTEMAS_ANTECIPADOS_NO_CHECK: readonly string[] = [];

const CAMINHO_ENUM = 'packages/shared/src/schemas/mesas.ts';
const CAMINHO_ESTE_TESTE = 'apps/api/src/testes/check-de-sistemas.test.ts';

/** Nome sugerido para a migration corretiva, derivado do maior número em disco. */
function proximaMigration(): string {
  const numeros = ARQUIVOS.map((arquivo) => Number.parseInt(arquivo.nome.slice(0, 4), 10)).filter(
    (numero) => Number.isFinite(numero),
  );
  const proximo = String(Math.max(0, ...numeros) + 1).padStart(4, '0');
  return `apps/api/supabase/migrations/${proximo}_sistemas_<motivo>.sql`;
}

describe('CHECK de mesas.sistema × SISTEMAS_RPG (RV-096)', () => {
  it('a comparação tem os dois lados para comparar', () => {
    // Rede de segurança do próprio arquivo: com o diretório vazio ou o enum
    // vazio, todos os `filter` abaixo devolveriam `[]` e a guarda passaria
    // verde sem ter verificado nada.
    expect(ARQUIVOS.length).toBeGreaterThan(0);
    expect(SISTEMAS_RPG.length).toBeGreaterThan(0);
  });

  it('alguma migration declara a restrição de valor de mesas.sistema', () => {
    const vigente = checkEfetivoDeMesasSistema(ARQUIVOS);

    expect(
      vigente?.valores ?? null,
      vigente === null
        ? `Nenhuma migration de apps/api/supabase/migrations/ declara ` +
            `"check (sistema in (...))" para mesas.sistema. Sem a restrição, o banco aceita ` +
            `qualquer texto na coluna e o enum ${CAMINHO_ENUM} deixa de significar algo do lado ` +
            `do Postgres. Crie ${proximaMigration()} com:\n\n${sqlDoCheckDeSistemas(SISTEMAS_RPG)}`
        : `A última migration a mexer na restrição de mesas.sistema foi ` +
            `"${vigente.arquivo}", e ela a REMOVEU sem recriar. A coluna ficou sem restrição: ` +
            `o banco passa a aceitar qualquer texto. Crie ${proximaMigration()} com:\n\n` +
            `${sqlDoCheckDeSistemas(SISTEMAS_RPG)}`,
    ).not.toBeNull();
  });

  it('todo sistema de SISTEMAS_RPG é aceito pela restrição vigente', () => {
    const vigente = checkEfetivoDeMesasSistema(ARQUIVOS);
    const aceitos = vigente?.valores ?? [];
    const faltando = SISTEMAS_RPG.filter((sistema) => !aceitos.includes(sistema));

    expect(
      faltando,
      `Sistema(s) declarados em SISTEMAS_RPG que a restrição de mesas.sistema NÃO aceita: ` +
        `${faltando.join(', ')}. A restrição vigente vem de "${vigente?.arquivo ?? '(nenhuma)'}" e ` +
        `aceita apenas: ${aceitos.join(', ')}. Criar uma mesa com esse sistema passa em ` +
        `"npm run check", no lint e em toda esta suíte — que roda com fakes — e estoura no ` +
        `primeiro INSERT contra o Postgres real. Migration aplicada é imutável: NÃO edite a 0001. ` +
        `Crie ${proximaMigration()} com:\n\n` +
        `${sqlDoCheckDeSistemas([...SISTEMAS_RPG, ...SISTEMAS_ANTECIPADOS_NO_CHECK])}`,
    ).toEqual([]);
  });

  it('a restrição vigente não aceita valor que SISTEMAS_RPG desconheça', () => {
    const vigente = checkEfetivoDeMesasSistema(ARQUIVOS);
    const conhecidos: readonly string[] = SISTEMAS_RPG;
    const orfaos = (vigente?.valores ?? []).filter(
      (valor) => !conhecidos.includes(valor) && !SISTEMAS_ANTECIPADOS_NO_CHECK.includes(valor),
    );

    expect(
      orfaos,
      `A restrição de mesas.sistema em "${vigente?.arquivo ?? '(nenhuma)'}" aceita valor(es) que ` +
        `SISTEMAS_RPG não conhece: ${orfaos.join(', ')}. Nenhum código consegue gravar esse valor ` +
        `— é lista morta no banco, e no dia em que alguém o inserir à mão a aplicação lê uma mesa ` +
        `cujo sistema não tem definição de ficha. Ou o valor entra em ${CAMINHO_ENUM}, ou sai da ` +
        `restrição numa migration nova (${proximaMigration()}).`,
    ).toEqual([]);
  });

  it('nenhuma reserva de SISTEMAS_ANTECIPADOS_NO_CHECK está vencida', () => {
    const conhecidos: readonly string[] = SISTEMAS_RPG;
    const vencidas = SISTEMAS_ANTECIPADOS_NO_CHECK.filter((valor) => conhecidos.includes(valor));

    expect(
      vencidas,
      `Reserva(s) vencida(s) em SISTEMAS_ANTECIPADOS_NO_CHECK: ${vencidas.join(', ')} — já ` +
        `está(ão) em SISTEMAS_RPG. Isto é esperado e é uma boa notícia: a migration que já está ` +
        `em disco cobriu você, e NENHUMA migration nova é necessária. Apague a(s) linha(s) da ` +
        `constante em ${CAMINHO_ESTE_TESTE} (uma linha) — a partir daqui a comparação normal ` +
        `cobre o valor, e manter a reserva abriria um buraco permanente na guarda.`,
    ).toEqual([]);
  });
});

/**
 * A extração é a parte frágil da guarda: um regex que deixe de casar devolve
 * "nenhuma restrição" ou uma lista velha, e a comparação acima passa a medir o
 * nada. Estes casos fixam as formas que a extração precisa entender, incluindo
 * as que ainda não existem em disco.
 */
describe('extração da restrição de mesas.sistema a partir do SQL', () => {
  const arquivo = (nome: string, sql: string): ArquivoDeMigration => ({ nome, sql });

  it('lê a restrição declarada em uma linha só', () => {
    const efetivo = checkEfetivoDeMesasSistema([
      arquivo('0001_x.sql', `create table mesas (sistema text not null check (sistema in ('a')));`),
    ]);

    expect(efetivo).toEqual({ arquivo: '0001_x.sql', valores: ['a'] });
  });

  it('lê a restrição quebrada em várias linhas, como a 0001 real', () => {
    const efetivo = checkEfetivoDeMesasSistema([
      arquivo(
        '0001_x.sql',
        [
          'create table mesas (',
          "  sistema text not null default 'generico'",
          "    check (sistema in ('dnd5e', 'tormenta20',",
          "                       'ordem-paranormal', 'generico')),",
          ');',
        ].join('\n'),
      ),
    ]);

    expect(efetivo?.valores).toEqual(['dnd5e', 'tormenta20', 'ordem-paranormal', 'generico']);
  });

  it('aceita CHECK ... IN em maiúsculas e com espaçamento irregular', () => {
    const efetivo = checkEfetivoDeMesasSistema([
      arquivo('0001_x.sql', `CHECK   (  sistema   IN  ( 'a' ,'b' )  )`),
    ]);

    expect(efetivo?.valores).toEqual(['a', 'b']);
  });

  it('uma migration posterior sobrescreve a restrição da 0001', () => {
    const efetivo = checkEfetivoDeMesasSistema([
      arquivo('0001_x.sql', `check (sistema in ('a', 'b'))`),
      arquivo(
        '0009_y.sql',
        [
          'alter table mesas drop constraint if exists mesas_sistema_check;',
          'alter table mesas add constraint mesas_sistema_check',
          "  check (sistema in ('a', 'b', 'c'));",
        ].join('\n'),
      ),
    ]);

    expect(efetivo).toEqual({ arquivo: '0009_y.sql', valores: ['a', 'b', 'c'] });
  });

  it('restrição removida e não recriada deixa a coluna sem restrição, e não a lista antiga', () => {
    const efetivo = checkEfetivoDeMesasSistema([
      arquivo('0001_x.sql', `check (sistema in ('a', 'b'))`),
      arquivo('0009_y.sql', 'alter table mesas drop constraint mesas_sistema_check;'),
    ]);

    // Devolver ['a','b'] aqui seria a guarda afirmando uma proteção que o banco
    // não tem mais — exatamente o F1 que ela existe para evitar.
    expect(efetivo).toEqual({ arquivo: '0009_y.sql', valores: null });
  });

  it('ignora a restrição escrita dentro de comentário de linha e de bloco', () => {
    const efetivo = checkEfetivoDeMesasSistema([
      arquivo('0001_x.sql', `check (sistema in ('a'))`),
      arquivo(
        '0009_y.sql',
        [
          "-- antes era check (sistema in ('velho')), e mudou porque…",
          "/* histórico: check (sistema in ('mais-velho')) */",
          "alter table mesas add constraint mesas_sistema_check check (sistema in ('a', 'b'));",
        ].join('\n'),
      ),
    ]);

    expect(efetivo?.valores).toEqual(['a', 'b']);
  });

  it('não confunde o drop de outro constraint com a remoção da restrição de sistema', () => {
    const efetivo = checkEfetivoDeMesasSistema([
      arquivo('0001_x.sql', `check (sistema in ('a'))`),
      arquivo(
        '0007_y.sql',
        'alter table personagens drop constraint if exists personagens_dados_objeto;',
      ),
    ]);

    expect(efetivo?.valores).toEqual(['a']);
  });

  it('devolve null quando nenhuma migration fala de mesas.sistema', () => {
    expect(checkEfetivoDeMesasSistema([arquivo('0001_x.sql', 'create table usuarios ();')])).toBe(
      null,
    );
  });

  it('preserva "--" que aparece dentro de literal de string', () => {
    expect(removerComentariosSql("select 'a--b'; -- comentário")).toBe("select 'a--b'; ");
  });

  it('o SQL sugerido na mensagem de falha recria o constraint com a lista pedida', () => {
    const sql = sqlDoCheckDeSistemas(['a', 'b']);

    expect(sql).toContain('drop constraint if exists mesas_sistema_check');
    expect(sql).toContain("check (sistema in ('a', 'b'))");
    // O que a mensagem sugere tem de ser lido de volta pela própria extração:
    // sugerir SQL que a guarda não reconheceria seria mandar quem lê para um
    // segundo vermelho.
    expect(checkEfetivoDeMesasSistema([{ nome: '9999_sugerido.sql', sql }])?.valores).toEqual([
      'a',
      'b',
    ]);
  });
});
