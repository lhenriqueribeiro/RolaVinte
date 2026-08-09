import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { QueryClient } from '@tanstack/react-query';
import type {
  CenaComTokensDTO,
  CenaDTO,
  MensagemDTO,
  PersonagemDTO,
  TokenDTO,
} from '@rolavinte/shared';
import { EVENTOS_SERVIDOR_PARA_CLIENTE } from '@rolavinte/shared';
import { criarQueryClientDeTeste, criarWrapperQuery } from '@/testes/utilitarios';
import { SocketFalso } from '@/testes/socket-falso';
import { useSessao } from '@/features/auth/store-sessao';
import { useSocketMesa } from './use-socket-mesa';

const MESA_ID = 'mesa-1';
const CENA_ID = 'cena-1';

/**
 * Um ouvinte por evento do contrato, mais o `connect` do próprio socket.io.
 * Derivado da fonte de verdade de propósito: um número fixo aqui viraria uma
 * falha enigmática no dia em que alguém acrescentasse um evento — quem denuncia
 * evento sem assinante, com nome e tudo, é `cobertura-eventos-ws.test.ts`.
 */
const OUVINTES_ESPERADOS = EVENTOS_SERVIDOR_PARA_CLIENTE.length + 1;

const contexto = vi.hoisted(() => ({ socket: null as unknown as SocketFalso }));

vi.mock('@/lib/socket', () => ({
  obterSocket: () => contexto.socket,
  desconectarSocket: () => undefined,
}));

function mensagem(id: string, conteudo = 'olá'): MensagemDTO {
  return {
    id,
    mesaId: MESA_ID,
    autorId: 'u1',
    autorNome: 'Aria',
    tipo: 'fala',
    conteudo,
    rolagem: null,
    motivo: null,
    criadoEm: '2026-08-09T12:00:00.000Z',
  };
}

function token(id: string, x = 0, y = 0, cenaId = CENA_ID): TokenDTO {
  return {
    id,
    cenaId,
    nome: `Token ${id}`,
    cor: '#c9a227',
    x,
    y,
    personagemId: null,
    imagemUrl: null,
  };
}

function cena(id = CENA_ID): CenaDTO {
  return {
    id,
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
}

function montar(queryClient: QueryClient, mesaId = MESA_ID) {
  return renderHook(() => useSocketMesa(mesaId), { wrapper: criarWrapperQuery(queryClient) });
}

beforeEach(() => {
  contexto.socket = new SocketFalso();
  useSessao.getState().sair();
});

describe('useSocketMesa — ciclo de vida da sala', () => {
  it('entra na sala da mesa ao montar', () => {
    montar(criarQueryClientDeTeste());

    const entradas = contexto.socket.emissoesDe('mesa:entrar');
    expect(entradas).toHaveLength(1);
    expect(entradas[0]?.args[0]).toBe(MESA_ID);
    expect(typeof entradas[0]?.args[1]).toBe('function');
  });

  it('sai da sala ao desmontar', () => {
    const { unmount } = montar(criarQueryClientDeTeste());

    unmount();

    expect(contexto.socket.emissoesDe('mesa:sair')).toEqual([
      { evento: 'mesa:sair', args: [MESA_ID] },
    ]);
  });

  it('remove TODOS os ouvintes registrados no cleanup (sem vazamento)', () => {
    const { unmount } = montar(criarQueryClientDeTeste());

    expect(contexto.socket.totalOuvintes).toBe(OUVINTES_ESPERADOS);
    expect([...contexto.socket.eventosOuvidos].sort()).toEqual(
      [...EVENTOS_SERVIDOR_PARA_CLIENTE, 'connect'].sort(),
    );

    unmount();

    expect(contexto.socket.totalOuvintes).toBe(0);
  });

  it('não acumula ouvintes quando a mesa muda', () => {
    const queryClient = criarQueryClientDeTeste();
    const { rerender, unmount } = renderHook(
      (props: { mesaId: string }) => useSocketMesa(props.mesaId),
      {
        wrapper: criarWrapperQuery(queryClient),
        initialProps: { mesaId: MESA_ID },
      },
    );

    rerender({ mesaId: 'mesa-2' });
    expect(contexto.socket.totalOuvintes).toBe(OUVINTES_ESPERADOS);

    unmount();
    expect(contexto.socket.totalOuvintes).toBe(0);
  });

  it('registra aviso quando o servidor recusa a entrada na sala', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    montar(criarQueryClientDeTeste());

    const ack = contexto.socket.emissoesDe('mesa:entrar')[0]?.args[1] as (resposta: {
      ok: boolean;
      erro?: string;
    }) => void;
    ack({ ok: false, erro: 'Você não participa desta mesa.' });

    expect(aviso).toHaveBeenCalledWith(
      'Falha ao entrar na sala da mesa:',
      'Você não participa desta mesa.',
    );
  });
});

