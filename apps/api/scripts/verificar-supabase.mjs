#!/usr/bin/env node
/**
 * Confere se o projeto Supabase apontado pelo `.env` está pronto para a API
 * subir: schema aplicado (por migration) e buckets de Storage provisionados.
 *
 * Existe porque "o código está implementado" e "o ambiente está preparado" são
 * estados diferentes, e confundi-los custa caro — a API sobe feliz e falha na
 * primeira consulta. Cada verificação abaixo aponta a migration que a satisfaz,
 * para que uma aplicação parcial seja diagnosticada, não adivinhada.
 *
 *   npm run supabase:verificar -w @rolavinte/api
 */
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

const sb = createClient(url, chave, { auth: { persistSession: false } });

/** Cada item cita as colunas introduzidas pela migration que o cobre. */
const VERIFICACOES = [
  { migration: '0001', tabela: 'usuarios', colunas: 'id, email, senha_hash' },
  { migration: '0001', tabela: 'mesa_jogadores', colunas: 'mesa_id, usuario_id, papel' },
  { migration: '0001', tabela: 'personagens', colunas: 'id, dono_id, atributos' },
  { migration: '0001', tabela: 'mensagens', colunas: 'id, mesa_id, tipo, rolagem' },
  { migration: '0002', tabela: 'mesas', colunas: 'id, mestre_id, encerrada_em' },
  { migration: '0002', tabela: 'convites', colunas: 'id, token, status' },
  { migration: '0003', tabela: 'cenas', colunas: 'id, imagem_fundo_url, tamanho_celula, cor_grid' },
  { migration: '0004', tabela: 'tokens', colunas: 'id, imagem_url, imagem_caminho' },
];

const BUCKETS_ESPERADOS = ['mapas', 'tokens'];

let falhas = 0;

console.log(`\nVerificando ${url}\n`);

for (const { migration, tabela, colunas } of VERIFICACOES) {
  const { error } = await sb.from(tabela).select(colunas).limit(0);
  if (error) {
    falhas++;
    console.log(`  ✗ ${tabela.padEnd(16)} (migration ${migration})  ${error.message}`);
  } else {
    console.log(`  ✓ ${tabela.padEnd(16)} (migration ${migration})`);
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
  console.error(
    [
      '',
      `${falhas} verificação(ões) falharam. O ambiente NÃO está pronto.`,
      '',
      'Gere o SQL e cole no SQL Editor do Supabase:',
      '  npm run supabase:sql -w @rolavinte/api',
      '',
      'Se parte já foi aplicada, rode apenas os arquivos que faltam —',
      'migrations aplicadas são imutáveis.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

console.log('\nAmbiente pronto: schema e Storage conferem.\n');
