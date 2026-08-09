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
 *   npm run supabase:sql -w @rolavinte/api          # ver na tela
 *   npm run supabase:sql -w @rolavinte/api > tudo.sql
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ_API = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR_MIGRATIONS = join(RAIZ_API, 'supabase', 'migrations');

const migrations = readdirSync(DIR_MIGRATIONS)
  .filter((nome) => nome.endsWith('.sql'))
  .sort(); // a numeração NNNN_ garante a ordem correta

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
    '-- As migrations são imutáveis depois de aplicadas: rode isto só em projeto novo.',
    '',
    ...saida,
  ].join('\n'),
);