describe('useSocketMesa — reconexão', () => {
  it('reemite mesa:entrar e invalida exatamente mensagens e cena da mesa', () => {
    const queryClient = criarQueryClientDeTeste();
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');
    montar(queryClient);

    contexto.socket.disparar('connect');

    expect(contexto.socket.emissoesDe('mesa:entrar')).toHaveLength(2);
    expect(invalidar.mock.calls.map(([filtro]) => filtro?.queryKey)).toEqual([
      ['mensagens', MESA_ID],
      ['cena', MESA_ID],
    ]);
  });
});

describe('useSocketMesa — mensagens no cache', () => {
  it('cria a lista quando o cache ainda está vazio', () => {
    const queryClient = criarQueryClientDeTeste();
    montar(queryClient);

    contexto.socket.disparar('mensagem:nova', mensagem('m1'));

    expect(queryClient.getQueryData<MensagemDTO[]>(['mensagens', MESA_ID])).toEqual([
      mensagem('m1'),
    ]);
  });

  it('acrescenta a mensagem nova ao fim da lista', () => {
    const queryClient = criarQueryClientDeTeste();
    queryClient.setQueryData<MensagemDTO[]>(['mensagens', MESA_ID], [mensagem('m1')]);
    montar(queryClient);

    contexto.socket.disparar('mensagem:nova', mensagem('m2', 'segunda'));

    expect(
      queryClient.getQueryData<MensagemDTO[]>(['mensagens', MESA_ID])?.map((m) => m.id),
    ).toEqual(['m1', 'm2']);
  });

  it('não duplica quando o id já está no cache (eco do próprio envio)', () => {
    const queryClient = criarQueryClientDeTeste();
    queryClient.setQueryData<MensagemDTO[]>(['mensagens', MESA_ID], [mensagem('m1')]);
    montar(queryClient);

    contexto.socket.disparar('mensagem:nova', mensagem('m1'));
    contexto.socket.disparar('mensagem:nova', mensagem('m1'));

    expect(queryClient.getQueryData<MensagemDTO[]>(['mensagens', MESA_ID])).toHaveLength(1);
  });

  it('não escreve na lista de outra mesa', () => {
    const queryClient = criarQueryClientDeTeste();
    montar(queryClient);

    contexto.socket.disparar('mensagem:nova', mensagem('m1'));

    expect(queryClient.getQueryData(['mensagens', 'outra-mesa'])).toBeUndefined();
  });
});

