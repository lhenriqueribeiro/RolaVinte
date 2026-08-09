import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MensagemDTO } from '@rolavinte/shared';
import { renderizarComProvedores } from '@/testes/utilitarios';
import { Chat } from './Chat';

const MESA_ID = 'mesa-1';

const { requisitarFalso } = vi.hoisted(() => ({
  requisitarFalso: vi.fn<(caminho: string, opcoes?: unknown) => Promise<unknown>>(),
}));

vi.mock('@/lib/api', () => ({
  requisitar: requisitarFalso,
  ErroApi: class ErroApi extends Error {},
}));

const FALA: MensagemDTO = {
  id: 'm1',
  mesaId: MESA_ID,
  autorId: 'u1',
  autorNome: 'Aria',
  tipo: 'fala',
  conteudo: 'Abro a porta com cuidado.',
  rolagem: null,
  motivo: null,
  criadoEm: '2026-08-09T12:00:00.000Z',
};

beforeEach(() => {
  requisitarFalso.mockReset();
  // Sem `opcoes` é a leitura do histórico (GET); com `opcoes` é envio/rolagem.
  requisitarFalso.mockImplementation((_caminho, opcoes) =>
    opcoes === undefined ? Promise.resolve([FALA]) : Promise.resolve(FALA),
  );
});

async function abrirChat() {
  const usuario = userEvent.setup();
  renderizarComProvedores(<Chat mesaId={MESA_ID} />);
  const campo = await screen.findByLabelText('Mensagem');
  return { usuario, campo };
}

describe('Chat da mesa', () => {
  it('mostra o histórico carregado da API', async () => {
    await abrirChat();

    expect(await screen.findByText('Abro a porta com cuidado.')).toBeInTheDocument();
  });

  it('texto comum vira fala', async () => {
    const { usuario, campo } = await abrirChat();

    await usuario.type(campo, 'Abro a porta com cuidado.');
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(`/mesas/${MESA_ID}/mensagens`, {
        metodo: 'POST',
        corpo: { conteudo: 'Abro a porta com cuidado.' },
      });
    });
  });

  it('o comando /r vira rolagem, com o motivo depois do #', async () => {
    const { usuario, campo } = await abrirChat();

    await usuario.type(campo, '/r 2d20kh1+5 # ataque com vantagem');
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(`/mesas/${MESA_ID}/rolagens`, {
        metodo: 'POST',
        corpo: { expressao: '2d20kh1+5', motivo: 'ataque com vantagem' },
      });
    });
    expect(requisitarFalso).not.toHaveBeenCalledWith(
      `/mesas/${MESA_ID}/mensagens`,
      expect.objectContaining({ metodo: 'POST' }),
    );
  });

  it('o comando /rolar sem motivo envia motivo vazio', async () => {
    const { usuario, campo } = await abrirChat();

    await usuario.type(campo, '/rolar 4d6kh3');
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(`/mesas/${MESA_ID}/rolagens`, {
        metodo: 'POST',
        corpo: { expressao: '4d6kh3', motivo: '' },
      });
    });
  });

  it('não envia nada quando o campo só tem espaços', async () => {
    const { usuario, campo } = await abrirChat();

    await usuario.type(campo, '   ');
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(requisitarFalso).not.toHaveBeenCalledWith(
      expect.stringContaining('/mensagens'),
      expect.anything(),
    );
  });
});
