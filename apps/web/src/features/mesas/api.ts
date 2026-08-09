import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AtualizarMesaEntrada,
  ConviteDTO,
  ConvitePublicoDTO,
  CriarMesaEntrada,
  MesaDetalheDTO,
  MesaDTO,
} from '@rolavinte/shared';
import { requisitar } from '@/lib/api';

export function useMesas() {
  return useQuery({
    queryKey: ['mesas'],
    queryFn: () => requisitar<MesaDTO[]>('/mesas'),
  });
}

export function useMesa(mesaId: string) {
  return useQuery({
    queryKey: ['mesa', mesaId],
    queryFn: () => requisitar<MesaDetalheDTO>(`/mesas/${mesaId}`),
  });
}

export function useCriarMesa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entrada: CriarMesaEntrada) =>
      requisitar<MesaDTO>('/mesas', { metodo: 'POST', corpo: entrada }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mesas'] }),
  });
}

/** Edição de nome, descrição e sistema (RV-024). */
export function useAtualizarMesa(mesaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entrada: AtualizarMesaEntrada) =>
      requisitar<MesaDTO>(`/mesas/${mesaId}`, { metodo: 'PATCH', corpo: entrada }),
    onSuccess: (mesa) => {
      // O PATCH devolve o `MesaDTO`; o detalhe em cache tem os jogadores junto.
      queryClient.setQueryData<MesaDetalheDTO>(['mesa', mesaId], (atual) =>
        atual ? { ...atual, ...mesa } : atual,
      );
      return queryClient.invalidateQueries({ queryKey: ['mesas'] });
    },
  });
}

/** Encerramento (arquivamento) da mesa pelo mestre (RV-023). */
export function useEncerrarMesa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mesaId: string) =>
      requisitar<void>(`/mesas/${mesaId}/encerrar`, { metodo: 'POST' }),
    onSuccess: async (_dados, mesaId) => {
      await queryClient.invalidateQueries({ queryKey: ['mesa', mesaId] });
      await queryClient.invalidateQueries({ queryKey: ['mesas'] });
    },
  });
}

/** Saída voluntária do jogador (RV-022). */
export function useSairDaMesa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mesaId: string) => requisitar<void>(`/mesas/${mesaId}/sair`, { metodo: 'POST' }),
    onSuccess: (_dados, mesaId) => {
      // A mesa deixou de ser acessível: o detalhe em cache viraria uma mentira.
      queryClient.removeQueries({ queryKey: ['mesa', mesaId] });
      return queryClient.invalidateQueries({ queryKey: ['mesas'] });
    },
  });
}

/** Remoção de um jogador pelo mestre (RV-021). */
export function useRemoverJogador(mesaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (usuarioId: string) =>
      requisitar<void>(`/mesas/${mesaId}/jogadores/${usuarioId}`, { metodo: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mesa', mesaId] });
      await queryClient.invalidateQueries({ queryKey: ['mesas'] });
    },
  });
}

/** Histórico de convites da mesa — só o mestre tem acesso (RV-020). */
export function useConvites(mesaId: string, habilitado = true) {
  return useQuery({
    queryKey: ['convites', mesaId],
    queryFn: () => requisitar<ConviteDTO[]>(`/mesas/${mesaId}/convites`),
    enabled: habilitado,
  });
}

export function useConvidarJogador(mesaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (email: string) =>
      requisitar<ConviteDTO>(`/mesas/${mesaId}/convites`, { metodo: 'POST', corpo: { email } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['convites', mesaId] }),
  });
}

export function useRevogarConvite(mesaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conviteId: string) =>
      requisitar<void>(`/mesas/${mesaId}/convites/${conviteId}`, { metodo: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['convites', mesaId] }),
  });
}

export function useConvitePublico(token: string) {
  return useQuery({
    queryKey: ['convite', token],
    queryFn: () => requisitar<ConvitePublicoDTO>(`/convites/${token}`),
    retry: false,
  });
}

export function useAceitarConvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      requisitar<{ mesaId: string }>('/convites/aceitar', { metodo: 'POST', corpo: { token } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mesas'] }),
  });
}
