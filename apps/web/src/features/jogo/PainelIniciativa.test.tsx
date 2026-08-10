import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import {
  atributosIniciais,
  dadosIniciaisDaFicha,
  REGRA_DESEMPATE_INICIATIVA,
  type CombateAtivoDTO,
  type CombateDTO,
  type PersonagemDTO,
  type TokenDTO,
} from '@rolavinte/shared';
import { renderizarComProvedores } from '@/testes/utilitarios';
import { PainelIniciativa } from './PainelIniciativa';

/**
 * A aba de combate (RV-063).
 *
 * O que este arquivo mede é a metade que nenhum teste puro alcança: que a ordem
 * do servidor chega à tela na sequência em que veio, que "é a sua vez" é
 * perceptível **sem depender de cor**, que os controles do mestre não aparecem
 * para o jogador, e que cada mutação sai com o corpo que a rota espera.
 *
 * O cache de `['combate', mesaId]` é semeado em vez de mockado por rota: é ele o
 * contrato que o painel lê, e semeá-lo prova que o painel usa a **mesma chave e o
 * mesmo formato** que o socket e as mutações escrevem — duas verdades nesse cache
 * seriam a forma mais barata de o painel mentir.
 */

const MESA_ID = 'mesa-1';
const CENA_ID = 'cena-1';
const COMBATE_ID = 'combate-1';

const { requisitarFalso } = vi.hoisted(() => ({
  requisitarFalso: vi.fn<(caminho: string, opcoes?: unknown) => Promise<unknown>>(),
}));

vi.mock('@/lib/api', () => ({
  requisitar: requisitarFalso,
  enviarArquivo: vi.fn(),
  ErroApi: class ErroApi extends Error {},
}));

function token(campos: Partial<TokenDTO> = {}): TokenDTO {
  return {
    id: 'token-1',
    cenaId: CENA_ID,
    nome: 'Thorin',
    cor: '#c9a227',
    x: 1,
    y: 1,
    personagemId: null,
    imagemUrl: null,
    condicoes: [],
    ...campos,
  };
}

function ficha(campos: Partial<PersonagemDTO> = {}): PersonagemDTO {
  return {
    id: 'p1',
    mesaId: MESA_ID,
    donoId: 'u1',
    donoNome: 'Bruno',
    nome: 'Thorin',
    classe: 'Guerreiro',
    nivel: 3,
    pvAtual: 23,
    pvMax: 30,
    atributos: atributosIniciais('pathfinder2e'),
    anotacoes: '',
    sistema: 'pathfinder2e',
    dados: dadosIniciaisDaFicha('pathfinder2e'),
    ...campos,
  };
}

function combate(campos: Partial<CombateDTO> = {}): CombateDTO {
  return {
    id: COMBATE_ID,
    mesaId: MESA_ID,
    cenaId: CENA_ID,
    rodada: 2,
    // `indiceTurno` aponta para o **terceiro** participante de propósito, enquanto
    // `tokenIdDoTurno` diz o primeiro: o contrato manda usar o segundo campo, e um
    // painel que recalculasse o turno pelo índice realçaria a linha errada aqui.
    indiceTurno: 2,
    ativo: true,
    // Iniciativas **fora** de ordem decrescente, também de propósito: quem ordena
    // é o agregado `Combate` (empate por ordem de entrada, que o DTO não expõe).
    // Com a lista já ordenada, uma ordenação introduzida no cliente passaria verde
    // — foi o que aconteceu neste arquivo antes desta correção.
    participantes: [
      { tokenId: 'token-1', nome: 'Thorin', iniciativa: 12 },
      { tokenId: 'token-2', nome: 'Chefe Goblin', iniciativa: 18 },
      { tokenId: 'token-3', nome: 'Goblin', iniciativa: null },
    ],
    tokenIdDoTurno: 'token-1',
    ...campos,
  };
}

interface Cenario {
  combate?: CombateDTO | null;
  tokens?: TokenDTO[];
  personagens?: PersonagemDTO[];
  meusPersonagens?: PersonagemDTO[];
  souMestre?: boolean;
  motivoBloqueio?: string | null;
}

function renderizarPainel(cenario: Cenario = {}) {
  // `staleTime` alto para o cache semeado valer como resposta: o painel não
  // dispara `GET /mesas/:id/combate`, e as requisições que aparecerem no espião
  // são só as das mutações que o teste provocou.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 60_000, staleTime: 60_000 },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData<CombateAtivoDTO>(['combate', MESA_ID], {
    combate: cenario.combate === undefined ? combate() : cenario.combate,
  });
  return renderizarComProvedores(
    <PainelIniciativa
      mesaId={MESA_ID}
      souMestre={cenario.souMestre ?? false}
      tokens={cenario.tokens ?? []}
      personagens={cenario.personagens ?? []}
      meusPersonagens={cenario.meusPersonagens ?? []}
      motivoBloqueio={cenario.motivoBloqueio ?? null}
    />,
    { queryClient },
  );
}

