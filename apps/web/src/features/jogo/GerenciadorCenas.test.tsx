import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CenaComTokensDTO, CenaDTO } from '@rolavinte/shared';
import { criarQueryClientDeTeste, renderizarComProvedores } from '@/testes/utilitarios';
import { GerenciadorCenas } from './GerenciadorCenas';

const MESA_ID = 'mesa-1';

const { requisitarFalso } = vi.hoisted(() => ({
  requisitarFalso: vi.fn<(caminho: string, opcoes?: unknown) => Promise<unknown>>(),
}));

vi.mock('@/lib/api', () => ({
  requisitar: requisitarFalso,
  enviarArquivo: vi.fn(),
  ErroApi: class ErroApi extends Error {},
}));

function cena(campos: Partial<CenaDTO> & { id: string; nome: string }): CenaDTO {
  return {
    mesaId: MESA_ID,
    larguraGrid: 25,
    alturaGrid: 15,
    corFundo: '#1a2332',
    ativa: false,
    imagemFundoUrl: null,
    tamanhoCelula: 44,
    gridVisivel: true,
    corGrid: '#3a4a63',
    ...campos,
  };
}

const TAVERNA = cena({ id: 'c1', nome: 'Taverna' });
const CRIPTA = cena({ id: 'c2', nome: 'Cripta', ativa: true });

/** Responde à listagem e deixa as escritas para cada teste configurar. */
function responderLista(lista: CenaDTO[]) {
  requisitarFalso.mockImplementation((caminho) => {
    if (caminho === `/mesas/${MESA_ID}/cenas`) return Promise.resolve(lista);
    return Promise.resolve(undefined);
  });
}

async function montar(lista: CenaDTO[], motivoBloqueio: string | null = null) {
  responderLista(lista);
  const queryClient = criarQueryClientDeTeste();
  const resultado = renderizarComProvedores(
    <GerenciadorCenas mesaId={MESA_ID} motivoBloqueio={motivoBloqueio} />,
    { queryClient },
  );
  if (lista.length > 0) await screen.findByText(lista[0]!.nome);
  return resultado;
}

beforeEach(() => {
  requisitarFalso.mockReset();
});

describe('GerenciadorCenas — lista (RV-030)', () => {
  it('mostra as cenas preparadas, com a ativa marcada por texto e não só por cor', async () => {
    await montar([TAVERNA, CRIPTA]);

    expect(screen.getByText('Taverna')).toBeInTheDocument();
    expect(screen.getByText('Cripta')).toBeInTheDocument();
    expect(screen.getByText('Em jogo')).toBeInTheDocument();
    expect(screen.getByText('Inativa')).toBeInTheDocument();
  });

  it('cada cena expõe ativar, renomear e excluir com nome acessível próprio', async () => {
    await montar([TAVERNA, CRIPTA]);

    expect(screen.getByRole('button', { name: 'Ativar a cena Taverna' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Renomear a cena Taverna' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Excluir a cena Taverna' })).toBeEnabled();
  });
});

describe('GerenciadorCenas — ativar em um clique (RV-031)', () => {
  it('ativar publica o POST e já grava cena e tokens no cache do tabletop', async () => {
    const usuario = userEvent.setup();
    const resposta: CenaComTokensDTO = {
      cena: { ...TAVERNA, ativa: true },
      tokens: [
        {
          id: 't1',
          cenaId: TAVERNA.id,
          nome: 'Gob1',
          cor: '#e74c3c',
          x: 2,
          y: 3,
          personagemId: null,
          imagemUrl: null,
          condicoes: [],
        },
      ],
    };
    requisitarFalso.mockImplementation((caminho) => {
      if (caminho === `/mesas/${MESA_ID}/cenas`) return Promise.resolve([TAVERNA, CRIPTA]);
      if (caminho === `/cenas/${TAVERNA.id}/ativar`) return Promise.resolve(resposta);
      return Promise.resolve(undefined);
    });
    const queryClient = criarQueryClientDeTeste();
    // Espionado porque neste teste ninguém observa `['cena', mesaId]` (o
    // tabletop não está montado) e o cliente de teste coleta a entrada na hora.
    const gravar = vi.spyOn(queryClient, 'setQueryData');
    renderizarComProvedores(<GerenciadorCenas mesaId={MESA_ID} motivoBloqueio={null} />, {
      queryClient,
    });
    await screen.findByText('Taverna');

    await usuario.click(screen.getByRole('button', { name: 'Ativar a cena Taverna' }));

    await waitFor(() => {
      // O mapa troca sem refetch: nada de passar por um estado vazio.
      expect(gravar).toHaveBeenCalledWith(['cena', MESA_ID], resposta);
    });
    expect(requisitarFalso).toHaveBeenCalledWith(`/cenas/${TAVERNA.id}/ativar`, {
      metodo: 'POST',
      corpo: {},
    });
  });

  it('a cena que já está em jogo não oferece o botão de ativar', async () => {
    await montar([TAVERNA, CRIPTA]);

    expect(screen.getByRole('button', { name: 'Ativar a cena Cripta' })).toBeDisabled();
  });
});

