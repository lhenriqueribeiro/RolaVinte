import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CenaDTO, PersonagemDTO, TokenDTO } from '@rolavinte/shared';
import { renderizarComProvedores } from '@/testes/utilitarios';
import { Tabletop } from './Tabletop';
import { CAMERA_INICIAL, ESCALA_MAXIMA, ESCALA_MINIMA, useTabletop } from './store-tabletop';

const MESA_ID = 'mesa-1';
const CELULA = 44;

const { requisitarFalso, enviarArquivoFalso } = vi.hoisted(() => ({
  requisitarFalso: vi.fn<(caminho: string, opcoes?: unknown) => Promise<unknown>>(),
  enviarArquivoFalso: vi.fn<(caminho: string, campo: string, arquivo: File) => Promise<unknown>>(),
}));

vi.mock('@/lib/api', () => ({
  requisitar: requisitarFalso,
  enviarArquivo: enviarArquivoFalso,
  ErroApi: class ErroApi extends Error {},
}));

const CENA: CenaDTO = {
  id: 'cena-1',
  mesaId: MESA_ID,
  nome: 'Cripta',
  larguraGrid: 40,
  alturaGrid: 30,
  corFundo: '#1a1a1a',
  ativa: true,
  imagemFundoUrl: null,
  tamanhoCelula: CELULA,
  gridVisivel: true,
  corGrid: '#ffffff',
};

const TOKEN: TokenDTO = {
  id: 'token-1',
  cenaId: CENA.id,
  nome: 'Aria',
  cor: '#c9a227',
  x: 1,
  y: 1,
  personagemId: null,
  imagemUrl: null,
};

/** Câmera do estado inicial: o efeito de centralização roda na montagem. */
function redefinirCamera() {
  act(() => {
    useTabletop.setState(CAMERA_INICIAL);
  });
}

function personagem(campos: Partial<PersonagemDTO> = {}): PersonagemDTO {
  return {
    id: 'p1',
    mesaId: MESA_ID,
    donoId: 'u1',
    donoNome: 'Aria',
    nome: 'Thorin',
    classe: 'Guerreiro',
    nivel: 3,
    pvAtual: 30,
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
    // Campos que o RV-091 acrescentou ao `PersonagemDTO`.
    sistema: 'dnd5e',
    dados: {},
    ...campos,
  };
}

interface OpcoesMontagem {
  cena?: CenaDTO;
  tokens?: TokenDTO[];
  personagens?: PersonagemDTO[];
  souMestre?: boolean;
  motivoBloqueio?: string | null;
}

function montar(opcoes: OpcoesMontagem = {}) {
  const cena = opcoes.cena ?? CENA;
  const tokens = opcoes.tokens ?? [TOKEN];
  const resultado = renderizarComProvedores(
    <Tabletop
      mesaId={MESA_ID}
      cena={cena}
      tokens={tokens}
      souMestre={opcoes.souMestre ?? true}
      meusPersonagens={[]}
      personagens={opcoes.personagens ?? []}
      motivoBloqueio={opcoes.motivoBloqueio ?? null}
    />,
  );
  redefinirCamera();
  const visor = screen.getByRole('application', { name: `Mapa da cena ${cena.nome}` });
  const token = screen.getByRole('button', { name: new RegExp(`^Token ${tokens[0]?.nome}`) });
  return Object.assign(resultado, { visor, token });
}

/**
 * jsdom 26 não implementa `PointerEvent`; um `MouseEvent` com o nome do evento
 * de ponteiro é suficiente para o sistema de eventos do React, que lê
 * `clientX`/`clientY`/`button` do evento nativo.
 */
function dispararPonteiro(alvo: Element, tipo: string, init: MouseEventInit = {}) {
  fireEvent(alvo, new MouseEvent(tipo, { bubbles: true, cancelable: true, ...init }));
}

function girarRoda(alvo: Element, init: WheelEventInit) {
  fireEvent(alvo, new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init }));
}

function camera() {
  const { escala, deslocX, deslocY } = useTabletop.getState();
  return { escala, deslocX, deslocY };
}