beforeEach(() => {
  requisitarFalso.mockReset();
  requisitarFalso.mockResolvedValue(combate());
});

describe('PainelIniciativa — estado vazio (RV-063)', () => {
  it('sem combate, o jogador lê o que vai acontecer e não recebe botão de iniciar', () => {
    renderizarPainel({ combate: null, souMestre: false, tokens: [token()] });

    expect(screen.getByText('Nenhum combate em andamento.')).toBeInTheDocument();
    expect(screen.getByText(/Quando o mestre iniciar o combate/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciar combate' })).not.toBeInTheDocument();
  });

  it('sem combate, o mestre escolhe as peças da cena e inicia', async () => {
    const usuario = userEvent.setup();
    renderizarPainel({
      combate: null,
      souMestre: true,
      tokens: [token({ id: 'token-1', nome: 'Thorin' }), token({ id: 'token-2', nome: 'Gob1' })],
    });

    await usuario.click(screen.getByRole('button', { name: 'Iniciar combate' }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(`/mesas/${MESA_ID}/combate`, {
        metodo: 'POST',
        corpo: { tokenIds: ['token-1', 'token-2'] },
      });
    });
  });

  it('peça desmarcada fica fora da luta', async () => {
    const usuario = userEvent.setup();
    renderizarPainel({
      combate: null,
      souMestre: true,
      tokens: [token({ id: 'token-1', nome: 'Thorin' }), token({ id: 'token-2', nome: 'Gob1' })],
    });

    await usuario.click(screen.getByRole('checkbox', { name: /Gob1/ }));
    await usuario.click(screen.getByRole('button', { name: 'Iniciar combate' }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(`/mesas/${MESA_ID}/combate`, {
        metodo: 'POST',
        corpo: { tokenIds: ['token-1'] },
      });
    });
  });

  it('cena sem peça nenhuma explica o que falta em vez de oferecer um botão que falha', () => {
    renderizarPainel({ combate: null, souMestre: true, tokens: [] });

    expect(screen.getByText(/Não há nenhuma peça na cena em jogo/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciar combate' })).not.toBeInTheDocument();
  });

  it('mesa encerrada trava o início do combate com o motivo à vista (RV-023)', () => {
    renderizarPainel({
      combate: null,
      souMestre: true,
      tokens: [token()],
      motivoBloqueio: 'Esta mesa foi encerrada e está em modo somente leitura.',
    });

    const botao = screen.getByRole('button', { name: 'Iniciar combate' });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute(
      'title',
      'Esta mesa foi encerrada e está em modo somente leitura.',
    );
  });

  it('erro da rota aparece em vez de o clique falhar em silêncio', async () => {
    const usuario = userEvent.setup();
    requisitarFalso.mockRejectedValueOnce(new Error('Apenas o mestre pode iniciar o combate.'));
    renderizarPainel({ combate: null, souMestre: true, tokens: [token()] });

    await usuario.click(screen.getByRole('button', { name: 'Iniciar combate' }));

    expect(await screen.findByText(/Apenas o mestre pode iniciar o combate/)).toBeInTheDocument();
  });
});

describe('PainelIniciativa — a ordem que todos veem', () => {
  it('a lista sai na sequência do servidor, com iniciativa e nome', () => {
    renderizarPainel();

    const itens = within(screen.getByRole('list', { name: 'Ordem de iniciativa' })).getAllByRole(
      'listitem',
    );
    // Sequência exata, com o 12 na frente do 18: a ordem é a que o servidor mandou.
    // Uma ordenação feita no cliente inverteria as duas primeiras linhas.
    expect(itens.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Thorin'),
      expect.stringContaining('Chefe Goblin'),
      expect.stringContaining('Goblin'),
    ]);
    expect(itens[0]?.textContent).toContain('12');
    expect(itens[1]?.textContent).toContain('18');
    expect(itens[2]?.textContent).toContain('ainda não rolou');
  });

  it('a rodada e o total de participantes ficam no cabeçalho', () => {
    renderizarPainel();

    expect(screen.getByRole('heading', { name: '⚔️ Rodada 2' })).toBeInTheDocument();
    expect(screen.getByText('3 participantes')).toBeInTheDocument();
  });

  it('a regra de desempate é a do contrato, não uma frase redigida na tela (RV-158)', () => {
    renderizarPainel();

    // Importada de `@rolavinte/shared`: se a regra mudar no agregado, a frase muda
    // num lugar só. Redigi-la aqui deixaria a tela livre para anunciar um
    // desempate que o servidor não aplica (F6).
    expect(screen.getByText(REGRA_DESEMPATE_INICIATIVA)).toBeInTheDocument();
  });

  it('o PV do participante vem da ficha, e não do combate (RV-042)', () => {
    renderizarPainel({
      tokens: [token({ id: 'token-1', personagemId: 'p1' })],
      personagens: [ficha({ pvAtual: 23, pvMax: 30 })],
    });

    expect(screen.getByText(/23\/30 PV/)).toBeInTheDocument();
  });
});

describe('PainelIniciativa — de quem é a vez não depende de cor (DoD do RV-063)', () => {
  function comMinhaVez() {
    return renderizarPainel({
      tokens: [token({ id: 'token-1', personagemId: 'p1' })],
      personagens: [ficha()],
      meusPersonagens: [ficha()],
      combate: combate({ tokenIdDoTurno: 'token-1' }),
    });
  }

  it('a peça do turno é marcada com aria-current e com a palavra escrita', () => {
    renderizarPainel();

    const itens = within(screen.getByRole('list', { name: 'Ordem de iniciativa' })).getAllByRole(
      'listitem',
    );
    // Três canais no item da vez, e nenhum deles é a cor: o estado ARIA, o texto e
    // (na tela) o realce. Quem lê a lista com leitor de tela ou sem distinguir cor
    // ainda sabe de quem é a vez.
    expect(itens[0]).toHaveAttribute('aria-current', 'true');
    expect(itens[0]?.textContent).toContain('Na vez');
    expect(itens[1]).not.toHaveAttribute('aria-current');
    expect(itens[1]?.textContent).not.toContain('Na vez');
  });

  it('quando a vez é minha, o aviso é anunciado e diz "É a sua vez"', () => {
    comMinhaVez();

    const aviso = screen.getByRole('status');
    expect(aviso).toHaveTextContent('É a sua vez');
    // O sino é reforço; a frase é o que informa. Um destaque só de cor não
    // alcançaria quem está de olho no mapa nem quem usa leitor de tela.
    expect(aviso).toHaveTextContent('🔔');
    expect(screen.getByText(/Sua vez/)).toBeInTheDocument();
  });

  it('quando a vez é de outro, o painel diz de quem é — sem alarme falso', () => {
    renderizarPainel({
      tokens: [token({ id: 'token-1', personagemId: 'p1' })],
      personagens: [ficha()],
      meusPersonagens: [],
    });

    expect(screen.queryByText(/É a sua vez/)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Na vez: Thorin.');
  });
});

describe('PainelIniciativa — turno e encerramento são do mestre', () => {
  it('o jogador não recebe controle de turno nem de encerramento', () => {
    renderizarPainel({ souMestre: false });

    expect(screen.queryByRole('button', { name: /Passar turno/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Encerrar combate' })).not.toBeInTheDocument();
  });

  it('passar o turno chama a rota do combate', async () => {
    const usuario = userEvent.setup();
    renderizarPainel({ souMestre: true });

    await usuario.click(screen.getByRole('button', { name: /Passar turno/ }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(`/combates/${COMBATE_ID}/proximo-turno`, {
        metodo: 'POST',
        corpo: {},
      });
    });
  });

  it('encerrar pede confirmação explícita antes de esvaziar o painel de todos', async () => {
    const usuario = userEvent.setup();
    renderizarPainel({ souMestre: true });

    await usuario.click(screen.getByRole('button', { name: 'Encerrar combate' }));

    // Diálogo próprio, com foco preso e `aria-modal` (nada de `window.confirm`).
    const dialogo = screen.getByRole('dialog');
    expect(dialogo).toHaveAccessibleName('Encerrar o combate?');
    expect(requisitarFalso).not.toHaveBeenCalled();

    await usuario.click(within(dialogo).getByRole('button', { name: 'Encerrar combate' }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(`/combates/${COMBATE_ID}/encerrar`, {
        metodo: 'POST',
        corpo: {},
      });
    });
  });

  it('cancelar a confirmação não encerra nada', async () => {
    const usuario = userEvent.setup();
    renderizarPainel({ souMestre: true });

    await usuario.click(screen.getByRole('button', { name: 'Encerrar combate' }));
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requisitarFalso).not.toHaveBeenCalled();
  });

  it('o combate encerrado esvazia o painel lendo o mesmo formato do GET', async () => {
    const usuario = userEvent.setup();
    // A resposta do encerramento vem com `ativo: false`; é `aplicarCombate` quem a
    // traduz para `{ combate: null }`, o corpo que a rota de leitura devolve fora
    // da luta. Sem essa tradução única, o painel precisaria de um segundo estado.
    requisitarFalso.mockResolvedValue(combate({ ativo: false }));
    renderizarPainel({ souMestre: true });

    await usuario.click(screen.getByRole('button', { name: 'Encerrar combate' }));
    await usuario.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Encerrar combate' }),
    );

    expect(await screen.findByText('Nenhum combate em andamento.')).toBeInTheDocument();
  });

  it('mesa encerrada trava turno e encerramento com o motivo à vista', () => {
    renderizarPainel({ souMestre: true, motivoBloqueio: 'Esta mesa foi encerrada.' });

    for (const nome of [/Passar turno/, 'Encerrar combate'] as const) {
      const botao = screen.getByRole('button', { name: nome });
      expect(botao).toBeDisabled();
      expect(botao).toHaveAttribute('title', 'Esta mesa foi encerrada.');
    }
  });
});
