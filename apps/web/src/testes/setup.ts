import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

/**
 * Setup global da suíte do front.
 *
 * Quatro garantias, nesta ordem de importância:
 * 1. Nenhum teste abre websocket: `socket.io-client` é substituído por um duplo
 *    inerte. `lib/socket.ts` chama `io('/')` na primeira `obterSocket()`, e sem
 *    este mock a suíte tentaria conectar de verdade e travaria por timeout.
 * 2. `localStorage` é um armazenamento em memória controlado por nós (ver
 *    abaixo) — é onde o `persist` do Zustand grava `rolavinte-sessao`.
 * 3. Nenhum teste vaza estado para o seguinte: o armazenamento é limpo e o DOM
 *    é desmontado depois de cada caso.
 * 4. `scrollIntoView` existe: o jsdom não implementa, e componentes que rolam a
 *    lista de mensagens quebrariam com `TypeError` fora do que está sob teste.
 */

vi.mock('socket.io-client', () => {
  const socketInerte = {
    connected: false,
    auth: {},
    on: () => socketInerte,
    off: () => socketInerte,
    emit: () => socketInerte,
    connect: () => socketInerte,
    disconnect: () => socketInerte,
  };
  return { io: () => socketInerte, Socket: class {} };
});

/**
 * A partir do Node 24 existe um `localStorage` nativo em `globalThis` que
 * sombreia o do jsdom e, sem `--localstorage-file`, não é utilizável (`clear`
 * e `setItem` não são funções). Em vez de depender da versão do runtime,
 * instalamos um armazenamento em memória — determinístico e isolado por
 * arquivo de teste. Precisa acontecer antes de qualquer import de store, pois
 * o `persist` do Zustand captura o storage na criação da store.
 */
function criarArmazenamentoDeMemoria(): Storage {
  const itens = new Map<string, string>();
  return {
    get length() {
      return itens.size;
    },
    clear: () => itens.clear(),
    getItem: (chave: string) => itens.get(chave) ?? null,
    key: (indice: number) => [...itens.keys()][indice] ?? null,
    removeItem: (chave: string) => {
      itens.delete(chave);
    },
    setItem: (chave: string, valor: string) => {
      itens.set(chave, String(valor));
    },
  } as Storage;
}

Object.defineProperty(globalThis, 'localStorage', {
  value: criarArmazenamentoDeMemoria(),
  configurable: true,
  writable: true,
});

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {
    /* jsdom não implementa rolagem; o teste só precisa que a chamada não quebre. */
  };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});
