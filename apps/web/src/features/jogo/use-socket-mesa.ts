import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  CenaComTokensDTO,
  EventosServidorParaCliente,
  MensagemDTO,
  PersonagemDTO,
} from '@rolavinte/shared';
import { useSessao } from '@/features/auth/store-sessao';
import { obterSocket } from '@/lib/socket';
import { aplicarCombate } from './api';
import { useConexao } from './store-conexao';

/**
 * Caches que o tempo real mantém vivos e que, por isso, ficam desatualizados
 * durante uma queda: os eventos que os remendariam foram entregues a um socket
 * que não estava lá (RV-112).
 *
 * `invalidateQueries` e não `setQueryData`: o cliente não tem como saber o que
 * perdeu, então a única resposta correta é reperguntar ao servidor. A lista é
 * exatamente a dos caches escritos pelos handlers abaixo — nem a mais (refetch
 * inútil a cada reconexão), nem a menos (tela mentindo até o F5):
 *
 * - `['mensagens']` — falas e rolagens do intervalo;
 * - `['cena']` — cena ativa e tokens (criados, movidos, removidos);
 * - `['personagens']` — PV das fichas, que alimenta a barra de vida no token;
 * - `['mesa']` — participação: um `mesa:participante-removido` perdido deixaria
 *   na tela uma mesa da qual já não faço parte, que é exatamente o defeito
 *   original do RV-021;
 * - `['combate']` — ordem de iniciativa, rodada e turno (RV-063). Sem esta chave
 *   uma queda no meio da luta deixa o painel apontando o turno de quem já agiu:
 *   os `combate:atualizado` do intervalo foram entregues a um socket que não
 *   estava lá, e nada mais reescreve esse cache até o próximo evento.
 */
const CACHES_RESSINCRONIZADOS = ['mensagens', 'cena', 'personagens', 'mesa', 'combate'] as const;

/**
 * Handler de um evento do servidor, com o payload vindo do contrato — nunca
 * redigitado aqui. Foi uma redeclaração inline (`{ tokenId }` contra o
 * `{ tokenId; cenaId }` publicado) que passou despercebida antes do RV-115.
 */
type EventoDoServidor<E extends keyof EventosServidorParaCliente> = EventosServidorParaCliente[E];

/**
 * Conecta o cliente à sala da mesa e sincroniza os eventos de tempo real
 * com o cache do TanStack Query — nenhum estado duplicado.
 *
 * Os parâmetros dos handlers são inferidos do contrato de `@rolavinte/shared`
 * (RV-115): nenhum payload é redeclarado aqui, então um campo que muda de forma
 * no servidor quebra a compilação deste arquivo. O que o tipo *não* garante é
 * que exista um ouvinte para cada evento publicado — disso cuida
 * `cobertura-eventos-ws.test.ts`.
 *
 * O hook é também a única fonte da store de conexão (RV-112): ele traduz os
 * eventos de ciclo de vida do socket.io em `conectado`/`reconectando`/`offline`
 * para a `PaginaMesa` mostrar a faixa de status e bloquear a escrita.
 */
