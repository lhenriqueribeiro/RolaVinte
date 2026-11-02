import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import {
  EVENTOS_SERVIDOR_PARA_CLIENTE,
  type CenaDTO,
  type CombateDTO,
  type MensagemDTO,
  type NomeEventoServidorParaCliente,
  type PersonagemDTO,
  type TokenDTO,
} from '@rolavinte/shared';
import { criarQueryClientDeTeste, criarWrapperQuery } from '@/testes/utilitarios';
import { SocketFalso } from '@/testes/socket-falso';
import { cachesRessincronizados, useSocketMesa } from './use-socket-mesa';

/**
 * Ressincronização na reconexão (RV-112) — a lista contra os handlers.
 *
 * ## O que este arquivo protege, e por quê
 *
 * Um cache mantido vivo por evento de socket fica mentindo durante uma queda:
 * os eventos que o remendariam foram entregues a um socket que não estava lá, e
 * o cliente não tem como saber o que perdeu. A regra do projeto é que a lista de
 * ressincronização seja **exatamente** a dos caches que os handlers escrevem —
 * nem a mais (refetch inútil a cada reconexão), nem a menos (tela mentindo até o
 * F5).
 *
 * Isso era uma afirmação em prosa, num comentário, e nada quebrava quando ela
 * deixava de valer. Apodreceu exatamente como o guardrail 10 prevê: o handler de
 * `mesa:participante-removido` passou a invalidar `['mesas']` e essa chave nunca
 * entrou na lista. Com `staleTime` de 30s, quem voltasse de uma queda e saísse
 * da mesa via por até meio minuto, no painel, uma mesa da qual já tinha sido
 * removido — o mesmo sintoma do RV-021, pela porta dos fundos.
 *
 * ## Como ele mede
 *
 * Não por leitura do fonte: ele **executa** cada evento do contrato contra o
 * hook real, com um `QueryClient` que anota toda chave tocada, e compara o
 * conjunto observado com `cachesRessincronizados`. Nos dois sentidos — chave
 * escrita e não ressincronizada, e chave ressincronizada que handler nenhum
 * escreve.
 *
 * `PAYLOAD_POR_EVENTO` é um `Record` total: evento novo no contrato não compila
 * aqui até ganhar um payload, e aí a comparação passa a cobri-lo
 * automaticamente. É o mesmo mecanismo de `cobertura-publicador-ws.test.ts` na
 * api, pela mesma razão — lista escrita à mão é a coisa que este teste existe
 * para substituir.
 */

const MESA_ID = 'mesa-1';
const USUARIO_ID = 'usuario-1';

vi.mock('@/features/auth/store-sessao', () => ({
  useSessao: { getState: () => ({ usuario: { id: USUARIO_ID } }) },
}));

const MENSAGEM: MensagemDTO = {
  id: 'm1',
  mesaId: MESA_ID,
  autorId: USUARIO_ID,
  autorNome: 'Aria',
  tipo: 'fala',
  conteudo: 'olá',
  rolagem: null,
  motivo: null,
  avaliacao: null,
  destinatarioId: null,
  destinatarioNome: null,
  criadoEm: '2026-11-01T12:00:00.000Z',
};

const TOKEN: TokenDTO = {
  id: 't1',
  cenaId: 'cena-1',
  nome: 'Thorin',
  cor: '#c9a227',
  x: 3,
  y: 4,
  personagemId: null,
  imagemUrl: null,
  condicoes: [],
};

const CENA: CenaDTO = {
  id: 'cena-1',
  mesaId: MESA_ID,
  nome: 'Cripta',
  larguraGrid: 20,
  alturaGrid: 15,
  corFundo: '#101010',
  ativa: true,
  imagemFundoUrl: null,
  tamanhoCelula: 44,
  gridVisivel: true,
  corGrid: '#3a4a63',
};

const PERSONAGEM: PersonagemDTO = {
  id: 'p1',
  mesaId: MESA_ID,
  donoId: USUARIO_ID,
  donoNome: 'Aria',
  nome: 'Thorin',
  classe: 'Guerreiro',
  nivel: 3,
  pvAtual: 12,
  pvMax: 30,
  atributos: {
    forca: 16,
    destreza: 10,
    constituicao: 14,
    inteligencia: 8,
    sabedoria: 12,
    carisma: 10,
  },
  anotacoes: '',
  sistema: 'dnd5e',
  dados: {},
};

const COMBATE: CombateDTO = {
  id: 'combate-1',
  mesaId: MESA_ID,
  cenaId: CENA.id,
  rodada: 1,
  indiceTurno: 0,
  ativo: true,
  participantes: [{ tokenId: TOKEN.id, nome: TOKEN.nome, iniciativa: 18 }],
  tokenIdDoTurno: TOKEN.id,
};

/**
 * Um payload por evento do contrato. `Record` total de propósito: evento novo
 * para de compilar aqui até ser descrito, o que é o que garante que a
 * comparação abaixo não envelheça em silêncio.
 *
 * Os payloads são dirigidos a *este* usuário e a *esta* mesa porque vários
 * handlers começam com uma guarda de escopo (`if (dados.mesaId !== mesaId)
 * return`): com o payload errado, o teste mediria um handler que nem rodou.
 */
const PAYLOAD_POR_EVENTO: Record<NomeEventoServidorParaCliente, unknown> = {
  'mensagem:nova': MENSAGEM,
  'token:criado': TOKEN,
  'token:atualizado': TOKEN,
  'token:removido': { tokenId: TOKEN.id, cenaId: TOKEN.cenaId },
  'cena:ativada': CENA,
  'personagem:atualizado': PERSONAGEM,
  'mesa:participante-removido': { mesaId: MESA_ID, usuarioId: USUARIO_ID },
  'combate:atualizado': COMBATE,
};

