import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import type {
  CenaComTokensDTO,
  CombateAtivoDTO,
  CombateDTO,
  MesaDetalheDTO,
  PersonagemDTO,
  TokenDTO,
} from '@rolavinte/shared';
import { atributosIniciais, dadosIniciaisDaFicha } from '@rolavinte/shared';
import { renderizarComProvedores } from '@/testes/utilitarios';
import { SocketFalso } from '@/testes/socket-falso';
import { useSessao } from '@/features/auth/store-sessao';
import { PaginaMesa } from './PaginaMesa';
import { ROTULO_NO_TURNO } from './PecaToken';

/**
 * A aba de combate montada de dentro da `PaginaMesa` (RV-063).
 *
 * Este arquivo existe por causa de uma falha concreta deste projeto: um card
 * ficou com a metade da interface pronta e **sem caminho na tela** (RV-152).
 * Componente perfeito e inalcançável é entrega parcial disfarçada de verde, então
 * o que se mede aqui é o caminho: a aba aparece para todo participante, ela abre o
 * painel, e o realce do turno chega ao mapa pela mesma leitura do combate.
 */

const MESA_ID = 'mesa-1';
const CENA_ID = 'cena-1';
const EU = { id: 'u1', nome: 'Bruno', email: 'bruno@mesa.rpg' };

const { requisitarFalso } = vi.hoisted(() => ({
  requisitarFalso: vi.fn<(caminho: string, opcoes?: unknown) => Promise<unknown>>(),
}));
const contexto = vi.hoisted(() => ({ socket: null as unknown as SocketFalso }));

vi.mock('@/lib/api', () => ({
  requisitar: requisitarFalso,
  enviarArquivo: vi.fn(),
  ErroApi: class ErroApi extends Error {},
}));

vi.mock('@/lib/socket', () => ({
  obterSocket: () => contexto.socket,
  desconectarSocket: () => undefined,
}));

function mesa(meuPapel: MesaDetalheDTO['meuPapel']): MesaDetalheDTO {
  return {
    id: MESA_ID,
    nome: 'A Cripta',
    descricao: '',
    sistema: 'pathfinder2e',
    mestreId: meuPapel === 'mestre' ? EU.id : 'u9',
    mestreNome: meuPapel === 'mestre' ? EU.nome : 'Mestra',
    meuPapel,
    totalJogadores: 2,
    criadoEm: '2026-08-09T10:00:00.000Z',
    encerradaEm: null,
    jogadores: [],
  };
}

const TOKEN_THORIN: TokenDTO = {
  id: 'token-1',
  cenaId: CENA_ID,
  nome: 'Thorin',
  cor: '#c9a227',
  x: 1,
  y: 1,
  personagemId: 'p1',
  imagemUrl: null,
  condicoes: [],
};

const CENA_COM_TOKENS: CenaComTokensDTO = {
  cena: {
    id: CENA_ID,
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
  },
  tokens: [TOKEN_THORIN],
};

const THORIN: PersonagemDTO = {
  id: 'p1',
  mesaId: MESA_ID,
  donoId: EU.id,
  donoNome: EU.nome,
  nome: 'Thorin',
  classe: 'Guerreiro',
  nivel: 3,
  pvAtual: 23,
  pvMax: 30,
  atributos: atributosIniciais('pathfinder2e'),
  anotacoes: '',
  sistema: 'pathfinder2e',
  dados: dadosIniciaisDaFicha('pathfinder2e'),
};

const COMBATE: CombateDTO = {
  id: 'combate-1',
  mesaId: MESA_ID,
  cenaId: CENA_ID,
  rodada: 3,
  indiceTurno: 0,
  ativo: true,
  participantes: [{ tokenId: 'token-1', nome: 'Thorin', iniciativa: 18 }],
  tokenIdDoTurno: 'token-1',
};

function montarPagina(opcoes: { papel?: MesaDetalheDTO['meuPapel']; combate?: CombateDTO | null }) {
  const respostaCombate: CombateAtivoDTO = { combate: opcoes.combate ?? null };
  requisitarFalso.mockImplementation((caminho) => {
    if (caminho === `/mesas/${MESA_ID}`) return Promise.resolve(mesa(opcoes.papel ?? 'jogador'));
    if (caminho === `/mesas/${MESA_ID}/cena`) return Promise.resolve(CENA_COM_TOKENS);
    if (caminho === `/mesas/${MESA_ID}/personagens`) return Promise.resolve([THORIN]);
    if (caminho === `/mesas/${MESA_ID}/combate`) return Promise.resolve(respostaCombate);
    if (caminho === `/mesas/${MESA_ID}/mensagens`) return Promise.resolve([]);
    return Promise.resolve([]);
  });
  return renderizarComProvedores(
    <Routes>
      <Route path="/mesas/:mesaId" element={<PaginaMesa />} />
    </Routes>,
    { rota: `/mesas/${MESA_ID}` },
  );
}

beforeEach(() => {
  requisitarFalso.mockReset();
  contexto.socket = new SocketFalso();
  useSessao.setState({ token: 'jwt', usuario: EU });
});

describe('PaginaMesa — a aba de combate tem caminho na tela (RV-063)', () => {
  it('o jogador encontra a aba de combate e ela abre o painel', async () => {
    const usuario = userEvent.setup();
    montarPagina({ papel: 'jogador', combate: COMBATE });

    const aba = await screen.findByRole('button', { name: '⚔️ Combate' });
    await usuario.click(aba);

    expect(await screen.findByRole('heading', { name: '⚔️ Rodada 3' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Ordem de iniciativa' })).toBeInTheDocument();
  });

  it('fora da luta a aba mostra o estado vazio, e o jogador não vê botão de iniciar', async () => {
    const usuario = userEvent.setup();
    montarPagina({ papel: 'jogador', combate: null });

    await usuario.click(await screen.findByRole('button', { name: '⚔️ Combate' }));

    expect(await screen.findByText('Nenhum combate em andamento.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciar combate' })).not.toBeInTheDocument();
  });

  it('fora da luta o mestre recebe o botão de iniciar na mesma aba', async () => {
    const usuario = userEvent.setup();
    montarPagina({ papel: 'mestre', combate: null });

    await usuario.click(await screen.findByRole('button', { name: '⚔️ Combate' }));

    expect(await screen.findByRole('button', { name: 'Iniciar combate' })).toBeInTheDocument();
  });

  it('o realce do turno chega ao mapa sem a aba de combate estar aberta', async () => {
    // O mapa e o painel leem o **mesmo** cache `['combate', mesaId]`: a página não
    // mantém uma segunda cópia do turno para o tabletop. Por isso a peça já está
    // realçada com a aba do chat na frente.
    montarPagina({ papel: 'jogador', combate: COMBATE });

    expect(await screen.findByRole('img', { name: ROTULO_NO_TURNO })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Token Thorin, no turno/ })).toBeInTheDocument();
  });

  it('fora da luta nenhuma peça do mapa aparece realçada', async () => {
    montarPagina({ papel: 'jogador', combate: null });

    expect(await screen.findByRole('button', { name: /^Token Thorin/ })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: ROTULO_NO_TURNO })).not.toBeInTheDocument();
  });
});
