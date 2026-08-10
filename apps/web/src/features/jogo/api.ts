import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  AtualizarCenaEntrada,
  AtualizarTokenEntrada,
  CenaComTokensDTO,
  CenaDTO,
  CombateAtivoDTO,
  CombateDTO,
  CondicaoToken,
  MensagemDTO,
  PersonagemDTO,
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

/**
 * Rolagem disparada pela **ficha** — perícia, salvaguarda, ataque (RV-090/RV-155/RV-156).
 *
 * `cd` é a CD da checagem, e é o campo que `rolarDadosSchema` aceita como **número**
 * (RV-154): a ficha já sabe o número, e montar `"1d20+4 cd 18"` para o servidor
 * desmontar de novo recriaria a segunda gramática que o RV-074 apagou do chat. Só
 * viaja quando existe — ausente significa "sem CD, e portanto sem grau de sucesso",
 * e é o caso da esmagadora maioria das rolagens, inclusive **toda** rolagem de dano.
 */
export function useRolarDados(mesaId: string) {
  return useMutation({
    mutationFn: (entrada: { expressao: string; motivo?: string; cd?: number | null }) =>
      requisitar<MensagemDTO>(`/mesas/${mesaId}/rolagens`, {
        metodo: 'POST',
        corpo: {
          expressao: entrada.expressao,
          motivo: entrada.motivo ?? '',
          // A chave só entra no corpo quando há CD: mandá-la como `null` seria
          // idêntico para a api, mas faria toda rolagem sem CD carregar um campo que
          // não diz nada — e mudaria o corpo de rolagens que já existiam.
          ...(entrada.cd === undefined || entrada.cd === null ? {} : { cd: entrada.cd }),
        },
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

/**
 * Marcar e desmarcar uma condição da peça (RV-064) — só o mestre; jogador recebe
 * 403.
 *
 * Uma condição por requisição (`{ condicao, aplicada }`), e não a lista inteira:
 * a substituição total faria a marcação do mestre e a do painel de combate
 * apagarem uma à outra. O `onSuccess` remenda `['cena', mesaId]` com o token que
 * a rota devolveu, e o `token:atualizado` faz o mesmo para os outros clientes —
 * sem refetch e sem PV copiado (o token continua sem PV).
 */
export function useAlternarCondicaoToken(mesaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: { tokenId: string; condicao: CondicaoToken; aplicada: boolean }) =>
      requisitar<TokenDTO>(`/tokens/${dados.tokenId}/condicoes`, {
        metodo: 'PATCH',
        corpo: { condicao: dados.condicao, aplicada: dados.aplicada },
      }),
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

/**
 * Chave do combate em curso da mesa. Escrita **uma vez** e usada pela query, por
 * cada mutação e pelo ouvinte de `combate:atualizado`: três lugares escrevendo a
 * mesma chave à mão é como dois caches da mesma coisa aparecem.
 */
export function chaveDoCombate(mesaId: string): [string, string] {
  return ['combate', mesaId];
}

/**
 * Grava o combate no cache no **formato do `GET`** (`CombateAtivoDTO`).
 *
 * É o único ponto do front que traduz `CombateDTO` para o que o painel lê, e por
 * isso vale para as duas origens: a resposta de uma mutação e o evento
 * `combate:atualizado` (que importa esta função em vez de repetir a regra).
 *
 * Combate encerrado chega com `ativo: false` e é gravado como `null` — o mesmo
 * valor que `GET /mesas/:id/combate` devolve fora da luta. Assim o painel esvazia
 * lendo um formato só, sem um segundo estado de "acabou agora" para tratar.
 */
export function aplicarCombate(
  queryClient: QueryClient,
  mesaId: string,
  combate: CombateDTO,
): void {
  queryClient.setQueryData<CombateAtivoDTO>(chaveDoCombate(mesaId), {
    combate: combate.ativo ? combate : null,
  });
}

/**
 * O combate em curso da mesa (RV-063) — leitura de **todo participante**, não só
 * do mestre: a ordem e de quem é a vez são justamente o que o jogador precisa ver.
 *
 * `{ combate: null }` é a resposta normal fora da luta, e não um erro: a rota
 * responde 200 com esse corpo. O painel usa isso para o estado vazio.
 */
export function useCombate(mesaId: string) {
  return useQuery({
    queryKey: chaveDoCombate(mesaId),
    queryFn: () => requisitar<CombateAtivoDTO>(`/mesas/${mesaId}/combate`),
  });
}

/** Inicia o combate com os tokens escolhidos na cena ativa (RV-061) — 201. */
export function useIniciarCombate(mesaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tokenIds: string[]) =>
      requisitar<CombateDTO>(`/mesas/${mesaId}/combate`, {
        metodo: 'POST',
        corpo: { tokenIds },
      }),
    onSuccess: (combate) => aplicarCombate(queryClient, mesaId, combate),
  });
}

/**
 * Rola a iniciativa de um participante (RV-061 / RV-158).
 *
 * `rolagem` é a chave da forma de rolar que o **sistema** declara; `expressao` só
 * viaja para peça sem ficha. Quem decide qual dos dois vai é
 * `pedidoDeIniciativa`, em `painel-iniciativa.ts`, com o motivo escrito lá.
 *
 * `motivo` fica de fora de propósito: vazio faz o servidor escrever
 * `Iniciativa (Percepção) — <nome>` no chat, dizendo **qual regra** foi aplicada.
 * Mandar um motivo daqui apagaria essa informação da linha do chat.
 *
 * A mensagem da rolagem chega ao chat pelo `mensagem:nova`, como toda rolagem —
 * não há `setQueryData` de mensagens aqui.
 */
export function useRolarIniciativa(mesaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: {
      combateId: string;
      tokenId: string;
      rolagem?: string;
      expressao?: string;
    }) =>
      requisitar<{ combate: CombateDTO; mensagem: MensagemDTO }>(
        `/combates/${dados.combateId}/iniciativa`,
        {
          metodo: 'POST',
          corpo: {
            tokenId: dados.tokenId,
            ...(dados.rolagem === undefined ? {} : { rolagem: dados.rolagem }),
            ...(dados.expressao === undefined ? {} : { expressao: dados.expressao }),
          },
        },
      ),
    onSuccess: (resposta) => aplicarCombate(queryClient, mesaId, resposta.combate),
  });
}

