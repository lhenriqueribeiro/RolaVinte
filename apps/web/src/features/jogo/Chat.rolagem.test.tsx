import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MensagemDTO, MesaDetalheDTO } from '@rolavinte/shared';
import { renderizarComProvedores } from '@/testes/utilitarios';
import { useSessao } from '@/features/auth/store-sessao';
import { Chat } from './Chat';

/**
 * "Mensagem nova não pode puxar a tela de quem está lendo o histórico" (RV-073).
 *
 * O jsdom não faz layout, então as métricas de rolagem são forjadas com
 * `Object.defineProperty` sobre o contêiner real e um evento `scroll` — é a
 * única forma de exercitar o caminho "usuário rolou para cima" sem navegador. A
 * conta em si está coberta em `rolagem-chat.test.ts`; aqui se prova a ligação:
 * quem decide se a tela desce é a posição da rolagem, não a chegada da mensagem.
 */

const MESA_ID = 'mesa-1';
const EU = { id: 'u1', nome: 'Aria', email: 'aria@mesa.rpg' };

const { requisitarFalso } = vi.hoisted(() => ({
  requisitarFalso: vi.fn<(caminho: string, opcoes?: unknown) => Promise<unknown>>(),
}));

vi.mock('@/lib/api', () => ({
  requisitar: requisitarFalso,
  ErroApi: class ErroApi extends Error {},
}));

const MESA: MesaDetalheDTO = {
  id: MESA_ID,
  nome: 'A Cripta',
  descricao: '',
  sistema: 'generico',
  mestreId: 'u9',
  mestreNome: 'Mestra',
  meuPapel: 'jogador',
  totalJogadores: 2,
  criadoEm: '2026-08-09T10:00:00.000Z',
  encerradaEm: null,
  jogadores: [],
};

function fala(id: string, conteudo: string): MensagemDTO {
  return {
    id,
    mesaId: MESA_ID,
    autorId: 'u2',
    autorNome: 'Dado',
    tipo: 'fala',
    conteudo,
    rolagem: null,
    motivo: null,
    criadoEm: '2026-08-09T12:00:00.000Z',
    destinatarioId: null,
    destinatarioNome: null,
  };
}

const HISTORICO = [fala('m1', 'A porta range.'), fala('m2', 'Alguém acende a tocha.')];

beforeEach(() => {
  requisitarFalso.mockReset();
  requisitarFalso.mockImplementation((caminho, opcoes) => {
    if (opcoes === undefined && caminho === `/mesas/${MESA_ID}`) return Promise.resolve(MESA);
    if (opcoes === undefined) return Promise.resolve(HISTORICO);
    return Promise.resolve(HISTORICO[0]);
  });
  useSessao.setState({ token: 'jwt', usuario: EU });
});

/** Faz o contêiner responder como se o usuário tivesse rolado para o topo. */
function rolarParaOTopo(lista: HTMLElement) {
  Object.defineProperty(lista, 'scrollHeight', { value: 4000, configurable: true });
  Object.defineProperty(lista, 'clientHeight', { value: 400, configurable: true });
  Object.defineProperty(lista, 'scrollTop', { value: 0, configurable: true, writable: true });
  fireEvent.scroll(lista);
}

async function abrirChat() {
  const render = renderizarComProvedores(<Chat mesaId={MESA_ID} />);
  await screen.findByText('A porta range.');
  const lista = screen.getByRole('log', { name: 'Histórico da conversa' });
  return { ...render, lista };
}

/** Simula a chegada de uma mensagem por socket: o handler grava neste cache. */
function chegaMensagem(
  queryClient: { setQueryData: (chave: unknown[], valor: MensagemDTO[]) => void },
  mensagens: MensagemDTO[],
) {
  act(() => {
    queryClient.setQueryData(['mensagens', MESA_ID], mensagens);
  });
}

describe('Chat — rolagem durante a leitura do histórico (RV-073)', () => {
  it('mensagem nova NÃO puxa a tela de quem está lendo para trás', async () => {
    const { queryClient, lista } = await abrirChat();
    const descer = vi.spyOn(Element.prototype, 'scrollIntoView');

    rolarParaOTopo(lista);
    descer.mockClear();

    chegaMensagem(queryClient, [...HISTORICO, fala('m3', 'Um grito ecoa no corredor.')]);

    expect(await screen.findByText('Um grito ecoa no corredor.')).toBeInTheDocument();
    expect(descer).not.toHaveBeenCalled();
    descer.mockRestore();
  });

  it('em vez de saltar, aparece o aviso de novas mensagens, com a contagem', async () => {
    const { queryClient, lista } = await abrirChat();
    rolarParaOTopo(lista);

    chegaMensagem(queryClient, [...HISTORICO, fala('m3', 'Um grito.')]);
    expect(await screen.findByRole('button', { name: /1 nova mensagem/ })).toBeInTheDocument();

    chegaMensagem(queryClient, [...HISTORICO, fala('m3', 'Um grito.'), fala('m4', 'Passos.')]);
    expect(await screen.findByRole('button', { name: /2 novas mensagens/ })).toBeInTheDocument();
  });

  it('clicar no aviso desce até o fim e o aviso some', async () => {
    const usuario = userEvent.setup();
    const { queryClient, lista } = await abrirChat();
    rolarParaOTopo(lista);
    chegaMensagem(queryClient, [...HISTORICO, fala('m3', 'Um grito.')]);

    const aviso = await screen.findByRole('button', { name: /1 nova mensagem/ });
    const descer = vi.spyOn(Element.prototype, 'scrollIntoView');
    await usuario.click(aviso);

    expect(descer).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /nova mensagem/ })).not.toBeInTheDocument();
    });
    descer.mockRestore();
  });

  it('quem já está no fim continua acompanhando, sem aviso nenhum', async () => {
    const { queryClient } = await abrirChat();
    const descer = vi.spyOn(Element.prototype, 'scrollIntoView');
    descer.mockClear();

    chegaMensagem(queryClient, [...HISTORICO, fala('m3', 'Um grito.')]);

    expect(await screen.findByText('Um grito.')).toBeInTheDocument();
    expect(descer).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /nova mensagem/ })).not.toBeInTheDocument();
    descer.mockRestore();
  });

  it('voltar ao fim rolando (sem clicar no aviso) também zera a contagem', async () => {
    const { queryClient, lista } = await abrirChat();
    rolarParaOTopo(lista);
    chegaMensagem(queryClient, [...HISTORICO, fala('m3', 'Um grito.')]);
    expect(await screen.findByRole('button', { name: /1 nova mensagem/ })).toBeInTheDocument();

    Object.defineProperty(lista, 'scrollTop', { value: 3600, configurable: true, writable: true });
    fireEvent.scroll(lista);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /nova mensagem/ })).not.toBeInTheDocument();
    });
  });
});
