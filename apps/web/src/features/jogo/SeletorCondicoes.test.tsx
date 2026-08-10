import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import type { CenaComTokensDTO, CenaDTO, TokenDTO } from '@rolavinte/shared';
import { CONDICOES, CONDICOES_DISPONIVEIS } from '@rolavinte/shared';
import { renderizarComProvedores } from '@/testes/utilitarios';
import { PainelTokenSelecionado } from './PainelTokenSelecionado';
import { PecaToken } from './PecaToken';
import { SeletorCondicoes } from './SeletorCondicoes';

const MESA_ID = 'mesa-1';

const { requisitarFalso } = vi.hoisted(() => ({
  requisitarFalso: vi.fn<(caminho: string, opcoes?: unknown) => Promise<unknown>>(),
}));

vi.mock('@/lib/api', () => ({
  requisitar: requisitarFalso,
  enviarArquivo: vi.fn(),
  ErroApi: class ErroApi extends Error {},
}));

const CENA: CenaDTO = {
  id: 'cena-1',
  mesaId: MESA_ID,
  nome: 'Cripta',
  larguraGrid: 20,
  alturaGrid: 15,
  corFundo: '#1a1a1a',
  ativa: true,
  imagemFundoUrl: null,
  tamanhoCelula: 44,
  gridVisivel: true,
  corGrid: '#3a4a63',
};

function token(campos: Partial<TokenDTO> = {}): TokenDTO {
  return {
    id: 'token-1',
    cenaId: CENA.id,
    nome: 'Gob1',
    cor: '#e74c3c',
    x: 1,
    y: 1,
    personagemId: null,
    imagemUrl: null,
    condicoes: [],
    ...campos,
  };
}

beforeEach(() => {
  requisitarFalso.mockReset();
  requisitarFalso.mockResolvedValue(token({ condicoes: ['envenenado'] }));
});

