import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AtualizarPersonagemEntrada,
  CriarPersonagemEntrada,
  PersonagemDTO,
} from '@rolavinte/shared';
import { requisitar } from '@/lib/api';

export function usePersonagens(mesaId: string) {
  return useQuery({
    queryKey: ['personagens', mesaId],
    queryFn: () => requisitar<PersonagemDTO[]>(`/mesas/${mesaId}/personagens`),
  });
}

export function useCriarPersonagem(mesaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entrada: CriarPersonagemEntrada) =>
      requisitar<PersonagemDTO>(`/mesas/${mesaId}/personagens`, { metodo: 'POST', corpo: entrada }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['personagens', mesaId] }),
  });
}

export function useAtualizarPersonagem(mesaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: { personagemId: string; campos: AtualizarPersonagemEntrada }) =>
      requisitar<PersonagemDTO>(`/personagens/${dados.personagemId}`, {
        metodo: 'PATCH',
        corpo: dados.campos,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['personagens', mesaId] }),
  });
}