beforeEach(() => {
  requisitarFalso.mockReset();
  requisitarFalso.mockResolvedValue(TOKEN);
  enviarArquivoFalso.mockReset();
  enviarArquivoFalso.mockResolvedValue(TOKEN);
  useTabletop.setState(CAMERA_INICIAL);
});

describe('Tabletop — controles de câmera', () => {
  it('expõe +, − e centralizar como botões com aria-label', () => {
    montar();

    expect(screen.getByRole('button', { name: 'Aproximar o mapa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Afastar o mapa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Centralizar o mapa' })).toBeInTheDocument();
  });

  it('aproximar pelo teclado amplia a escala e mostra a porcentagem', async () => {
    const usuario = userEvent.setup();
    montar();

    // Os controles são alcançáveis por Tab, na ordem em que aparecem na barra.
    await usuario.tab();
    expect(screen.getByRole('button', { name: 'Afastar o mapa' })).toHaveFocus();
    await usuario.tab();
    expect(screen.getByRole('button', { name: 'Aproximar o mapa' })).toHaveFocus();
    await usuario.keyboard('{Enter}');

    expect(camera().escala).toBeCloseTo(1.25, 10);
    expect(screen.getByText('125%')).toBeInTheDocument();
  });

  it('respeita os limites de escala nos dois extremos', async () => {
    const usuario = userEvent.setup();
    montar();
    const aproximar = screen.getByRole('button', { name: 'Aproximar o mapa' });
    const afastar = screen.getByRole('button', { name: 'Afastar o mapa' });

    for (let i = 0; i < 12; i += 1) await usuario.click(aproximar);
    expect(camera().escala).toBe(ESCALA_MAXIMA);
    expect(screen.getByText('300%')).toBeInTheDocument();

    for (let i = 0; i < 20; i += 1) await usuario.click(afastar);
    expect(camera().escala).toBe(ESCALA_MINIMA);
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  it('centralizar volta para escala 1', async () => {
    const usuario = userEvent.setup();
    montar();

    await usuario.click(screen.getByRole('button', { name: 'Aproximar o mapa' }));
    await usuario.click(screen.getByRole('button', { name: 'Centralizar o mapa' }));

    expect(camera().escala).toBe(1);
  });

  it('Ctrl + roda amplia ancorado no cursor', () => {
    const { visor } = montar();

    girarRoda(visor, { ctrlKey: true, deltaY: -100, clientX: 200, clientY: 100 });

    // O visor mede 0×0 no jsdom, então a âncora é o próprio ponto do cursor:
    // desloc = ancora − mundo × escala, com mundo = ancora na escala 1.
    expect(camera().escala).toBeCloseTo(1.25, 10);
    expect(camera().deslocX).toBeCloseTo(200 - 200 * 1.25, 10);
    expect(camera().deslocY).toBeCloseTo(100 - 100 * 1.25, 10);
  });

  it('roda sem Ctrl arrasta o mapa em vez de dar zoom', () => {
    const { visor } = montar();

    girarRoda(visor, { deltaX: 30, deltaY: 100 });

    expect(camera()).toEqual({ escala: 1, deslocX: -30, deslocY: -100 });
  });

  it('barra de espaço com o ponteiro arrasta a câmera', () => {
    const { visor } = montar();

    fireEvent.keyDown(visor, { key: ' ', code: 'Space' });
    dispararPonteiro(visor, 'pointerdown', { clientX: 100, clientY: 100 });
    dispararPonteiro(visor, 'pointermove', { clientX: 140, clientY: 70 });
    dispararPonteiro(visor, 'pointerup', { clientX: 140, clientY: 70 });
    fireEvent.keyUp(visor, { key: ' ', code: 'Space' });

    expect(camera()).toEqual({ escala: 1, deslocX: 40, deslocY: -30 });
  });

  it('botão do meio arrasta a câmera sem a barra de espaço', () => {
    const { visor } = montar();

    dispararPonteiro(visor, 'pointerdown', { button: 1, clientX: 10, clientY: 10 });
    dispararPonteiro(visor, 'pointermove', { clientX: 25, clientY: 35 });
    dispararPonteiro(visor, 'pointerup', { clientX: 25, clientY: 35 });

    expect(camera()).toEqual({ escala: 1, deslocX: 15, deslocY: 25 });
  });

  it('nenhuma requisição sai por zoom nem por pan', async () => {
    const usuario = userEvent.setup();
    const { visor } = montar();

    await usuario.click(screen.getByRole('button', { name: 'Aproximar o mapa' }));
    girarRoda(visor, { ctrlKey: true, deltaY: -100, clientX: 50, clientY: 50 });
    girarRoda(visor, { deltaY: 100 });
    await usuario.click(screen.getByRole('button', { name: 'Centralizar o mapa' }));

    expect(requisitarFalso).not.toHaveBeenCalled();
  });
});

describe('Tabletop — arrasto de token com a câmera aplicada', () => {
  it('persiste a célula (12,7) mesmo com escala 0,5', async () => {
    const { visor, token } = montar();
    act(() => {
      useTabletop.setState({ escala: 0.5, deslocX: 0, deslocY: 0 });
    });

    // Centro da célula (12,7) em pixels de tela para essa câmera.
    const alvo = { clientX: 12.5 * CELULA * 0.5, clientY: 7.5 * CELULA * 0.5 };
    dispararPonteiro(token, 'pointerdown', { clientX: 0, clientY: 0 });
    dispararPonteiro(visor, 'pointermove', alvo);
    dispararPonteiro(visor, 'pointerup', alvo);

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(`/tokens/${TOKEN.id}/posicao`, {
        metodo: 'PATCH',
        corpo: { tokenId: TOKEN.id, x: 12, y: 7 },
      });
    });
  });

  it('persiste a célula (12,7) com escala 2 e câmera deslocada', async () => {
    const { visor, token } = montar();
    act(() => {
      useTabletop.setState({ escala: 2, deslocX: -500, deslocY: -300 });
    });

    const alvo = {
      clientX: 12.5 * CELULA * 2 - 500,
      clientY: 7.5 * CELULA * 2 - 300,
    };
    dispararPonteiro(token, 'pointerdown', { clientX: 0, clientY: 0 });
    dispararPonteiro(visor, 'pointermove', alvo);
    dispararPonteiro(visor, 'pointerup', alvo);

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(`/tokens/${TOKEN.id}/posicao`, {
        metodo: 'PATCH',
        corpo: { tokenId: TOKEN.id, x: 12, y: 7 },
      });
    });
  });

  it('respeita o tamanho de célula da cena (RV-033) na conversão', async () => {
    const { visor, token } = montar({ cena: { ...CENA, tamanhoCelula: 64 } });
    act(() => {
      useTabletop.setState({ escala: 0.5, deslocX: 40, deslocY: -25 });
    });

    const alvo = { clientX: 12.5 * 64 * 0.5 + 40, clientY: 7.5 * 64 * 0.5 - 25 };
    dispararPonteiro(token, 'pointerdown', { clientX: 0, clientY: 0 });
    dispararPonteiro(visor, 'pointermove', alvo);
    dispararPonteiro(visor, 'pointerup', alvo);

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(`/tokens/${TOKEN.id}/posicao`, {
        metodo: 'PATCH',
        corpo: { tokenId: TOKEN.id, x: 12, y: 7 },
      });
    });
  });

  it('com a barra de espaço pressionada o gesto sobre o token é pan, não arrasto', () => {
    const { visor, token } = montar();
    fireEvent.keyDown(visor, { key: ' ', code: 'Space' });

    dispararPonteiro(token, 'pointerdown', { clientX: 100, clientY: 100 });
    dispararPonteiro(visor, 'pointermove', { clientX: 120, clientY: 100 });
    dispararPonteiro(visor, 'pointerup', { clientX: 120, clientY: 100 });

    expect(camera().deslocX).toBe(20);
    expect(requisitarFalso).not.toHaveBeenCalled();
  });

  it('mesa encerrada não move token', () => {
    const { visor, token } = montar({ motivoBloqueio: 'Esta mesa foi encerrada.' });

    dispararPonteiro(token, 'pointerdown', { clientX: 0, clientY: 0 });
    dispararPonteiro(visor, 'pointermove', { clientX: 550, clientY: 330 });
    dispararPonteiro(visor, 'pointerup', { clientX: 550, clientY: 330 });

    expect(requisitarFalso).not.toHaveBeenCalled();
  });
});