describe('useSocketMesa — participante removido (RV-021 / RV-022)', () => {
  const EU = 'u-eu';

  function entrarComoEu() {
    useSessao.getState().entrar('token-de-teste', { id: EU, nome: 'Eu', email: 'eu@teste.local' });
  }

  /** Detalhe da mesa em cache, como se a página já estivesse aberta. */
  function semearMesa(queryClient: QueryClient) {
    queryClient.setQueryData(['mesa', MESA_ID], { id: MESA_ID, nome: 'Strahd' });
  }

  it('descarta o detalhe em cache quando o removido sou eu', () => {
    entrarComoEu();
    const queryClient = criarQueryClientDeTeste();
    semearMesa(queryClient);
    montar(queryClient);

    contexto.socket.disparar('mesa:participante-removido', { mesaId: MESA_ID, usuarioId: EU });

    expect(queryClient.getQueryData(['mesa', MESA_ID])).toBeUndefined();
  });

  it('mantém o detalhe e apenas revalida quando o removido é outro jogador', () => {
    entrarComoEu();
    const queryClient = criarQueryClientDeTeste();
    semearMesa(queryClient);
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');
    montar(queryClient);

    contexto.socket.disparar('mesa:participante-removido', {
      mesaId: MESA_ID,
      usuarioId: 'outro-jogador',
    });

    expect(queryClient.getQueryData(['mesa', MESA_ID])).toBeDefined();
    expect(invalidar.mock.calls.map(([filtro]) => filtro?.queryKey)).toEqual([
      ['mesa', MESA_ID],
      ['mesas'],
    ]);
  });

  it('ignora remoção anunciada para outra mesa', () => {
    entrarComoEu();
    const queryClient = criarQueryClientDeTeste();
    semearMesa(queryClient);
    montar(queryClient);

    contexto.socket.disparar('mesa:participante-removido', {
      mesaId: 'outra-mesa',
      usuarioId: EU,
    });

    expect(queryClient.getQueryData(['mesa', MESA_ID])).toBeDefined();
  });
});

