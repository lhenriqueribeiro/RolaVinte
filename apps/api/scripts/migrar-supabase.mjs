#!/usr/bin/env node
/**
 * Aplica as migrations pendentes no banco apontado por `SUPABASE_DB_URL`.
 *
 * Complementa o `supabase:verificar`, que só sabe **avisar**: aqui o desvio
 * entre disco e banco tem conserto. As duas classes de defeito que isto fecha
 * já morderam este projeto — a `0005` derrubou o chat inteiro e a `0007`
 * derrubaria a aba de personagens de qualquer mesa, ambas por estarem em disco
 * e não no banco (F10 da taxonomia).
 *
 * Cada migration roda na PRÓPRIA transação: um arquivo que falhe no meio não
 * deixa metade do schema aplicado, e as anteriores já confirmadas permanecem —
 * então corrigir o arquivo problemático e rodar de novo é seguro.
 *
 *   npm run supabase:migrar -w @rolavinte/api
 *   npm run supabase:migrar -w @rolavinte/api -- --desde 0005_chat
 *
 * `SUPABASE_DB_URL` é a string de conexão Postgres (Project Settings →
 * Database → Connection string). Ela NÃO é a chave de API: a `service_role`
 * fala REST, e o PostgREST serve dados, não DDL.
 *
 * Cuidado com senha que contenha `#`: o parser de `.env` do Node trata `#` como
 * início de comentário e trunca a linha. Envolva o valor em aspas e faça
 * percent-encoding da senha.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const DIR_MIGRATIONS = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'supabase',
  'migrations',
);

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error(
    [
      '',
      '[migrar] SUPABASE_DB_URL ausente em apps/api/.env.',
      '',
      'Pegue em: Supabase → Project Settings → Database → Connection string.',
      'Não é a chave de API: precisa ser a string postgresql://… com a senha do banco.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

const iDesde = process.argv.indexOf('--desde');
const desde = iDesde === -1 ? null : process.argv[iDesde + 1]?.replace(/\.sql$/, '');

const noDisco = readdirSync(DIR_MIGRATIONS)
  .filter((nome) => nome.endsWith('.sql'))
  .sort(); // a numeração NNNN_ garante a ordem

const cliente = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await cliente.connect();

/** O registro é criado pela 0006; antes dela não há como saber o que rodou. */
async function registroExiste() {
  const { rows } = await cliente.query(
    "select to_regclass('public.migrations_aplicadas') is not null as existe",
  );
  return rows[0].existe === true;
}

let pendentes;
if (await registroExiste()) {
  const { rows } = await cliente.query('select nome from migrations_aplicadas');
  const aplicadas = new Set(rows.map((r) => r.nome));
  pendentes = noDisco.filter((nome) => !aplicadas.has(nome.replace(/\.sql$/, '')));
} else if (desde !== null && desde !== undefined) {
  const i = noDisco.findIndex((nome) => nome.startsWith(desde));
  if (i === -1) {
    console.error(`\n[migrar] --desde "${desde}" não corresponde a nenhum arquivo.\n`);
    await cliente.end();
    process.exit(1);
  }
  pendentes = noDisco.slice(i);
} else {
  // Adivinhar aqui reaplicaria migration imutável — pior que não fazer nada.
  console.error(
    [
      '',
      '[migrar] `migrations_aplicadas` não existe e nenhum --desde foi informado.',
      '',
      'Sem o registro é impossível deduzir o que já rodou. Informe onde começar:',
      '  npm run supabase:migrar -w @rolavinte/api -- --desde <migration>',
      '',
      'Em projeto novo, comece pela primeira:',
      `  npm run supabase:migrar -w @rolavinte/api -- --desde ${noDisco[0]?.replace(/\.sql$/, '') ?? ''}`,
      '',
    ].join('\n'),
  );
  await cliente.end();
  process.exit(1);
}

if (pendentes.length === 0) {
  console.log('\nNada pendente — banco e disco conferem.\n');
  await cliente.end();
  process.exit(0);
}

console.log(`\n${pendentes.length} migration(s) pendente(s):\n`);

for (const arquivo of pendentes) {
  const nome = arquivo.replace(/\.sql$/, '');
  const sql = readFileSync(join(DIR_MIGRATIONS, arquivo), 'utf8');
  try {
    await cliente.query('begin');
    await cliente.query(sql);
    // A 0006 é quem cria o registro; as anteriores a ela não têm onde anotar.
    if (await registroExiste()) {
      await cliente.query(
        'insert into migrations_aplicadas (nome) values ($1) on conflict (nome) do nothing',
        [nome],
      );
    }
    await cliente.query('commit');
    console.log(`  ✓ ${nome}`);
  } catch (erro) {
    await cliente.query('rollback');
    console.error(`  ✗ ${nome} — ${erro.message}`);
    console.error('\nEsta migration foi desfeita por inteiro. As anteriores continuam aplicadas.');
    console.error('Corrija o arquivo e rode de novo: as já aplicadas serão puladas.\n');
    await cliente.end();
    process.exit(1);
  }
}

await cliente.end();
console.log('\nTodas aplicadas. Confirme com: npm run supabase:verificar -w @rolavinte/api\n');
