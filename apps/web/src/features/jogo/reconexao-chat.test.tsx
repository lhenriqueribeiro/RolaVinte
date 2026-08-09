import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MensagemDTO, MesaDetalheDTO } from '@rolavinte/shared';
import { renderizarComProvedores } from '@/testes/utilitarios';
import { useSessao } from '@/features/auth/store-sessao';
import { Chat } from './Chat';
import { motivoDeConexao } from './store-conexao';

/**
 * "Mensagem digitada não se perde" (RV-112).
 *
 * O critério de aceite é sobre o campo do chat, então o teste é sobre o campo do
 * chat. A `PaginaMesa` bloqueia a escrita reusando a prop `motivoBloqueio` que o
 * encerramento de mesa já usava — o que significa que o `Chat` **desabilita** o
 * campo em vez de desmontá-lo. A diferença é invisível no código e decisiva na
 * mesa: um `{conectado && <Chat/>}` apagaria a frase que o jogador escreveu
 * enquanto a rede caía, e ninguém notaria até acontecer em jogo.
 *
 * O motivo exibido vem de `motivoDeConexao('reconectando')`, e não de uma string
 * copiada: se o texto mudar, este teste continua medindo o texto de verdade.
 */

const MESA_ID = 'mesa-1';
const EU = { id: 'u1', nome: 'Aria', email: 'aria@mesa.rpg' };
const MOTIVO_RECONECTANDO = motivoDeConexao('reconectando');

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

const HISTORICO: MensagemDTO[] = [
  {
    id: 'm1',
    mesaId: MESA_ID,
    autorId: 'u9',
    autorNome: 'Mestra',
    tipo: 'fala',
    conteudo: 'A porta range.',
    rolagem: null,
    motivo: null,
    criadoEm: '2026-08-09T12:00:00.000Z',
    destinatarioId: null,
    destinatarioNome: null,
  },
];

beforeEach(() => {
  requisitarFalso.mockReset();
  requisitarFalso.mockImplementation((caminho) =>
    Promise.resolve(caminho === `/mesas/${MESA_ID}` ? MESA : HISTORICO),
  );
  useSessao.setState({ token: 'jwt', usuario: EU });
});

describe('queda de conexão no chat (RV-112)', () => {
  it('o texto digitado sobrevive ao bloqueio e continua lá quando a conexão volta', async () => {
    const usuario = userEvent.setup();
    const { rerender } = renderizarComProvedores(<Chat mesaId={MESA_ID} />);

    const campo = await screen.findByLabelText('Mensagem');
    await usuario.type(campo, 'Eu ataco o esqueleto com a maça!');

    // A rede cai: a página passa o motivo adiante, o Chat desabilita o envio.
    rerender(<Chat mesaId={MESA_ID} motivoBloqueio={MOTIVO_RECONECTANDO} />);
    expect(await screen.findByLabelText('Mensagem')).toHaveValue(
      'Eu ataco o esqueleto com a maça!',
    );

    // E volta: o jogador só precisa apertar Enviar.
    rerender(<Chat mesaId={MESA_ID} />);
    expect(await screen.findByLabelText('Mensagem')).toHaveValue(
      'Eu ataco o esqueleto com a maça!',
    );
  });

  it('enquanto desconectado, campo e botão ficam desabilitados COM o motivo à vista', async () => {
    renderizarComProvedores(<Chat mesaId={MESA_ID} motivoBloqueio={MOTIVO_RECONECTANDO} />);

    expect(await screen.findByLabelText('Mensagem')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    // Botão desligado sem explicação é pior do que botão desligado com ela.
    expect(screen.getByText(new RegExp(MOTIVO_RECONECTANDO!.slice(0, 40)))).toBeInTheDocument();
  });

  it('nada é enviado enquanto a conexão está fora', async () => {
    const usuario = userEvent.setup();
    renderizarComProvedores(<Chat mesaId={MESA_ID} motivoBloqueio={MOTIVO_RECONECTANDO} />);
    await screen.findByLabelText('Mensagem');
    requisitarFalso.mockClear();

    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));

    const escritas = requisitarFalso.mock.calls.filter(([, opcoes]) => opcoes !== undefined);
    expect(escritas).toEqual([]);
  });

  it('o histórico continua legível durante a queda', async () => {
    renderizarComProvedores(<Chat mesaId={MESA_ID} motivoBloqueio={MOTIVO_RECONECTANDO} />);

    expect(await screen.findByText('A porta range.')).toBeInTheDocument();
  });
});
