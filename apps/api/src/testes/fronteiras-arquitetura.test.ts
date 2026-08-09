import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * Prova executável de que a regra de dependência de `.claude/rules/01-arquitetura.md`
 * é mecânica, e não apenas documental.
 *
 * Cada caso grava um arquivo-fixture com um import proibido, roda o ESLint de
 * verdade sobre ele e exige que `no-restricted-imports` acuse a violação. Se
 * alguém afrouxar `eslint.config.js`, este teste fica vermelho.
 */

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/** Nome distinto o bastante para nunca colidir com código real. */
const ARQUIVO_FIXTURE = '__fixture-fronteira-arquitetura.ts';

interface CasoDeFronteira {
  /** Diretório da camada de origem, relativo à raiz do monorepo. */
  camada: string;
  /** Import que a camada não pode fazer. */
  importProibido: string;
}

const CASOS: CasoDeFronteira[] = [
  { camada: 'apps/api/src/dominio', importProibido: '@supabase/supabase-js' },
  { camada: 'apps/api/src/dominio', importProibido: 'fastify' },
  { camada: 'apps/api/src/dominio', importProibido: 'socket.io' },
  { camada: 'apps/api/src/dominio', importProibido: 'resend' },
  { camada: 'apps/api/src/dominio', importProibido: '../aplicacao/mesas/criar-mesa' },
  { camada: 'apps/api/src/dominio', importProibido: '../infra/supabase/cliente' },
  { camada: 'apps/api/src/dominio', importProibido: '../apresentacao/ws/gateway-jogo' },
  { camada: 'apps/api/src/aplicacao', importProibido: '@supabase/supabase-js' },
  { camada: 'apps/api/src/aplicacao', importProibido: 'fastify' },
  { camada: 'apps/api/src/aplicacao', importProibido: '../infra/supabase/cliente' },
  { camada: 'apps/api/src/aplicacao', importProibido: '../apresentacao/ws/gateway-jogo' },
  { camada: 'apps/api/src/infra', importProibido: '../apresentacao/ws/gateway-jogo' },
  { camada: 'apps/api/src/apresentacao', importProibido: '../infra/supabase/cliente' },
  { camada: 'apps/web/src/components/ui', importProibido: '@/lib/socket' },
  { camada: 'apps/web/src/components/ui', importProibido: '../../lib/socket' },
];

const criados: string[] = [];

/** Grava o fixture, linta e devolve as regras acusadas. */
async function regrasAcusadas(caso: CasoDeFronteira): Promise<string[]> {
  const caminho = join(RAIZ, caso.camada, ARQUIVO_FIXTURE);
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, `import '${caso.importProibido}';\n`, 'utf8');
  criados.push(caminho);

  try {
    const eslint = new ESLint({ cwd: RAIZ });
    const [resultado] = await eslint.lintFiles([caminho]);
    return (resultado?.messages ?? []).map((m) => m.ruleId ?? '');
  } finally {
    rmSync(caminho, { force: true });
  }
}

afterAll(() => {
  // Rede de segurança: se um caso abortar no meio, nenhum fixture sobrevive
  // para quebrar o `npm run check` de quem vier depois.
  for (const caminho of criados) rmSync(caminho, { force: true });
});

describe('fronteiras de arquitetura no lint', () => {
  for (const caso of CASOS) {
    it(`barra "${caso.importProibido}" em ${caso.camada}`, async () => {
      expect(await regrasAcusadas(caso)).toContain('no-restricted-imports');
    }, 60_000);
  }

  it('permite import legítimo de dominio dentro de aplicacao', async () => {
    const regras = await regrasAcusadas({
      camada: 'apps/api/src/aplicacao',
      importProibido: '../dominio/compartilhado/resultado',
    });
    expect(regras).not.toContain('no-restricted-imports');
  }, 60_000);
});
