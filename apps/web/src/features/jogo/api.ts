import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  AtualizarCenaEntrada,
  AtualizarTokenEntrada,
  CenaComTokensDTO,
  CenaDTO,
  MensagemDTO,
  TokenDTO,
} from '@rolavinte/shared';
import { CAMPO_IMAGEM_FUNDO, CAMPO_IMAGEM_TOKEN } from '@rolavinte/shared';
import { enviarArquivo, requisitar } from '@/lib/api';

export function useCenaAtiva(mesaId: string) {
  return useQuery({
    queryKey: ['cena', mesaId],
    queryFn: () => requisitar<CenaComTokensDTO>(`/mesas/${mesaId}/cena`),
  });
}

/**
 * Histórico do chat — a página mais recente (50 mensagens), de uma vez.
 *
 * **A rota já é paginada por cursor** (RV-073):
 * `GET /mesas/:mesaId/mensagens?antesDe=<iso>&antesDeId=<uuid>&limite=<n>`,
 * onde `antesDe`/`antesDeId` são o `criadoEm` e o `id` da mensagem mais antiga
 * já carregada — as duas metades vão juntas, ou a rota responde 400. Uma página
 * mais curta que o `limite` significa fim do histórico.
 *
 * Isto aqui ainda é `useQuery` porque o que falta do card é a tela: trocar por
 * `useInfiniteQuery`, carregar ao chegar no topo e compensar o `scrollTop` ao
 * prepender (`scrollTopAntes + (alturaDepois - alturaAntes)`). Enquanto isso não
 * existir, o chat mostra as 50 mais recentes — e não 100, como antes: o padrão
 * da rota é 50, com teto de 100.
 */
export function useMensagens(mesaId: string) {
  return useQuery({
    queryKey: ['mensagens', mesaId],
    queryFn: () => requisitar<MensagemDTO[]>(`/mesas/${mesaId}/mensagens`),
  });
}

/**
 * Toda linha digitada no chat sai por aqui (RV-074): texto cru, sem tipo.
 *
 * O servidor reinterpreta com o mesmo parser de `@rolavinte/shared` e despacha
 * pelo registry — fala, rolagem, sussurro e rolagem oculta chegam pela mesma
 * porta. Não existe mais um `useEnviarMensagem` ao lado: dois caminhos para
 * mandar uma fala eram duas gramáticas para manter em sincronia, que é
 * exatamente o que o RV-074 veio apagar. A resposta chega ao autor pelo
 * `mensagem:nova` do socket, então não há `setQueryData` aqui.
 */
export function useEnviarComandoChat(mesaId: string) {
  return useMutation({
    mutationFn: (texto: string) =>
      requisitar<MensagemDTO>(`/mesas/${mesaId}/chat`, {
        metodo: 'POST',
        corpo: { texto },
      }),
  });
}

export function useRolarDados(mesaId: string) {
  return useMutation({
    mutationFn: (entrada: { expressao: string; motivo?: string }) =>
      requisitar<MensagemDTO>(`/mesas/${mesaId}/rolagens`, {
        metodo: 'POST',
        corpo: { expressao: entrada.expressao, motivo: entrada.motivo ?? '' },
      }),
  });
}

/**
 * Lista de cenas preparadas na mesa (RV-030) — rota exclusiva do mestre, que
 * devolve 403 para jogador. Daí o `habilitado`: sem ele o painel do jogador
 * dispararia uma requisição garantidamente negada a cada montagem.
 */
export function useCenas(mesaId: string, habilitado = true) {
  return useQuery({
    queryKey: ['cenas', mesaId],
    queryFn: () => requisitar<CenaDTO[]>(`/mesas/${mesaId}/cenas`),
    enabled: habilitado,
  });
}

/**
 * Remenda os dois caches em que uma cena aparece, sem refetch: a lista do
 * gerenciador e — só quando é a cena em jogo — a cena do tabletop, preservando
 * os tokens já carregados.
 */
function aplicarCenaAtualizada(queryClient: QueryClient, mesaId: string, cena: CenaDTO) {
  queryClient.setQueryData<CenaDTO[]>(['cenas', mesaId], (atual) =>
    atual?.map((c) => (c.id === cena.id ? cena : c)),
  );
  queryClient.setQueryData<CenaComTokensDTO>(['cena', mesaId], (atual) =>
    atual && atual.cena?.id === cena.id ? { ...atual, cena } : atual,
  );
}

export function useCriarCena(mesaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entrada: { nome: string; larguraGrid: number; alturaGrid: number }) =>
      requisitar<CenaDTO>(`/mesas/${mesaId}/cenas`, { metodo: 'POST', corpo: entrada }),
    onSuccess: async () => {
      // A cena nova nasce ativa: o tabletop e a lista mudam juntos.
      await queryClient.invalidateQueries({ queryKey: ['cena', mesaId] });
      await queryClient.invalidateQueries({ queryKey: ['cenas', mesaId] });
    },
  });
}

