#!/usr/bin/env node
/**
 * Confere se o projeto Supabase apontado pelo `.env` está pronto para a API
 * subir: migrations aplicadas e buckets de Storage provisionados.
 *
 * Existe porque "o código está implementado" e "o ambiente está preparado" são
 * estados diferentes, e confundi-los custa caro: a API sobe feliz e falha na
 * primeira consulta.
 *
 * A PRIMEIRA VERSÃO DESTE SCRIPT TINHA EXATAMENTE ESSE DEFEITO. Ela conferia
 * uma lista de tabelas e colunas escrita à mão; quando a migration 0005 chegou,
 * o script não sabia que ela existia e respondeu "Ambiente pronto" com o chat
 * inteiro quebrado contra o banco real. Agora a verificação é DERIVADA: os
 * arquivos em supabase/migrations/ são comparados com as linhas de
 * `migrations_aplicadas`. Arquivo novo sem linha é denunciado sozinho, sem
 * ninguém precisar lembrar de atualizar este script.
 *
 *   npm run supabase:verificar -w @rolavinte/api
 */
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !chave) {
  console.error('\n[verificar] Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Preencha apps/api/.env — veja o README.\n');
  process.exit(1);
}
if (chave.startsWith('sb_publishable_')) {
  console.error('\n[verificar] A chave é publicável. Use a secreta (sb_secret_…).\n');
  process.exit(1);
}

const DIR_MIGRATIONS = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'supabase',
  'migrations',
);
const noDisco = readdirSync(DIR_MIGRATIONS)
  .filter((nome) => nome.endsWith('.sql'))
  .map((nome) => nome.replace(/\.sql$/, ''))
  .sort();

const sb = createClient(url, chave, { auth: { persistSession: false } });
const BUCKETS_ESPERADOS = ['mapas', 'tokens'];

console.log(`\nVerificando ${url}\n`);

let falhas = 0;
let falhasSemPendentes = false;
const pendentes = [];

const { data: linhas, error: erroRegistro } = await sb.from('migrations_aplicadas').select('nome');

if (erroRegistro) {
  // Sem a tabela de registro não dá para afirmar nada sobre o schema. Dizer
  // "pronto" aqui seria repetir o defeito que este script existe para evitar.
  console.log('  ✗ migrations_aplicadas não existe — o registro de migrations nunca foi criado.');
  console.log(`    (${erroRegistro.message})`);
  console.log('');
  console.log('    Sem o registro é impossível afirmar o que já foi aplicado, e dizer');
  console.log('    "pronto" aqui repetiria o defeito que este script existe para evitar.');
  console.log('    A 0006 cria o registro e retroage as anteriores, então:');
  console.log('');
  console.log('    · Projeto novo, nada aplicado:');
  console.log('        npm run supabase:sql -w @rolavinte/api');
  console.log('    · Schema já parcialmente aplicado (o caso comum):');
  console.log('        npm run supabase:sql -w @rolavinte/api -- --desde <primeira-que-falta>');
  console.log('      Migration aplicada é imutável — não reaplique as que já passaram.');
  falhasSemPendentes = true;
  falhas++;
} else {
  const aplicadas = new Set((linhas ?? []).map((l) => l.nome));
  for (const nome of noDisco) {
    if (aplicadas.has(nome)) {
      console.log(`  ✓ ${nome}`);
    } else {
      console.log(`  ✗ ${nome} — no disco, não aplicada`);
      pendentes.push(nome);
      falhas++;
    }
  }
  const orfas = [...aplicadas].filter((nome) => !noDisco.includes(nome));
  for (const nome of orfas) {
    // Banco à frente do código: quem subir esta versão trabalha contra um
    // schema que não sabe descrever.
    console.log(`  ! ${nome} — aplicada no banco, sem arquivo no disco`);
  }
}

const { data: buckets, error: erroBuckets } = await sb.storage.listBuckets();
if (erroBuckets) {
  falhas++;
  console.log(`\n  ✗ Storage inacessível: ${erroBuckets.message}`);
} else {
  const nomes = new Set((buckets ?? []).map((b) => b.name));
  for (const esperado of BUCKETS_ESPERADOS) {
    if (nomes.has(esperado)) {
      console.log(`  ✓ bucket ${esperado}`);
    } else {
      falhas++;
      console.log(`  ✗ bucket ${esperado} não existe (configurar-storage.sql)`);
    }
  }
}

if (falhas > 0) {
  const linhasErro = ['', `${falhas} verificação(ões) falharam. O ambiente NÃO está pronto.`, ''];
  if (falhasSemPendentes) {
    // A orientação já foi impressa acima, com a ressalva de imutabilidade.
    console.error(linhasErro.join('\n'));
    process.exit(1);
  }
  if (pendentes.length > 0) {
    linhasErro.push('Migrations pendentes, nesta ordem:');
    linhasErro.push(...pendentes.map((n) => `  - ${n}.sql`));
    linhasErro.push('');
    linhasErro.push('Gere só o que falta e cole no SQL Editor do Supabase:');
    linhasErro.push(`  npm run supabase:sql -w @rolavinte/api -- --desde ${pendentes[0]}`);
    linhasErro.push('');
  }
  console.error(linhasErro.join('\n'));
  process.exit(1);
}

console.log('\nAmbiente pronto: migrations aplicadas e Storage confere.\n');