/** Passa o turno; na volta ao primeiro, o servidor anuncia a rodada no chat (RV-062). */
export function usePassarTurno(mesaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // `corpo: {}` pelo mesmo motivo de `useAtivarCena`: o cliente central sempre
    // manda `Content-Type: application/json`, e o Fastify recusa um POST com esse
    // cabeçalho e corpo vazio antes de chegar à rota.
    mutationFn: (combateId: string) =>
      requisitar<CombateDTO>(`/combates/${combateId}/proximo-turno`, {
        metodo: 'POST',
        corpo: {},
      }),
    onSuccess: (combate) => aplicarCombate(queryClient, mesaId, combate),
  });
}

/**
 * Encerra o combate (RV-062). A resposta vem com `ativo: false`, e é isso que
 * esvazia o painel — o histórico da luta continua no servidor.
 */
export function useEncerrarCombate(mesaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (combateId: string) =>
      requisitar<CombateDTO>(`/combates/${combateId}/encerrar`, { metodo: 'POST', corpo: {} }),
    onSuccess: (combate) => aplicarCombate(queryClient, mesaId, combate),
  });
}

/**
 * Dano (delta negativo) e cura (positivo) pelo painel (RV-065) — só o mestre.
 *
 * A rota devolve o `PersonagemDTO`, porque é a ficha que muda: o combate não
 * guarda PV. Então o `onSuccess` faz duas coisas, e as duas são necessárias:
 *
 * 1. **remenda `['personagens', mesaId]`** com a ficha que voltou — é dela que
 *    saem a barra de vida do token e o PV no painel, sem refetch;
 * 2. **invalida `['cena', mesaId]`**, porque zerar o PV marca `inconsciente` na
 *    peça e voltar acima de zero desmarca. Essa mudança **não** está na resposta
 *    (ela viaja pelo `token:atualizado`), e sem o refetch o mapa continuaria
 *    mostrando o marcador antigo para quem aplicou o golpe até o socket chegar —
 *    numa queda de conexão, até o F5.
 */
export function useAplicarPv(mesaId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dados: { combateId: string; tokenId: string; delta: number }) =>
      requisitar<PersonagemDTO>(`/combates/${dados.combateId}/participantes/${dados.tokenId}/pv`, {
        metodo: 'POST',
        corpo: { delta: dados.delta },
      }),
    onSuccess: async (personagem) => {
      queryClient.setQueryData<PersonagemDTO[]>(['personagens', mesaId], (atual) =>
        atual?.map((p) => (p.id === personagem.id ? personagem : p)),
      );
      await queryClient.invalidateQueries({ queryKey: ['cena', mesaId] });
    },
  });
}
