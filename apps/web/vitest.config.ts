import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * Configuração do runner do front, separada do `vite.config.ts` de propósito:
 * a suíte não precisa do plugin do Tailwind nem do proxy de desenvolvimento,
 * e nenhum teste pode depender de rede (sem `server.proxy`, sem socket real).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/testes/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
  },
});