describe('Tabletop — mapa de fundo e grid da cena (RV-032 / RV-033)', () => {
  it('renderiza a imagem de fundo cobrindo exatamente a área do grid', () => {
    const { container } = montar({
      cena: { ...CENA, imagemFundoUrl: 'https://storage.local/mapas/cripta.png' },
    });

    const mapa = container.querySelector('img[src="https://storage.local/mapas/cripta.png"]');
    expect(mapa).toBeInTheDocument();
    // Decorativa: quem nomeia a cena é o rótulo do visor, não a imagem.
    expect(mapa).toHaveAttribute('alt', '');
    expect(mapa?.className).toContain('h-full');
    expect(mapa?.className).toContain('w-full');
  });

  it('sem imagem de fundo o mapa continua sendo só a cor da cena', () => {
    const { container } = montar();

    expect(container.querySelector('img')).toBeNull();
  });

  it('desenha as linhas com a cor e o tamanho de célula da cena', () => {
    const { container } = montar({ cena: { ...CENA, tamanhoCelula: 64, corGrid: '#3a4a63' } });

    const grid = container.querySelector<HTMLElement>('[data-testid="linhas-do-grid"]');
    expect(grid?.style.backgroundSize).toBe('64px 64px');
    expect(grid?.style.backgroundImage).toContain('rgba(58, 74, 99, 0.45)');
  });

  it('grid oculto some da tela, e os tokens continuam alinhados às células', () => {
    const { container } = montar({ cena: { ...CENA, gridVisivel: false } });

    expect(container.querySelector('[data-testid="linhas-do-grid"]')).toBeNull();
    // O token de (1,1) continua em (1×44, 1×44) — ocultar o grid é cosmético.
    const peca = screen.getByRole('button', { name: `Token ${TOKEN.nome}` }).parentElement;
    expect(peca).toHaveStyle({ left: `${CELULA}px`, top: `${CELULA}px` });
  });

  it.each([44, 64])(
    'token em (3,2) é posicionado em (3×%i, 2×%i) — o Tabletop lê cena.tamanhoCelula',
    (celula) => {
      montar({
        cena: { ...CENA, tamanhoCelula: celula },
        tokens: [{ ...TOKEN, x: 3, y: 2 }],
      });

      const peca = screen.getByRole('button', { name: `Token ${TOKEN.nome}` }).parentElement;
      expect(peca).toHaveStyle({
        left: `${3 * celula}px`,
        top: `${2 * celula}px`,
        width: `${celula}px`,
        height: `${celula}px`,
      });
    },
  );
});