export function useSocketMesa(mesaId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = obterSocket();
    socket.emit('mesa:entrar', mesaId, (resposta) => {
      if (!resposta.ok) console.warn('Falha ao entrar na sala da mesa:', resposta.erro);
    });

    // Estado da conexão no instante da montagem. Só os dois casos sem ambiguidade
    // são sincronizados: um socket que *ainda* está abrindo (`connected` falso,
    // `active` verdadeiro) não é uma queda, e anunciá-lo como tal faria a mesa
    // abrir piscando "Reconectando…" a cada carga de página.
    if (socket.connected) useConexao.getState().conectou();
    else if (!socket.active) useConexao.getState().caiu(false);

    /**
     * Reentrada na sala + ressincronização. O `mesa:entrar` é obrigatório mesmo
     * numa reconexão: o socket volta com outro id e sem sala nenhuma. E ele vem
     * **antes** das invalidações de propósito — quem só invalidasse abriria uma
     * segunda janela cega entre a resposta da API e a entrada na sala.
     */
    function aoConectar() {
      useConexao.getState().conectou();
      socket.emit('mesa:entrar', mesaId, () => {});
      for (const cache of CACHES_RESSINCRONIZADOS) {
        void queryClient.invalidateQueries({ queryKey: [cache, mesaId] });
      }
    }

    /**
     * `socket.active` é o socket.io dizendo se ele mesmo vai tentar de novo: já
     * considera o motivo da queda (`io server disconnect` não reconecta) e o
     * esgotamento das tentativas. Reinterpretar a string de motivo aqui seria
     * uma segunda leitura da mesma verdade, livre para divergir.
     */
    function aoCair() {
      useConexao.getState().caiu(socket.active);
    }

    const novaMensagem: EventoDoServidor<'mensagem:nova'> = (mensagem) => {
      queryClient.setQueryData<MensagemDTO[]>(['mensagens', mesaId], (atual) => {
        if (!atual) return [mensagem];
        if (atual.some((m) => m.id === mensagem.id)) return atual;
        return [...atual, mensagem];
      });
    };

    const tokenCriado: EventoDoServidor<'token:criado'> = (token) => {
      queryClient.setQueryData<CenaComTokensDTO>(['cena', mesaId], (atual) => {
        if (!atual || atual.cena?.id !== token.cenaId) return atual;
        if (atual.tokens.some((t) => t.id === token.id)) return atual;
        return { ...atual, tokens: [...atual.tokens, token] };
      });
    };

    const tokenAtualizado: EventoDoServidor<'token:atualizado'> = (token) => {
      queryClient.setQueryData<CenaComTokensDTO>(['cena', mesaId], (atual) =>
        atual
          ? { ...atual, tokens: atual.tokens.map((t) => (t.id === token.id ? token : t)) }
          : atual,
      );
    };

    const tokenRemovido: EventoDoServidor<'token:removido'> = (dados) => {
      queryClient.setQueryData<CenaComTokensDTO>(['cena', mesaId], (atual) =>
        atual ? { ...atual, tokens: atual.tokens.filter((t) => t.id !== dados.tokenId) } : atual,
      );
    };

    /**
     * `cena:ativada` chega em três situações (RV-030 a RV-032): troca de cena,
     * ajuste do grid da cena em jogo e upload de mapa novo.
     *
     * Nas duas últimas o id não muda e os tokens do cache continuam válidos —
     * reescrevê-los como `[]` esvaziava o mapa até o refetch chegar, que é o
     * "pisca vazio" registrado como limitação da v0.3.0. Quando a cena é outra,
     * o payload não traz os tokens dela: em vez de mostrar um mapa vazio,
     * mantemos o mapa anterior pelo instante do `refetchQueries` — que, ao
     * contrário do `invalidateQueries`, busca mesmo sem observador montado e
     * troca cena e tokens de uma vez só.
     */
    const cenaAtivada: EventoDoServidor<'cena:ativada'> = (cena) => {
      const atual = queryClient.getQueryData<CenaComTokensDTO>(['cena', mesaId]);
      if (atual?.cena?.id === cena.id) {
        queryClient.setQueryData<CenaComTokensDTO>(['cena', mesaId], { ...atual, cena });
        return;
      }
      void queryClient.refetchQueries({ queryKey: ['cena', mesaId] });
    };

    /**
     * RV-042: a ficha mudou e a barra de vida no token precisa acompanhar sem
     * F5. O PV vive só aqui, no cache de personagens — o `TokenDTO` não tem
     * campo de PV, e o `Tabletop` cruza `token.personagemId` na renderização.
     */
    const personagemAtualizado: EventoDoServidor<'personagem:atualizado'> = (personagem) => {
      if (personagem.mesaId !== mesaId) return;
      queryClient.setQueryData<PersonagemDTO[]>(['personagens', mesaId], (atual) => {
        if (!atual) return atual;
        if (!atual.some((p) => p.id === personagem.id)) return [...atual, personagem];
        return atual.map((p) => (p.id === personagem.id ? personagem : p));
      });
    };

    /**
     * RV-021 / RV-022: o backend já tirou o socket da sala. Se o removido sou
     * eu, o detalhe em cache virou uma mentira — jogá-lo fora faz a página
     * refazer a busca e cair na tela de acesso negado, em vez de seguir
     * exibindo uma mesa da qual não participo mais.
     */
    const participanteRemovido: EventoDoServidor<'mesa:participante-removido'> = (dados) => {
      if (dados.mesaId !== mesaId) return;
      if (dados.usuarioId === useSessao.getState().usuario?.id) {
        queryClient.removeQueries({ queryKey: ['mesa', mesaId] });
      } else {
        void queryClient.invalidateQueries({ queryKey: ['mesa', mesaId] });
      }
      void queryClient.invalidateQueries({ queryKey: ['mesas'] });
    };

    /**
     * RV-061 … RV-065: o combate mudou (começou, iniciativa rolada, turno passado,
     * encerrado). O payload é o `CombateDTO` inteiro, então o cache é **reescrito**
     * em vez de remendado: a ordem de iniciativa só faz sentido completa, e
     * recalculá-la aqui seria uma segunda implementação da regra de desempate do
     * servidor.
     *
     * Combate encerrado chega com `ativo: false` e é gravado como `null`, que é o
     * que `GET /mesas/:id/combate` devolve fora da luta — o painel esvazia lendo o
     * mesmo formato dos dois caminhos, sem um segundo estado para tratar.
     *
     * A tradução em si é de `aplicarCombate` (em `api.ts`), a mesma função que as
     * mutações do painel usam: duas escritas do mesmo cache com duas regras
     * próprias divergiriam no primeiro encerramento.
     */
    const combateAtualizado: EventoDoServidor<'combate:atualizado'> = (combate) => {
      if (combate.mesaId !== mesaId) return;
      aplicarCombate(queryClient, mesaId, combate);
    };

    socket.on('connect', aoConectar);
    // `disconnect` é a queda propriamente dita; `connect_error` é cada tentativa
    // frustrada de voltar (e a primeira falha de handshake). Os dois desembocam
    // na mesma leitura porque a pergunta é uma só: ainda vai tentar?
    socket.on('disconnect', aoCair);
    socket.on('connect_error', aoCair);
    socket.on('mensagem:nova', novaMensagem);
    socket.on('token:criado', tokenCriado);
    socket.on('token:atualizado', tokenAtualizado);
    socket.on('token:removido', tokenRemovido);
    socket.on('cena:ativada', cenaAtivada);
    socket.on('personagem:atualizado', personagemAtualizado);
    socket.on('mesa:participante-removido', participanteRemovido);
    socket.on('combate:atualizado', combateAtualizado);

    return () => {
      socket.emit('mesa:sair', mesaId);
      socket.off('connect', aoConectar);
      socket.off('disconnect', aoCair);
      socket.off('connect_error', aoCair);
      socket.off('mensagem:nova', novaMensagem);
      socket.off('token:criado', tokenCriado);
      socket.off('token:atualizado', tokenAtualizado);
      socket.off('token:removido', tokenRemovido);
      socket.off('cena:ativada', cenaAtivada);
      socket.off('personagem:atualizado', personagemAtualizado);
      socket.off('mesa:participante-removido', participanteRemovido);
      socket.off('combate:atualizado', combateAtualizado);
    };
  }, [mesaId, queryClient]);
}
