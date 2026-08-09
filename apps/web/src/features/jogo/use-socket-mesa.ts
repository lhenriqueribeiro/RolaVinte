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
 */
export function useSocketMesa(mesaId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = obterSocket();
    socket.emit('mesa:entrar', mesaId, (resposta) => {
      if (!resposta.ok) console.warn('Falha ao entrar na sala da mesa:', resposta.erro);
    });

    function aoReconectar() {
      socket.emit('mesa:entrar', mesaId, () => {});
      void queryClient.invalidateQueries({ queryKey: ['mensagens', mesaId] });
      void queryClient.invalidateQueries({ queryKey: ['cena', mesaId] });
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

    socket.on('connect', aoReconectar);
    socket.on('mensagem:nova', novaMensagem);
    socket.on('token:criado', tokenCriado);
    socket.on('token:atualizado', tokenAtualizado);
    socket.on('token:removido', tokenRemovido);
    socket.on('cena:ativada', cenaAtivada);
    socket.on('personagem:atualizado', personagemAtualizado);
    socket.on('mesa:participante-removido', participanteRemovido);

    return () => {
      socket.emit('mesa:sair', mesaId);
      socket.off('connect', aoReconectar);
      socket.off('mensagem:nova', novaMensagem);
      socket.off('token:criado', tokenCriado);
      socket.off('token:atualizado', tokenAtualizado);
      socket.off('token:removido', tokenRemovido);
      socket.off('cena:ativada', cenaAtivada);
      socket.off('personagem:atualizado', personagemAtualizado);
      socket.off('mesa:participante-removido', participanteRemovido);
    };
  }, [mesaId, queryClient]);
}