const contexto = vi.hoisted(() => ({ socket: null as unknown as SocketFalso }));

vi.mock('@/lib/socket', () => ({
  obterSocket: () => contexto.socket,
  desconectarSocket: () => undefined,
}));

/** Chave como texto, para comparar conjuntos sem depender da ordem. */
const comoTexto = (chave: readonly unknown[]) => JSON.stringify(chave);

/**
 * Envolve o `QueryClient` real para anotar toda chave que os handlers tocam.
 *
 * Os quatro métodos cobertos são os quatro que os handlers usam para manter um
 * cache vivo. Um handler novo que alcance o cache por um quinto caminho não
 * seria visto aqui — e é por isso que o caso "chave ressincronizada que ninguém
 * escreve" existe: ele falha quando a medição fica cega, em vez de deixar o
 * arquivo passar verde medindo nada.
 */
function espionarCaches(queryClient: QueryClient): { chaves: Set<string> } {
  const chaves = new Set<string>();
  const anotar = (chave: QueryKey | undefined) => {
    if (Array.isArray(chave)) chaves.add(comoTexto(chave));
  };

  // Um por um, e não num laço sobre os nomes: as três assinaturas de filtro são
  // diferentes, e o laço obrigaria o TypeScript a intersectá-las — a asserção
  // que isso exigiria é exatamente a que esconderia um erro de verdade aqui.
  const definir = queryClient.setQueryData.bind(queryClient);
  queryClient.setQueryData = ((chave: QueryKey, ...resto: never[]) => {
    anotar(chave);
    return definir(chave, ...(resto as [never]));
  }) as typeof queryClient.setQueryData;

  const invalidar = queryClient.invalidateQueries.bind(queryClient);
  queryClient.invalidateQueries = ((filtros, opcoes) => {
    anotar(filtros?.queryKey);
    return invalidar(filtros, opcoes);
  }) as typeof queryClient.invalidateQueries;

  const remover = queryClient.removeQueries.bind(queryClient);
  queryClient.removeQueries = ((filtros) => {
    anotar(filtros?.queryKey);
    return remover(filtros);
  }) as typeof queryClient.removeQueries;

  const rebuscar = queryClient.refetchQueries.bind(queryClient);
  queryClient.refetchQueries = ((filtros, opcoes) => {
    anotar(filtros?.queryKey);
    return rebuscar(filtros, opcoes);
  }) as typeof queryClient.refetchQueries;

  return { chaves };
}

/** Dispara todos os eventos do contrato e devolve as chaves que eles tocaram. */
function chavesEscritasPelosHandlers(): Set<string> {
  const queryClient = criarQueryClientDeTeste();
  renderHook(() => useSocketMesa(MESA_ID), { wrapper: criarWrapperQuery(queryClient) });

  // O espião entra **depois** da montagem: o `connect` inicial é a própria
  // ressincronização, e contá-la faria a lista provar a si mesma.
  const { chaves } = espionarCaches(queryClient);
  for (const evento of EVENTOS_SERVIDOR_PARA_CLIENTE) {
    contexto.socket.disparar(evento, PAYLOAD_POR_EVENTO[evento]);
  }
  return chaves;
}

beforeEach(() => {
  contexto.socket = new SocketFalso();
});

describe('ressincronização na reconexão cobre o que os handlers escrevem (RV-112)', () => {
  it('o contrato exportado como valor não está vazio', () => {
    // Rede de segurança do próprio teste: com a lista vazia, nenhum handler
    // rodaria e as duas comparações passariam sem verificar coisa alguma.
    expect(EVENTOS_SERVIDOR_PARA_CLIENTE.length).toBeGreaterThan(0);
  });

  it('os handlers de fato escrevem em algum cache', () => {
    // Se o espião parar de enxergar (um método novo do QueryClient, um mock que
    // mudou), as duas comparações viram tautologia. Esta falha primeiro.
    expect(chavesEscritasPelosHandlers().size).toBeGreaterThan(0);
  });

  it('todo cache escrito por um handler é ressincronizado na reconexão', () => {
    const ressincronizados = new Set(cachesRessincronizados(MESA_ID).map(comoTexto));

    const semRessincronizacao = [...chavesEscritasPelosHandlers()].filter(
      (chave) => !ressincronizados.has(chave),
    );

    expect(
      semRessincronizacao,
      `Cache(s) escritos por um handler de socket e ausentes de cachesRessincronizados(): ` +
        `${semRessincronizacao.join(', ')}. Enquanto o socket esteve fora, os eventos que ` +
        `remendariam esse cache foram entregues a ninguém — a tela segue mentindo até o F5.`,
    ).toEqual([]);
  });

  it('não ressincroniza cache que handler nenhum mantém vivo', () => {
    const escritos = chavesEscritasPelosHandlers();

    const semEscritor = cachesRessincronizados(MESA_ID)
      .map(comoTexto)
      .filter((chave) => !escritos.has(chave));

    expect(
      semEscritor,
      `Chave(s) em cachesRessincronizados() que nenhum handler de socket escreve: ` +
        `${semEscritor.join(', ')}. Ou sobra um refetch a cada reconexão, ou o handler que ` +
        `justificava a chave sumiu e a lista ficou para trás.`,
    ).toEqual([]);
  });
});