describe('Tabletop — arte do token (RV-041)', () => {
  const COM_ARTE: TokenDTO = { ...TOKEN, imagemUrl: 'https://storage.local/tokens/goblin.png' };

  it('exibe a arte recortada em círculo e mantém a cor na borda', () => {
    montar({ tokens: [COM_ARTE] });

    const arte = screen.getByRole('button', { name: `Token ${TOKEN.nome}` });
    const imagem = arte.querySelector('img');
    expect(imagem).toHaveAttribute('src', COM_ARTE.imagemUrl);
    expect(imagem?.className).toContain('rounded-full');
    expect(imagem?.className).toContain('object-cover');
    expect(arte).toHaveStyle({ borderColor: '#c9a227' });
    // Com arte, as iniciais saem de cena.
    expect(arte).not.toHaveTextContent('Aria');
  });

  it('sem arte mantém cor de fundo e as 4 primeiras letras do nome', () => {
    montar({ tokens: [{ ...TOKEN, nome: 'Chefe Goblin' }] });

    const peca = screen.getByRole('button', { name: 'Token Chefe Goblin' });
    expect(peca).toHaveTextContent('Chef');
    expect(peca).toHaveStyle({ backgroundColor: '#c9a227' });
  });

  it('arte que falha ao carregar cai no fallback de cor e iniciais', () => {
    montar({ tokens: [{ ...COM_ARTE, nome: 'Chefe Goblin' }] });
    const peca = screen.getByRole('button', { name: 'Token Chefe Goblin' });
    const imagem = peca.querySelector('img');
    expect(imagem).not.toBeNull();

    // Uma URL que responde 404 não pode deixar buraco no mapa.
    fireEvent.error(imagem as HTMLImageElement);

    expect(peca.querySelector('img')).toBeNull();
    expect(peca).toHaveTextContent('Chef');
  });
});

