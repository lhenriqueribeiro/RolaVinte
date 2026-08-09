import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ProvedorNotificacoes } from '@/components/ui/Notificacao';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {/* Fila de toasts do RV-122: dentro do Query para que qualquer hook de
          mutação possa confirmar sucesso sem plumbing por props. */}
      <ProvedorNotificacoes>{children}</ProvedorNotificacoes>
    </QueryClientProvider>
  );
}
