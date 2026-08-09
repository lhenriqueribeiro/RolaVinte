// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Lint do RolaVinte — estilo + fronteiras de arquitetura.
 *
 * As fronteiras de `.claude/rules/01-arquitetura.md` são codificadas com a regra
 * nativa `no-restricted-imports` em overrides por diretório. Cada fronteira
 * bloqueia duas coisas:
 *   1. pacotes de framework/infra (fastify, @supabase/*, resend, socket.io);
 *   2. caminhos relativos e com alias que atravessam camadas (`../infra/...`).
 *
 * Caminhos relativos são casados por `regex` (e não por `group`, que usa glob
 * estilo gitignore) porque `..` em glob é frágil e a intenção fica ilegível.
 */

/**
 * Pacotes que jamais podem aparecer em domínio, aplicação ou contratos.
 * O escopo `@supabase/*` é tratado por regex logo abaixo (pega os subpacotes).
 */
const PACOTES_DE_INFRAESTRUTURA = [
  'fastify',
  '@fastify/cors',
  'resend',
  'socket.io',
  'socket.io-client',
  'bcryptjs',
  'jose',
];

/** Barra qualquer pacote do escopo do Supabase (`@supabase/supabase-js`, etc.). */
const ESCOPO_SUPABASE = '^@supabase/';

/**
 * Monta uma entrada `patterns` para `no-restricted-imports` que barra qualquer
 * import (relativo ou absoluto) que aponte para a camada informada.
 *
 * @param {string} camada nome do diretório da camada (ex.: `infra`)
 * @param {string} mensagem explicação exibida no erro
 */
function barrarCamada(camada, mensagem) {
  return {
    // Casa `./infra/x`, `../infra/x`, `../../infra`, `src/infra/x`, `@/infra/x`.
    regex: `(^|/)${camada}(/|$)`,
    message: mensagem,
  };
}

/** @param {string} destino @param {string} origem */
function mensagemFronteira(destino, origem) {
  return `Violação da regra de dependência: ${origem} não pode importar de "${destino}". As dependências apontam sempre para dentro (apresentacao/infra → aplicacao → dominio). Use uma port em aplicacao/ports.`;
}

/** @param {string} origem */
function mensagemPacote(origem) {
  return `Violação da regra de dependência: ${origem} não pode importar frameworks nem SDKs de infraestrutura. Declare uma port em aplicacao/ports e implemente o adapter em infra/.`;
}

export default tseslint.config(
  {
    name: 'rolavinte/ignores',
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/*.d.ts',
      'apps/web/src/vite-env.d.ts',
    ],
  },

  // ── Base: JS + TypeScript para todo o monorepo ──────────────────────
  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    name: 'rolavinte/base',
    files: ['**/*.{ts,tsx,js}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      // `any` é proibido pelo guardrail 09 — use `unknown` + narrowing.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'object-shorthand': ['error', 'properties'],
    },
  },

  // ── Regras com informação de tipo ───────────────────────────────────
  // Só para o código dos workspaces (que está coberto por um tsconfig);
  // arquivos de configuração na raiz ficam de fora de propósito.
  {
    name: 'rolavinte/type-aware',
    files: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Promise esquecida = evento perdido / erro silencioso. É bug, não estilo.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      // `no-unnecessary-type-assertion` fica DESLIGADA de propósito: o
      // supabase-js sem tipos gerados devolve `any`, e toda asserção que
      // estreita `any` para uma Row (`data as RowMesa`) é classificada como
      // "desnecessária". Removê-las apagaria a única tipagem que existe na
      // fronteira com o banco — exatamente o oposto do guardrail 07.
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
    },
  },

  // ── Backend (apps/api) ──────────────────────────────────────────────
  {
    name: 'rolavinte/api',
    files: ['apps/api/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Fronteira: dominio/ é o núcleo — não conhece ninguém.
  {
    name: 'rolavinte/fronteira-dominio',
    files: ['apps/api/src/dominio/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: PACOTES_DE_INFRAESTRUTURA.map((name) => ({
            name,
            message: mensagemPacote('dominio/'),
          })),
          patterns: [
            barrarCamada('aplicacao', mensagemFronteira('aplicacao', 'dominio/')),
            barrarCamada('infra', mensagemFronteira('infra', 'dominio/')),
            barrarCamada('apresentacao', mensagemFronteira('apresentacao', 'dominio/')),
            barrarCamada('config', mensagemFronteira('config', 'dominio/')),
            { regex: ESCOPO_SUPABASE, message: mensagemPacote('dominio/') },
          ],
        },
      ],
    },
  },

  // Fronteira: aplicacao/ conhece dominio e shared, nada de infra/apresentacao.
  {
    name: 'rolavinte/fronteira-aplicacao',
    files: ['apps/api/src/aplicacao/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: PACOTES_DE_INFRAESTRUTURA.map((name) => ({
            name,
            message: mensagemPacote('aplicacao/'),
          })),
          patterns: [
            barrarCamada('infra', mensagemFronteira('infra', 'aplicacao/')),
            barrarCamada('apresentacao', mensagemFronteira('apresentacao', 'aplicacao/')),
            barrarCamada('config', mensagemFronteira('config', 'aplicacao/')),
            { regex: ESCOPO_SUPABASE, message: mensagemPacote('aplicacao/') },
          ],
        },
      ],
    },
  },

  // Fronteira: infra/ implementa ports; nunca depende da apresentação.
  {
    name: 'rolavinte/fronteira-infra',
    files: ['apps/api/src/infra/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [barrarCamada('apresentacao', mensagemFronteira('apresentacao', 'infra/'))],
        },
      ],
    },
  },

  // Fronteira: apresentacao/ fala com aplicacao; a infra só é montada no
  // composition root (main.ts), que fica fora deste diretório.
  {
    name: 'rolavinte/fronteira-apresentacao',
    files: ['apps/api/src/apresentacao/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [barrarCamada('infra', mensagemFronteira('infra', 'apresentacao/'))],
        },
      ],
    },
  },

  // ── Contratos compartilhados (packages/shared) ──────────────────────
  // Puro: schemas Zod, tipos e motor de dados. Sem runtime de servidor nem DOM.
  {
    name: 'rolavinte/shared',
    files: ['packages/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: PACOTES_DE_INFRAESTRUTURA.map((name) => ({
            name,
            message: mensagemPacote('packages/shared/'),
          })),
          patterns: [{ regex: ESCOPO_SUPABASE, message: mensagemPacote('packages/shared/') }],
        },
      ],
    },
  },

  // ── Frontend (apps/web) ─────────────────────────────────────────────
  {
    name: 'rolavinte/web',
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
      // Dependência esquecida em hook é bug real, não estilo: falha o build.
      'react-hooks/exhaustive-deps': 'error',
    },
  },

  // Fronteira: componentes de apresentação não falam com o socket direto —
  // só hooks de feature (guardrail 06-frontend.md).
  {
    name: 'rolavinte/fronteira-web-components',
    files: ['apps/web/src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)lib/socket$',
              message:
                'Componentes de UI não importam lib/socket. Encapsule o tempo real num hook da feature (ex.: features/jogo/use-socket-mesa) e receba os dados por props.',
            },
            {
              regex: '^socket\\.io-client$',
              message:
                'Componentes de UI não falam com o socket.io direto. Use um hook da feature correspondente.',
            },
            {
              regex: '(^|/)features/',
              message:
                'components/ui contém primitivos reutilizáveis: não pode depender de uma feature. Inverta a dependência com props.',
            },
          ],
        },
      ],
    },
  },

  // ── Testes ──────────────────────────────────────────────────────────
  {
    name: 'rolavinte/testes',
    files: ['**/*.test.{ts,tsx}', 'apps/api/src/testes/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // ── Arquivos de configuração na raiz dos workspaces ─────────────────
  {
    name: 'rolavinte/config-files',
    files: ['*.js', '*.ts', 'apps/*/vite.config.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Prettier por último: desliga regras de estilo que conflitam com o formatador.
  prettier,
);