describe('Tabletop — barra de vida do token (RV-042)', () => {
  const VINCULADO: TokenDTO = { ...TOKEN, nome: 'Thorin', personagemId: 'p1' };

  function barra() {
    return screen.getByRole('progressbar', { name: 'Pontos de vida de Thorin' });
  }

  it('token sem personagem vinculado não tem barra', () => {
    montar({ tokens: [TOKEN], personagens: [personagem()] });

    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('token vinculado mostra a barra com os PV escritos e no rótulo acessível', () => {
    montar({ tokens: [VINCULADO], personagens: [personagem({ pvAtual: 12, pvMax: 30 })] });

    expect(barra()).toHaveAttribute('aria-valuenow', '12');
    expect(barra()).toHaveAttribute('aria-valuemax', '30');
    expect(barra()).toHaveAttribute('aria-valuetext', '12/30 PV');
    // Rótulo visível: a faixa de cor não é o único canal de informação.
    expect(screen.getByText('12/30 PV')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Token Thorin, 12/30 PV' })).toBeInTheDocument();
  });

  it.each([
    [30, 'bg-sucesso', '100%'],
    [16, 'bg-sucesso', `${(16 / 30) * 100}%`],
    [12, 'bg-ouro', '40%'],
    [8, 'bg-ouro', `${(8 / 30) * 100}%`],
    [7, 'bg-perigo', `${(7 / 30) * 100}%`],
    [0, 'bg-perigo', '0%'],
  ])('com %i de 30 PV a barra usa %s', (pvAtual, classe, largura) => {
    const { container } = montar({
      tokens: [VINCULADO],
      personagens: [personagem({ pvAtual, pvMax: 30 })],
    });

    const preenchimento = container.querySelector<HTMLElement>(`[role="progressbar"] > div`);
    expect(preenchimento?.className).toContain(classe);
    expect(preenchimento?.style.width).toBe(largura);
  });

  it('token vinculado a personagem que não veio no cache não quebra o mapa', () => {
    montar({ tokens: [VINCULADO], personagens: [] });

    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByRole('button', { name: 'Token Thorin' })).toBeInTheDocument();
  });
});

describe('Tabletop — painel de propriedades do token (RV-040)', () => {
  it('o mestre abre o painel ao selecionar o token', () => {
    const { token } = montar();

    expect(screen.queryByRole('complementary')).toBeNull();
    dispararPonteiro(token, 'pointerdown', { clientX: 0, clientY: 0 });

    expect(
      screen.getByRole('complementary', { name: `Propriedades do token ${TOKEN.nome}` }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toHaveValue(TOKEN.nome);
  });

  it('o jogador não vê o painel de propriedades — só o mestre edita', () => {
    const { token } = montar({ souMestre: false });

    dispararPonteiro(token, 'pointerdown', { clientX: 0, clientY: 0 });

    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('renomear envia PATCH em /tokens/:id com o nome trimado', async () => {
    const usuario = userEvent.setup();
    const { token } = montar();
    dispararPonteiro(token, 'pointerdown', { clientX: 0, clientY: 0 });

    const campo = screen.getByLabelText('Nome');
    await usuario.clear(campo);
    await usuario.type(campo, '  Chefe Goblin  ');
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(`/tokens/${TOKEN.id}`, {
        metodo: 'PATCH',
        corpo: { nome: 'Chefe Goblin', cor: TOKEN.cor },
      });
    });
  });

  it('a barra de espaço digitada no nome não vira pan do mapa', async () => {
    const usuario = userEvent.setup();
    const { token } = montar();
    dispararPonteiro(token, 'pointerdown', { clientX: 0, clientY: 0 });

    const campo = screen.getByLabelText('Nome');
    await usuario.clear(campo);
    await usuario.type(campo, 'Chefe Goblin');

    expect(campo).toHaveValue('Chefe Goblin');
  });

  it('recolorir envia a cor nova junto com o nome atual', async () => {
    const usuario = userEvent.setup();
    const { token } = montar();
    dispararPonteiro(token, 'pointerdown', { clientX: 0, clientY: 0 });

    fireEvent.change(screen.getByLabelText('Cor'), { target: { value: '#00ff00' } });
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(`/tokens/${TOKEN.id}`, {
        metodo: 'PATCH',
        corpo: { nome: TOKEN.nome, cor: '#00ff00' },
      });
    });
  });

  it('enviar arte usa o campo multipart do contrato (RV-041)', async () => {
    const usuario = userEvent.setup();
    const { token } = montar();
    dispararPonteiro(token, 'pointerdown', { clientX: 0, clientY: 0 });
    const arquivo = new File(['png'], 'goblin.png', { type: 'image/png' });

    await usuario.upload(screen.getByLabelText('Arte do token'), arquivo);
    await usuario.click(screen.getByRole('button', { name: 'Enviar arte' }));

    await waitFor(() => {
      expect(enviarArquivoFalso).toHaveBeenCalledWith(
        `/tokens/${TOKEN.id}/imagem`,
        'arquivo',
        arquivo,
      );
    });
  });

  it('salvar fica travado enquanto nada mudou e em mesa encerrada', async () => {
    const { token } = montar({ motivoBloqueio: 'Esta mesa foi encerrada.' });
    dispararPonteiro(token, 'pointerdown', { clientX: 0, clientY: 0 });

    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    expect(screen.getByLabelText('Nome')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enviar arte' })).toBeDisabled();
    expect(screen.getAllByText('Esta mesa foi encerrada.').length).toBeGreaterThan(0);
  });
});

describe('Tabletop — isolamento de re-render', () => {
  let renderizacoesVizinho = 0;
  let renderizacoesOuvinteDeEscala = 0;

  /** Faz o papel do chat: outra feature, montada ao lado, que não assina a câmera. */
  function Vizinho() {
    renderizacoesVizinho += 1;
    return <p>painel vizinho</p>;
  }

  /** Assina só `escala` com seletor fino — pan não pode acordá-lo. */
  function OuvinteDeEscala() {
    const escala = useTabletop((s) => s.escala);
    renderizacoesOuvinteDeEscala += 1;
    return <p>escala {escala}</p>;
  }

  beforeEach(() => {
    renderizacoesVizinho = 0;
    renderizacoesOuvinteDeEscala = 0;
  });

  it('zoom e pan não re-renderizam o painel vizinho', () => {
    renderizarComProvedores(
      <>
        <Tabletop
          mesaId={MESA_ID}
          cena={CENA}
          tokens={[TOKEN]}
          souMestre
          meusPersonagens={[]}
          motivoBloqueio={null}
        />
        <Vizinho />
      </>,
    );
    redefinirCamera();
    const renderizacoesIniciais = renderizacoesVizinho;

    act(() => {
      useTabletop.getState().aplicarZoom(1.25, { x: 10, y: 10 });
      useTabletop.getState().arrastarCamera(20, 20);
    });

    expect(renderizacoesVizinho).toBe(renderizacoesIniciais);
    expect(screen.getByText('painel vizinho')).toBeInTheDocument();
  });

  it('quem assina só a escala não re-renderiza quando a câmera só é arrastada', () => {
    renderizarComProvedores(<OuvinteDeEscala />);
    const renderizacoesIniciais = renderizacoesOuvinteDeEscala;

    act(() => {
      useTabletop.getState().arrastarCamera(50, 50);
    });

    expect(renderizacoesOuvinteDeEscala).toBe(renderizacoesIniciais);

    act(() => {
      useTabletop.getState().aplicarZoom(1.25, { x: 0, y: 0 });
    });

    expect(renderizacoesOuvinteDeEscala).toBeGreaterThan(renderizacoesIniciais);
  });
});