describe('SeletorCondicoes — o catálogo é o ponto de extensão (RV-064)', () => {
  it('mostra um botão para cada condição do catálogo, com ícone E rótulo escrito', () => {
    renderizarComProvedores(
      <SeletorCondicoes mesaId={MESA_ID} token={token()} motivoBloqueio={null} />,
    );

    // Derivado do catálogo: acrescentar uma condição em @rolavinte/shared passa a
    // ser exercitado aqui sem editar este teste. Uma condição que o componente
    // deixasse de fora ficaria vermelha nomeando a chave.
    for (const chave of CONDICOES_DISPONIVEIS) {
      const definicao = CONDICOES[chave];
      const botao = screen.getByRole('button', { name: definicao.rotulo });
      // Ícone e texto juntos: nada é transmitido só por forma.
      expect(botao.textContent, `condição "${chave}" sem ícone no botão`).toContain(
        definicao.icone,
      );
      expect(botao.textContent, `condição "${chave}" sem rótulo escrito`).toContain(
        definicao.rotulo,
      );
    }
    expect(CONDICOES_DISPONIVEIS.length).toBeGreaterThan(0);
  });

  it('o estado marcado é dito em aria-pressed, não só pelo destaque visual', () => {
    renderizarComProvedores(
      <SeletorCondicoes
        mesaId={MESA_ID}
        token={token({ condicoes: ['caido'] })}
        motivoBloqueio={null}
      />,
    );

    expect(screen.getByRole('button', { name: 'Caído' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Envenenado' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('clicar numa condição desmarcada manda aplicada: true para a rota do token', async () => {
    const usuario = userEvent.setup();
    renderizarComProvedores(
      <SeletorCondicoes mesaId={MESA_ID} token={token()} motivoBloqueio={null} />,
    );

    await usuario.click(screen.getByRole('button', { name: 'Envenenado' }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith('/tokens/token-1/condicoes', {
        metodo: 'PATCH',
        corpo: { condicao: 'envenenado', aplicada: true },
      });
    });
  });

  it('clicar numa condição já marcada desmarca — aplicada: false', async () => {
    const usuario = userEvent.setup();
    renderizarComProvedores(
      <SeletorCondicoes
        mesaId={MESA_ID}
        token={token({ condicoes: ['caido'] })}
        motivoBloqueio={null}
      />,
    );

    await usuario.click(screen.getByRole('button', { name: 'Caído' }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith('/tokens/token-1/condicoes', {
        metodo: 'PATCH',
        corpo: { condicao: 'caido', aplicada: false },
      });
    });
  });

  it('a resposta remenda o cache da cena, sem refetch', async () => {
    const usuario = userEvent.setup();
    // `gcTime` próprio: o cliente padrão dos testes coleta a query sem
    // observador no primeiro macrotask, e a asserção mediria a coleta em vez do
    // remendo. Aqui ninguém monta `useCenaAtiva`, então a entrada precisa
    // sobreviver ao clique.
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 60_000, staleTime: 60_000 },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData<CenaComTokensDTO>(['cena', MESA_ID], {
      cena: CENA,
      tokens: [token()],
    });
    renderizarComProvedores(
      <SeletorCondicoes mesaId={MESA_ID} token={token()} motivoBloqueio={null} />,
      { queryClient },
    );

    await usuario.click(screen.getByRole('button', { name: 'Envenenado' }));

    await waitFor(() => {
      const cache = queryClient.getQueryData<CenaComTokensDTO>(['cena', MESA_ID]);
      expect(cache?.tokens.map((t) => t.condicoes)).toEqual([['envenenado']]);
    });
    // Uma requisição só: o remendo não pode disparar uma leitura da cena.
    expect(requisitarFalso).toHaveBeenCalledTimes(1);
  });

  it('mesa encerrada trava os botões e o motivo fica à vista no title', () => {
    renderizarComProvedores(
      <SeletorCondicoes
        mesaId={MESA_ID}
        token={token()}
        motivoBloqueio="Esta mesa foi encerrada."
      />,
    );

    const botao = screen.getByRole('button', { name: 'Caído' });
    expect(botao).toBeDisabled();
    // Controle desabilitado diz por quê — não desaparece sem explicação.
    expect(botao).toHaveAttribute('title', 'Esta mesa foi encerrada.');
  });

  it('erro da rota aparece para o mestre em vez de falhar em silêncio', async () => {
    const usuario = userEvent.setup();
    requisitarFalso.mockRejectedValueOnce(new Error('Apenas o mestre marca condições no token.'));
    renderizarComProvedores(
      <SeletorCondicoes mesaId={MESA_ID} token={token()} motivoBloqueio={null} />,
    );

    await usuario.click(screen.getByRole('button', { name: 'Caído' }));

    expect(await screen.findByText(/Apenas o mestre marca condições/)).toBeInTheDocument();
  });
});

describe('PainelTokenSelecionado — as condições ficam junto das propriedades', () => {
  it('o painel da peça selecionada oferece o grupo de condições', () => {
    renderizarComProvedores(
      <PainelTokenSelecionado
        mesaId={MESA_ID}
        token={token({ condicoes: ['caido'] })}
        motivoBloqueio={null}
        aoFechar={() => undefined}
      />,
    );

    // Sem esta montagem, o seletor poderia estar perfeito e não ter caminho na
    // interface — foi por não conferir isso que uma metade de card já ficou
    // pronta e inalcançável neste projeto (RV-152).
    expect(screen.getByRole('group', { name: 'Condições' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Caído' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('PecaToken — marcadores de condição na peça (RV-064)', () => {
  function renderizarPeca(condicoes: TokenDTO['condicoes']) {
    return renderizarComProvedores(
      <PecaToken
        token={token({ condicoes })}
        personagem={null}
        x={0}
        y={0}
        tamanhoCelula={44}
        selecionado={false}
        arrastando={false}
        podeMover
        aoApontar={() => undefined}
      />,
    );
  }

  it('cada ícone carrega rótulo textual acessível e title com a descrição', () => {
    renderizarPeca(['envenenado']);

    const icone = screen.getByRole('img', { name: 'Envenenado' });
    expect(icone).toHaveTextContent(CONDICOES.envenenado.icone);
    expect(icone).toHaveAttribute('title', `Envenenado — ${CONDICOES.envenenado.descricao}`);
  });

  it('as condições entram no rótulo do próprio botão da peça', () => {
    renderizarPeca(['caido', 'envenenado']);

    // Quem chega ao botão por teclado precisa ouvir o estado da peça ali.
    expect(
      screen.getByRole('button', { name: 'Token Gob1, condições: Caído, Envenenado' }),
    ).toBeInTheDocument();
  });

  it('peça sem condição não desenha lista nenhuma', () => {
    renderizarPeca([]);

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Token Gob1' })).toBeInTheDocument();
  });

  it('a lista é agrupada e nomeada pela peça', () => {
    renderizarPeca(['cego']);

    const lista = screen.getByRole('list', { name: 'Condições de Gob1' });
    expect(within(lista).getAllByRole('img')).toHaveLength(1);
  });

  it('DTO em cache de antes deste card (sem `condicoes`) não derruba a peça', () => {
    // O campo é obrigatório no tipo, mas um payload já em cache chega sem ele —
    // a razão de `normalizarCondicoes(token.condicoes ?? [])` no componente.
    const antigo = token();
    delete (antigo as Partial<TokenDTO>).condicoes;

    renderizarComProvedores(
      <PecaToken
        token={antigo}
        personagem={null}
        x={0}
        y={0}
        tamanhoCelula={44}
        selecionado={false}
        arrastando={false}
        podeMover
        aoApontar={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: 'Token Gob1' })).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('chave desconhecida vinda de uma versão futura é ignorada, não quebra o mapa', () => {
    renderizarPeca(['caido', 'banana' as never]);

    expect(screen.getByRole('img', { name: 'Caído' })).toBeInTheDocument();
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(within(screen.getByRole('list')).getAllByRole('img')).toHaveLength(1);
  });
});