describe('GerenciadorCenas — exclusão (RV-030)', () => {
  it('a única cena da mesa não pode ser excluída, e o motivo fica escrito', async () => {
    await montar([CRIPTA]);

    expect(screen.getByRole('button', { name: 'Excluir a cena Cripta' })).toBeDisabled();
    expect(
      screen.getByText('É a única cena da mesa. Crie outra antes de excluir esta.'),
    ).toBeInTheDocument();
  });

  it('a cena em jogo não pode ser excluída, com motivo diferente do anterior', async () => {
    await montar([TAVERNA, CRIPTA]);

    expect(screen.getByRole('button', { name: 'Excluir a cena Cripta' })).toBeDisabled();
    expect(
      screen.getByText('É a cena em jogo. Ative outra cena antes de excluí-la.'),
    ).toBeInTheDocument();
  });

  it('excluir cena inativa pede confirmação antes do DELETE', async () => {
    const usuario = userEvent.setup();
    await montar([TAVERNA, CRIPTA]);

    await usuario.click(screen.getByRole('button', { name: 'Excluir a cena Taverna' }));

    const dialogo = screen.getByRole('dialog');
    expect(dialogo).toHaveTextContent('todos os tokens posicionados nela');
    expect(requisitarFalso).not.toHaveBeenCalledWith(`/cenas/${TAVERNA.id}`, expect.anything());

    await usuario.click(screen.getByRole('button', { name: 'Excluir cena' }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(`/cenas/${TAVERNA.id}`, { metodo: 'DELETE' });
    });
  });

  it('o 409 da API aparece em PT-BR dentro do diálogo', async () => {
    const usuario = userEvent.setup();
    requisitarFalso.mockImplementation((caminho) => {
      if (caminho === `/mesas/${MESA_ID}/cenas`) return Promise.resolve([TAVERNA, CRIPTA]);
      return Promise.reject(new Error('Não é possível excluir a única cena da mesa.'));
    });
    renderizarComProvedores(<GerenciadorCenas mesaId={MESA_ID} motivoBloqueio={null} />);
    await screen.findByText('Taverna');

    await usuario.click(screen.getByRole('button', { name: 'Excluir a cena Taverna' }));
    await usuario.click(screen.getByRole('button', { name: 'Excluir cena' }));

    expect(
      await screen.findByText('Não é possível excluir a única cena da mesa.'),
    ).toBeInTheDocument();
  });
});

describe('GerenciadorCenas — renomear e criar (RV-030)', () => {
  it('renomear envia PATCH com o nome trimado e atualiza a lista em cache', async () => {
    const usuario = userEvent.setup();
    const renomeada = { ...TAVERNA, nome: 'Taverna do Javali' };
    requisitarFalso.mockImplementation((caminho) => {
      if (caminho === `/mesas/${MESA_ID}/cenas`) return Promise.resolve([TAVERNA, CRIPTA]);
      if (caminho === `/cenas/${TAVERNA.id}`) return Promise.resolve(renomeada);
      return Promise.resolve(undefined);
    });
    const queryClient = criarQueryClientDeTeste();
    renderizarComProvedores(<GerenciadorCenas mesaId={MESA_ID} motivoBloqueio={null} />, {
      queryClient,
    });
    await screen.findByText('Taverna');

    await usuario.click(screen.getByRole('button', { name: 'Renomear a cena Taverna' }));
    const campo = screen.getByLabelText('Novo nome da cena');
    await usuario.clear(campo);
    await usuario.type(campo, '  Taverna do Javali  ');
    await usuario.click(screen.getByRole('button', { name: 'Salvar nome' }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(`/cenas/${TAVERNA.id}`, {
        metodo: 'PATCH',
        corpo: { nome: 'Taverna do Javali' },
      });
    });
    await waitFor(() => {
      expect(queryClient.getQueryData<CenaDTO[]>(['cenas', MESA_ID])?.map((c) => c.nome)).toEqual([
        'Taverna do Javali',
        'Cripta',
      ]);
    });
  });

  it('criar cena envia o POST com nome e dimensões', async () => {
    const usuario = userEvent.setup();
    await montar([CRIPTA]);

    await usuario.type(screen.getByLabelText('Nome da cena'), 'Salão do trono');
    await usuario.click(screen.getByRole('button', { name: 'Criar cena' }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(`/mesas/${MESA_ID}/cenas`, {
        metodo: 'POST',
        corpo: { nome: 'Salão do trono', larguraGrid: 25, alturaGrid: 15 },
      });
    });
  });
});

describe('GerenciadorCenas — mesa encerrada (RV-023)', () => {
  it('trava todas as ações e escreve o motivo', async () => {
    await montar([TAVERNA, CRIPTA], 'Esta mesa foi encerrada.');

    expect(screen.getByRole('button', { name: 'Ativar a cena Taverna' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Renomear a cena Taverna' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Excluir a cena Taverna' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Criar cena' })).toBeDisabled();
    expect(screen.getByText('Esta mesa foi encerrada.')).toBeInTheDocument();
  });
});
