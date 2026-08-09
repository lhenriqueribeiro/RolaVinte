import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { ProvedorNotificacoes, useNotificar } from './Notificacao';

/**
 * Fila de toasts do RV-122.
 *
 * Três coisas precisam ser verdade e nenhuma delas é visual: o aviso é
 * **anunciado** (região `aria-live`), some sozinho sem deixar timer pendurado, e
 * a diferença entre sucesso e erro chega a quem não vê a cor da borda.
 */

function Provedor({ children }: { children: ReactNode }) {
  return <ProvedorNotificacoes duracaoMs={1000}>{children}</ProvedorNotificacoes>;
}

function BotoesDeTeste() {
  const notificar = useNotificar();
  return (
    <>
      <button type="button" onClick={() => notificar.sucesso('Convite enviado para ana@rpg.br.')}>
        Convidar
      </button>
      <button type="button" onClick={() => notificar.erro('A conexão caiu.')}>
        Falhar
      </button>
    </>
  );
}

describe('ProvedorNotificacoes', () => {
  it('confirma o sucesso silencioso numa região anunciada por leitor de tela', async () => {
    const usuario = userEvent.setup();
    render(
      <Provedor>
        <BotoesDeTeste />
      </Provedor>,
    );

    await usuario.click(screen.getByRole('button', { name: 'Convidar' }));

    const aviso = await screen.findByRole('status');
    expect(aviso).toHaveTextContent('Convite enviado para ana@rpg.br.');
    // A região que envolve a fila é `aria-live`, então o aviso é lido sem que
    // nada roube o foco de quem estava digitando.
    expect(aviso.closest('[aria-live]')).not.toBeNull();
  });

  it('sucesso e erro se distinguem por texto, não só pela cor da borda', async () => {
    const usuario = userEvent.setup();
    render(
      <Provedor>
        <BotoesDeTeste />
      </Provedor>,
    );

    await usuario.click(screen.getByRole('button', { name: 'Convidar' }));
    await usuario.click(screen.getByRole('button', { name: 'Falhar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Sucesso:');
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro: A conexão caiu.');
  });

  it('empilha vários avisos ao mesmo tempo', async () => {
    const usuario = userEvent.setup();
    render(
      <Provedor>
        <BotoesDeTeste />
      </Provedor>,
    );

    await usuario.click(screen.getByRole('button', { name: 'Convidar' }));
    await usuario.click(screen.getByRole('button', { name: 'Convidar' }));

    expect(await screen.findAllByRole('status')).toHaveLength(2);
  });

  it('pode ser dispensado na hora', async () => {
    const usuario = userEvent.setup();
    render(
      <Provedor>
        <BotoesDeTeste />
      </Provedor>,
    );
    await usuario.click(screen.getByRole('button', { name: 'Convidar' }));
    await screen.findByRole('status');

    await usuario.click(screen.getByRole('button', { name: 'Dispensar aviso' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('fora de um provedor, falha alto em vez de engolir a confirmação', () => {
    // Um `useNotificar` que virasse no-op sem provedor deixaria a confirmação
    // sumir em produção sem nenhum teste vermelho — F8 da taxonomia.
    const silenciarConsole = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useNotificar())).toThrow(/ProvedorNotificacoes/);
    silenciarConsole.mockRestore();
  });
});

describe('ProvedorNotificacoes — desaparecimento automático', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('some sozinho depois da duração configurada', () => {
    render(
      <Provedor>
        <BotoesDeTeste />
      </Provedor>,
    );

    act(() => {
      screen.getByRole('button', { name: 'Convidar' }).click();
    });
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    // E o temporizador não fica pendurado depois de disparar.
    expect(vi.getTimerCount()).toBe(0);
  });

  it('desmontar com a fila cheia não deixa timer atualizando um componente morto', () => {
    const { unmount } = render(
      <Provedor>
        <BotoesDeTeste />
      </Provedor>,
    );
    act(() => {
      screen.getByRole('button', { name: 'Convidar' }).click();
    });

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