describe('useSocketMesa — tokens no cache', () => {
  function semearCena(queryClient: QueryClient, tokens: TokenDTO[]) {
    queryClient.setQueryData<CenaComTokensDTO>(['cena', MESA_ID], { cena: cena(), tokens });
  }

  it('token:criado acrescenta o token da cena ativa', () => {
    const queryClient = criarQueryClientDeTeste();
    semearCena(queryClient, [token('t1')]);
    montar(queryClient);

    contexto.socket.disparar('token:criado', token('t2', 3, 4));

    expect(
      queryClient.getQueryData<CenaComTokensDTO>(['cena', MESA_ID])?.tokens.map((t) => t.id),
    ).toEqual(['t1', 't2']);
  });

  it('token:criado ignora token de outra cena', () => {
    const queryClient = criarQueryClientDeTeste();
    semearCena(queryClient, [token('t1')]);
    montar(queryClient);

    contexto.socket.disparar('token:criado', token('t9', 1, 1, 'cena-outra'));

    expect(queryClient.getQueryData<CenaComTokensDTO>(['cena', MESA_ID])?.tokens).toHaveLength(1);
  });

  it('token:atualizado substitui apenas o token correspondente', () => {
    const queryClient = criarQueryClientDeTeste();
    semearCena(queryClient, [token('t1', 0, 0), token('t2', 5, 5)]);
    montar(queryClient);

    contexto.socket.disparar('token:atualizado', token('t2', 9, 1));

    const tokens = queryClient.getQueryData<CenaComTokensDTO>(['cena', MESA_ID])?.tokens ?? [];
    expect(tokens.map((t) => [t.id, t.x, t.y])).toEqual([
      ['t1', 0, 0],
      ['t2', 9, 1],
    ]);
  });

  it('token:removido tira o token do cache', () => {
    const queryClient = criarQueryClientDeTeste();
    semearCena(queryClient, [token('t1'), token('t2')]);
    montar(queryClient);

    contexto.socket.disparar('token:removido', { tokenId: 't1', cenaId: CENA_ID });

    expect(
      queryClient.getQueryData<CenaComTokensDTO>(['cena', MESA_ID])?.tokens.map((t) => t.id),
    ).toEqual(['t2']);
  });

  it('cena:ativada da MESMA cena preserva os tokens (grid e mapa não piscam vazio)', () => {
    const queryClient = criarQueryClientDeTeste();
    semearCena(queryClient, [token('t1'), token('t2')]);
    montar(queryClient);

    // O backend reusa `cena:ativada` para ajuste de grid e upload de fundo.
    const mesmaCenaComGridMaior = { ...cena(), tamanhoCelula: 64, imagemFundoUrl: 'u://mapa.png' };
    contexto.socket.disparar('cena:ativada', mesmaCenaComGridMaior);

    const emCache = queryClient.getQueryData<CenaComTokensDTO>(['cena', MESA_ID]);
    expect(emCache?.cena).toEqual(mesmaCenaComGridMaior);
    expect(emCache?.tokens.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('cena:ativada de OUTRA cena refaz a busca em vez de gravar um mapa vazio', () => {
    const queryClient = criarQueryClientDeTeste();
    semearCena(queryClient, [token('t1')]);
    const refetch = vi.spyOn(queryClient, 'refetchQueries').mockResolvedValue(undefined);
    montar(queryClient);

    contexto.socket.disparar('cena:ativada', { ...cena('cena-2'), nome: 'Salão do trono' });

    // Nada de `tokens: []` no cache: o mapa anterior segue na tela pelo instante
    // do refetch, que traz cena e tokens juntos. `refetchQueries` (e não
    // `invalidateQueries`) porque o invalidate não busca sem observador montado.
    expect(refetch).toHaveBeenCalledWith({ queryKey: ['cena', MESA_ID] });
    expect(queryClient.getQueryData<CenaComTokensDTO>(['cena', MESA_ID])?.tokens).toHaveLength(1);
  });
});

describe('useSocketMesa — personagem atualizado (RV-042)', () => {
  function personagem(id: string, pvAtual: number, mesaId = MESA_ID): PersonagemDTO {
    return {
      id,
      mesaId,
      donoId: 'u1',
      donoNome: 'Aria',
      nome: 'Thorin',
      classe: 'Guerreiro',
      nivel: 3,
      pvAtual,
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
    };
  }

  it('substitui o personagem no cache pelo id, mantendo os demais', () => {
    const queryClient = criarQueryClientDeTeste();
    queryClient.setQueryData<PersonagemDTO[]>(
      ['personagens', MESA_ID],
      [personagem('p1', 30), personagem('p2', 20)],
    );
    montar(queryClient);

    contexto.socket.disparar('personagem:atualizado', personagem('p1', 12));

    expect(
      queryClient
        .getQueryData<PersonagemDTO[]>(['personagens', MESA_ID])
        ?.map((p) => [p.id, p.pvAtual]),
    ).toEqual([
      ['p1', 12],
      ['p2', 20],
    ]);
  });

  it('acrescenta o personagem quando ele ainda não está na lista em cache', () => {
    const queryClient = criarQueryClientDeTeste();
    queryClient.setQueryData<PersonagemDTO[]>(['personagens', MESA_ID], [personagem('p1', 30)]);
    montar(queryClient);

    contexto.socket.disparar('personagem:atualizado', personagem('p9', 5));

    expect(
      queryClient.getQueryData<PersonagemDTO[]>(['personagens', MESA_ID])?.map((p) => p.id),
    ).toEqual(['p1', 'p9']);
  });

  it('ignora personagem de outra mesa', () => {
    const queryClient = criarQueryClientDeTeste();
    queryClient.setQueryData<PersonagemDTO[]>(['personagens', MESA_ID], [personagem('p1', 30)]);
    montar(queryClient);

    contexto.socket.disparar('personagem:atualizado', personagem('p1', 1, 'outra-mesa'));

    expect(queryClient.getQueryData<PersonagemDTO[]>(['personagens', MESA_ID])?.[0]?.pvAtual).toBe(
      30,
    );
  });

  it('não cria a lista do zero quando o cache ainda está vazio', () => {
    // Sem lista em cache não há o que remendar: inventar um array de um
    // elemento esconderia os outros personagens até o primeiro refetch.
    const queryClient = criarQueryClientDeTeste();
    montar(queryClient);

    contexto.socket.disparar('personagem:atualizado', personagem('p1', 12));

    expect(queryClient.getQueryData(['personagens', MESA_ID])).toBeUndefined();
  });
});
