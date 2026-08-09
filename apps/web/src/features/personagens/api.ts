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

/**
 * Exclusão de ficha (RV-093) — `DELETE /personagens/:id`, 204 sem corpo.
 *
 * Invalida **duas** queries. A lista de personagens é óbvia. A cena entra
 * porque `tokens.personagem_id` é `on delete set null`: a peça continua no mapa
 * e perde o vínculo no banco, e sem o refetch o cache do tabletop seguiria
 * apontando para uma ficha que não existe mais. A barra de vida some sozinha
 * nos dois casos — ela é derivada do `PersonagemDTO`, nunca do token.
 *
 * Não há evento de tempo real para exclusão de ficha: quem está com a mesa
 * aberta em outra aba só vê a mudança ao recarregar. O diálogo de confirmação
 * diz isso com todas as letras em vez de prometer o que o backend não cumpre.
 */
export function useRemoverPersonagem(mesaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (personagemId: string) =>
      requisitar<void>(`/personagens/${personagemId}`, { metodo: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['personagens', mesaId] });
      await queryClient.invalidateQueries({ queryKey: ['cena', mesaId] });
    },
  });
}

/**
 * Duplicação de ficha (RV-093) — `POST /personagens/:id/duplicar`, 201 com o
 * `PersonagemDTO` da cópia.
 *
 * `corpo: {}` de propósito, pelo mesmo motivo de `useAtivarCena`: a rota não lê
 * o corpo, mas o cliente central sempre manda `Content-Type: application/json`,
 * e o Fastify recusa um POST com esse cabeçalho e corpo vazio antes de chegar à
 * rota (RV-029).
 *
 * A cópia pertence ao dono do original, não a quem clicou — quando o mestre
 * duplica a ficha de um jogador, ela continua sendo do jogador.
 */
export function useDuplicarPersonagem(mesaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (personagemId: string) =>
      requisitar<PersonagemDTO>(`/personagens/${personagemId}/duplicar`, {
        metodo: 'POST',
        corpo: {},
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['personagens', mesaId] }),
  });
}
