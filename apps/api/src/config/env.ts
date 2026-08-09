import { z } from 'zod';

const esquemaEnv = z.object({
  PORTA: z.coerce.number().int().default(3333),
  ORIGEM_WEB: z.string().url().default('http://localhost:5173'),
  JWT_SEGREDO: z.string().min(16, 'JWT_SEGREDO precisa de pelo menos 16 caracteres'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_REMETENTE: z.string().default('RolaVinte <onboarding@resend.dev>'),
  // Endurecimento HTTP (RV-004). Janela em milissegundos.
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_MAX_AUTH: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_JANELA: z.coerce.number().int().positive().default(60_000),
});

export type Env = z.infer<typeof esquemaEnv>;

const PREFIXO_CHAVE_PUBLICAVEL = 'sb_publishable_';

/** Papel declarado numa chave legada (JWT). `null` se não for JWT ou não der para ler. */
function papelDaChaveLegada(chave: string): string | null {
  const partes = chave.split('.');
  if (partes.length !== 3 || partes[1] === undefined) return null;
  try {
    const payload: unknown = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
    if (
      payload !== null &&
      typeof payload === 'object' &&
      'role' in payload &&
      typeof payload.role === 'string'
    ) {
      return payload.role;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * O backend é a única fronteira com o banco e o RLS está em deny-all para
 * `anon`/`authenticated` (migration 0001). Com uma chave publicável a API sobe
 * normalmente e **toda** consulta volta vazia — sintoma caro de diagnosticar.
 * Aqui isso vira falha na partida.
 *
 * Devolve o motivo da recusa, ou `null` quando a chave serve.
 */
export function motivoChaveSupabaseInvalida(chave: string): string | null {
  if (chave.startsWith(PREFIXO_CHAVE_PUBLICAVEL)) {
    return 'ela é publicável (sb_publishable_…), feita para o navegador';
  }
  const papel = papelDaChaveLegada(chave);
  if (papel !== null && papel !== 'service_role') {
    return `ela declara o papel "${papel}"`;
  }
  return null;
}

/** Único ponto do sistema que lê process.env. Env inválido derruba o processo (fail fast). */
export function carregarEnv(): Env {
  const resultado = esquemaEnv.safeParse(process.env);
  if (!resultado.success) {
    const problemas = resultado.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error(`\n[config] Variáveis de ambiente inválidas:\n${problemas}\n`);
    console.error('Copie .env.example para apps/api/.env e preencha os valores.\n');
    process.exit(1);
  }

  const motivo = motivoChaveSupabaseInvalida(resultado.data.SUPABASE_SERVICE_ROLE_KEY);
  if (motivo !== null) {
    console.error(
      [
        '',
        '[config] SUPABASE_SERVICE_ROLE_KEY não serve: ' + motivo + '.',
        '',
        'O backend é a única fronteira com o banco e o RLS está em deny-all para',
        'anon/authenticated. Com essa chave a API sobe e toda consulta volta vazia.',
        '',
        'Pegue a chave secreta em: Supabase → Project Settings → API Keys → secret',
        '(formato sb_secret_… ; no projeto legado, a service_role).',
        'Cole direto em apps/api/.env — o arquivo está no .gitignore.',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  return resultado.data;
}
