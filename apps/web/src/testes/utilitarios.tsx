import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactElement, ReactNode } from 'react';
import { ProvedorNotificacoes } from '@/components/ui/Notificacao';

/**
 * QueryClient isolado por teste: sem retry (falha da API vira erro na hora, e
 * não depois de 3 tentativas) e sem log de erro poluindo a saída da suíte.
 */
export function criarQueryClientDeTeste(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

/** Envolve o componente nos provedores reais da aplicação (Query + roteador). */
export function renderizarComProvedores(
  elemento: ReactElement,
  opcoes: { queryClient?: QueryClient; rota?: string } = {},
): RenderResult & { queryClient: QueryClient } {
  const queryClient = opcoes.queryClient ?? criarQueryClientDeTeste();

  function Provedores({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {/* Mesmos provedores de `app/providers.tsx`: sem o de notificações,
            todo componente que chamasse `useNotificar` quebraria só no teste. */}
        <ProvedorNotificacoes>
          <MemoryRouter initialEntries={[opcoes.rota ?? '/']}>{children}</MemoryRouter>
        </ProvedorNotificacoes>
      </QueryClientProvider>
    );
  }

  // `Object.assign` em vez de spread: o spread perde as queries ligadas do
  // Testing Library (elas vêm de um tipo mapeado genérico em `RenderResult`).
  return Object.assign(render(elemento, { wrapper: Provedores }), { queryClient });
}

/** Wrapper para `renderHook` — só o provedor do TanStack Query. */
export function criarWrapperQuery(queryClient: QueryClient) {
  return function WrapperQuery({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}