/** Renomear e configurar o grid da cena (RV-030 / RV-033). */
export function useAtualizarCena(mesaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: { cenaId: string; campos: AtualizarCenaEntrada }) =>
      requisitar<CenaDTO>(`/cenas/${dados.cenaId}`, { metodo: 'PATCH', corpo: dados.campos }),
    onSuccess: (cena) => aplicarCenaAtualizada(queryClient, mesaId, cena),
  });
}

/** Exclusão de cena inativa (RV-030). A ativa e a única são recusadas com 409. */
export function useRemoverCena(mesaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cenaId: string) => requisitar<void>(`/cenas/${cenaId}`, { metodo: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cenas', mesaId] }),
  });
}

/** Troca da cena em jogo em um clique (RV-031). */
export function useAtivarCena(mesaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // `corpo: {}` de propósito: a rota não lê o corpo, mas o cliente central
    // sempre manda `Content-Type: application/json`, e um POST com esse
    // cabeçalho e corpo vazio é recusado pelo Fastify antes de chegar à rota.
    mutationFn: (cenaId: string) =>
      requisitar<CenaComTokensDTO>(`/cenas/${cenaId}/ativar`, { metodo: 'POST', corpo: {} }),
    onSuccess: (resposta) => {
      // A rota devolve cena **e** tokens: o mapa troca na hora, sem refetch e
      // sem passar por um estado intermediário de mapa vazio.
      queryClient.setQueryData<CenaComTokensDTO>(['cena', mesaId], resposta);
      return queryClient.invalidateQueries({ queryKey: ['cenas', mesaId] });
    },
  });
}

/** Upload da imagem de fundo da cena (RV-032). */
export function useDefinirFundoCena(mesaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: { cenaId: string; arquivo: File }) =>
      enviarArquivo<CenaDTO>(`/cenas/${dados.cenaId}/fundo`, CAMPO_IMAGEM_FUNDO, dados.arquivo),
    onSuccess: (cena) => aplicarCenaAtualizada(queryClient, mesaId, cena),
  });
}

export function useCriarToken(mesaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entrada: {
      cenaId: string;
      nome: string;
      cor: string;
      x: number;
      y: number;
      personagemId: string | null;
    }) =>
      requisitar<TokenDTO>(`/cenas/${entrada.cenaId}/tokens`, { metodo: 'POST', corpo: entrada }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cena', mesaId] }),
  });
}

export function useMoverToken(mesaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entrada: { tokenId: string; x: number; y: number }) =>
      requisitar<TokenDTO>(`/tokens/${entrada.tokenId}/posicao`, {
        metodo: 'PATCH',
        corpo: entrada,
      }),
    // Otimista: o token já foi solto na célula; confirma ou reverte.
    onMutate: async (entrada) => {
      await queryClient.cancelQueries({ queryKey: ['cena', mesaId] });
      const anterior = queryClient.getQueryData<CenaComTokensDTO>(['cena', mesaId]);
      queryClient.setQueryData<CenaComTokensDTO>(['cena', mesaId], (atual) =>
        atual
          ? {
              ...atual,
              tokens: atual.tokens.map((t) =>
                t.id === entrada.tokenId ? { ...t, x: entrada.x, y: entrada.y } : t,
              ),
            }
          : atual,
      );
      return { anterior };
    },
    onError: (_erro, _entrada, contexto) => {
      if (contexto?.anterior) queryClient.setQueryData(['cena', mesaId], contexto.anterior);
    },
  });
}

/** Substitui o token no cache da cena — o broadcast faz o mesmo para os outros. */
function aplicarTokenAtualizado(queryClient: QueryClient, mesaId: string, token: TokenDTO) {
  queryClient.setQueryData<CenaComTokensDTO>(['cena', mesaId], (atual) =>
    atual ? { ...atual, tokens: atual.tokens.map((t) => (t.id === token.id ? token : t)) } : atual,
  );
}

/** Renomear e recolorir o token (RV-040) — só o mestre; jogador recebe 403. */
export function useAtualizarToken(mesaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: { tokenId: string; campos: AtualizarTokenEntrada }) =>
      requisitar<TokenDTO>(`/tokens/${dados.tokenId}`, { metodo: 'PATCH', corpo: dados.campos }),
    onSuccess: (token) => aplicarTokenAtualizado(queryClient, mesaId, token),
  });
}

/** Upload da arte do token (RV-041). */
export function useDefinirImagemToken(mesaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: { tokenId: string; arquivo: File }) =>
      enviarArquivo<TokenDTO>(`/tokens/${dados.tokenId}/imagem`, CAMPO_IMAGEM_TOKEN, dados.arquivo),
    onSuccess: (token) => aplicarTokenAtualizado(queryClient, mesaId, token),
  });
}

export function useRemoverToken(mesaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tokenId: string) => requisitar<void>(`/tokens/${tokenId}`, { metodo: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cena', mesaId] }),
  });
}
