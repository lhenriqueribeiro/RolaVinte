import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { CenaDTO, PersonagemDTO, TokenDTO } from '@rolavinte/shared';
import { renderizarComProvedores } from '@/testes/utilitarios';
import { PecaToken, ROTULO_NO_TURNO } from './PecaToken';
import { Tabletop } from './Tabletop';

/**
 * Realce da peça do turno no mapa (RV-063).
 *
 * Arquivo próprio porque o que se mede aqui é **um** requisito e ele é de
 * acessibilidade: o card diz, no DoD, que a sinalização do turno não pode depender
 * apenas de cor. A moldura dourada é o reforço visual; o que informa são o
 * marcador com rótulo textual e o `aria-label` do botão da peça — e é isso que
 * está fixado abaixo.
 *
 * O segundo requisito medido é qual peça é realçada: `tokenIdDoTurno`, e nunca um
 * cálculo do índice do turno feito no cliente.
 */

const MESA_ID = 'mesa-1';
const CENA_ID = 'cena-1';

vi.mock('@/lib/api', () => ({
  requisitar: vi.fn(),
  enviarArquivo: vi.fn(),
  ErroApi: class ErroApi extends Error {},
}));

const CENA: CenaDTO = {
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
};

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

function renderizarPeca(campos: { noTurno?: boolean; token?: TokenDTO } = {}) {
  return renderizarComProvedores(
    <PecaToken
      token={campos.token ?? token()}
      personagem={null}
      x={0}
      y={0}
      tamanhoCelula={44}
      selecionado={false}
      noTurno={campos.noTurno}
      arrastando={false}
      podeMover
      aoApontar={() => undefined}
    />,
  );
}

function renderizarMapa(tokens: TokenDTO[], tokenIdDoTurno: string | null) {
  const personagens: PersonagemDTO[] = [];
  return renderizarComProvedores(
    <Tabletop
      mesaId={MESA_ID}
      cena={CENA}
      tokens={tokens}
      souMestre={false}
      meusPersonagens={personagens}
      personagens={personagens}
      tokenIdDoTurno={tokenIdDoTurno}
      motivoBloqueio={null}
    />,
  );
}

describe('PecaToken — o turno não é transmitido só por cor (DoD do RV-063)', () => {
  it('a peça do turno ganha marcador com rótulo textual e title', () => {
    renderizarPeca({ noTurno: true });

    const marcador = screen.getByRole('img', { name: ROTULO_NO_TURNO });
    // O símbolo sozinho não informa: `aria-label` para o leitor de tela e `title`
    // para quem passa o mouse, exatamente como os marcadores de condição.
    expect(marcador).toHaveAttribute('title', ROTULO_NO_TURNO);
    expect(marcador).toHaveTextContent('▶');
  });

  it('o rótulo do botão da peça diz que é a vez dela, logo depois do nome', () => {
    renderizarPeca({ noTurno: true });

    // Quem navega o mapa por teclado chega ao botão: o estado tem de ser legível
    // no elemento com que se interage, e não só num ícone ao lado.
    expect(screen.getByRole('button', { name: 'Token Thorin, no turno' })).toBeInTheDocument();
  });

  it('fora do turno não há marcador nenhum, e o rótulo continua o de sempre', () => {
    renderizarPeca({ noTurno: false });

    expect(screen.queryByRole('img', { name: ROTULO_NO_TURNO })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Token Thorin' })).toBeInTheDocument();
  });

  it('o realce convive com as condições da peça sem apagar nenhuma informação', () => {
    renderizarPeca({ noTurno: true, token: token({ condicoes: ['envenenado'] }) });

    expect(
      screen.getByRole('button', { name: 'Token Thorin, no turno, condições: Envenenado' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: ROTULO_NO_TURNO })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Envenenado' })).toBeInTheDocument();
  });
});

describe('Tabletop — realce vem de tokenIdDoTurno (RV-063)', () => {
  it('realça exatamente a peça que o combate aponta', () => {
    renderizarMapa(
      [token({ id: 'token-1', nome: 'Thorin' }), token({ id: 'token-2', nome: 'Gob1' })],
      'token-2',
    );

    // Um marcador só, e na peça certa: o mapa não recalcula o turno pelo índice.
    expect(screen.getAllByRole('img', { name: ROTULO_NO_TURNO })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Token Gob1, no turno' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Token Thorin' })).toBeInTheDocument();
  });

  it('fora da luta nenhuma peça é realçada', () => {
    renderizarMapa([token({ id: 'token-1' }), token({ id: 'token-2', nome: 'Gob1' })], null);

    expect(screen.queryByRole('img', { name: ROTULO_NO_TURNO })).not.toBeInTheDocument();
  });

  it('turno apontando para peça que já não está na cena não realça nada nem quebra o mapa', () => {
    renderizarMapa([token({ id: 'token-1' })], 'token-apagado');

    expect(screen.queryByRole('img', { name: ROTULO_NO_TURNO })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Token Thorin' })).toBeInTheDocument();
  });
});
