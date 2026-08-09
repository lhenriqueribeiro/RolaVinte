#!/usr/bin/env node
/**
 * Imprime, em ordem, todo o SQL necessário para preparar um projeto Supabase
 * novo: as migrations de `supabase/migrations/` seguidas do provisionamento de
 * Storage.
 *
 * Existe para não haver um arquivo "instalação completa" versionado em paralelo
 * às migrations — duas fontes de verdade para o mesmo schema divergiriam na
 * primeira migration nova. Aqui a saída é sempre derivada dos arquivos reais.
 *
 *   npm run supabase:sql -w @rolavinte/api                       # tudo
 *   npm run supabase:sql -w @rolavinte/api -- --desde 0005_chat  # só a partir dela
 *
 * `--desde` existe para o banco já parcialmente preparado: migration aplicada é
 * imutável, então reaplicar as anteriores é erro. O `supabase:verificar` imprime
 * o comando exato com a primeira pendente já preenchida.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ_API = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR_MIGRATIONS = join(RAIZ_API, 'supabase', 'migrations');

const todas = readdirSync(DIR_MIGRATIONS)
  .filter((nome) => nome.endsWith('.sql'))
  .sort(); // a numeração NNNN_ garante a ordem correta

const indiceDesde = process.argv.indexOf('--desde');
const desde = indiceDesde === -1 ? null : process.argv[indiceDesde + 1]?.replace(/\.sql$/, '');

if (desde !== null && !todas.some((nome) => nome.startsWith(desde))) {
  process.stderr.write(`\n[sql] Migration "${desde}" não existe. Disponíveis:\n`);
  process.stderr.write(todas.map((n) => `  - ${n}\n`).join(''));
  process.exit(1);
}

const primeira = desde === null ? 0 : todas.findIndex((nome) => nome.startsWith(desde));
const migrations = todas.slice(primeira);

const partes = [
  ...migrations.map((nome) => ({
    titulo: `migrations/${nome}`,
    caminho: join(DIR_MIGRATIONS, nome),
  })),
  {
    titulo: 'configurar-storage.sql',
    caminho: join(RAIZ_API, 'supabase', 'configurar-storage.sql'),
  },
];

const saida = partes.map(({ titulo, caminho }) => {
  const barra = '-'.repeat(70);
  return `-- ${barra}\n-- ${titulo}\n-- ${barra}\n\n${readFileSync(caminho, 'utf8').trim()}\n`;
});

process.stdout.write(
  [
    '-- RolaVinte — SQL de instalação, gerado por scripts/sql-de-instalacao.mjs',
    '-- Cole no SQL Editor do Supabase e execute de uma vez.',
    desde === null
      ? '-- Todas as migrations. Migration aplicada é imutável: rode isto só em projeto novo.'
      : `-- Somente a partir de ${desde}. O provisionamento de Storage é idempotente e vai junto.`,
    '',
    ...saida,
  ].join('\n'),
);
