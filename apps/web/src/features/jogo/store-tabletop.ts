import { create } from 'zustand';

/**
 * Câmera do tabletop — zoom e pan (RV-034).
 *
 * A câmera é **estado de UI efêmero** (guardrail 06-frontend.md): vive no
 * Zustand, nunca no servidor e nunca no cache do TanStack Query. Nenhuma ação
 * deste módulo dispara requisição.
 *
 * Toda a matemática está em funções puras exportadas, e não escondida dentro
 * dos handlers do componente: é o único jeito de provar que o arrasto de token
 * acerta a célula com escala aplicada sem depender de navegador.
 *
 * ## Modelo de coordenadas
 *
 * Dois espaços, nesta ordem:
 *
 * - **mundo**: pixels do mapa, sem escala. É onde o token vive
 *   (`x * tamanhoCelula`) e onde o grid é desenhado.
 * - **tela**: pixels do visor, relativos ao canto superior esquerdo dele
 *   (`clientX - rect.left`).
 *
 * O wrapper do mapa recebe `translate(desloc) scale(escala)` com
 * `transform-origin: 0 0`, então a conversão é direta:
 *
 * ```
 * tela  = mundo * escala + desloc
 * mundo = (tela - desloc) / escala
 * ```
 *
 * Ignorar o `desloc` ou a `escala` é exatamente o defeito que este card
 * conserta: `getBoundingClientRect` devolve pixels de tela, e dividir por
 * `tamanhoCelula` sem desfazer a transformação joga o token na célula errada.
 */

/** Extremos de escala suportados pelo tabletop. */
export const ESCALA_MINIMA = 0.25;
export const ESCALA_MAXIMA = 3;

/** Passo multiplicativo de um clique nos botões e de um entalhe da roda. */
export const PASSO_ZOOM = 1.25;

export interface Ponto {
  x: number;
  y: number;
}

/** Célula do grid, na mesma linguagem do `TokenDTO` (`x` = coluna, `y` = linha). */
export interface CelulaGrid {
  x: number;
  y: number;
}

export interface Camera {
  escala: number;
  deslocX: number;
  deslocY: number;
}

export interface Dimensoes {
  largura: number;
  altura: number;
}

export const CAMERA_INICIAL: Camera = { escala: 1, deslocX: 0, deslocY: 0 };

/** Limita a escala aos extremos suportados (0,25 a 3). */
export function limitarEscala(escala: number): number {
  return Math.min(Math.max(escala, ESCALA_MINIMA), ESCALA_MAXIMA);
}

/** Ponto do visor → coordenadas de mundo (px do mapa, sem escala). */
export function telaParaMundo(ponto: Ponto, camera: Camera): Ponto {
  return {
    x: (ponto.x - camera.deslocX) / camera.escala,
    y: (ponto.y - camera.deslocY) / camera.escala,
  };
}

/** Coordenadas de mundo → ponto do visor. */
export function mundoParaTela(ponto: Ponto, camera: Camera): Ponto {
  return {
    x: ponto.x * camera.escala + camera.deslocX,
    y: ponto.y * camera.escala + camera.deslocY,
  };
}

/** Célula que está sob um ponto do visor. */
export function telaParaGrid(ponto: Ponto, camera: Camera, tamanhoCelula: number): CelulaGrid {
  const mundo = telaParaMundo(ponto, camera);
  return {
    x: Math.floor(mundo.x / tamanhoCelula),
    y: Math.floor(mundo.y / tamanhoCelula),
  };
}

/** Canto superior esquerdo de uma célula, em pixels do visor. */
export function gridParaTela(celula: CelulaGrid, camera: Camera, tamanhoCelula: number): Ponto {
  return mundoParaTela({ x: celula.x * tamanhoCelula, y: celula.y * tamanhoCelula }, camera);
}

/**
 * Posição de mundo (canto superior esquerdo) de um token centralizado no
 * ponteiro, já limitada às bordas do grid.
 */
export function posicionarTokenNoPonteiro(
  ponto: Ponto,
  camera: Camera,
  tamanhoCelula: number,
  grid: { colunas: number; linhas: number },
): Ponto {
  const mundo = telaParaMundo(ponto, camera);
  const metade = tamanhoCelula / 2;
  return {
    x: Math.min(Math.max(mundo.x - metade, 0), (grid.colunas - 1) * tamanhoCelula),
    y: Math.min(Math.max(mundo.y - metade, 0), (grid.linhas - 1) * tamanhoCelula),
  };
}

/** Célula em que um token solto naquele canto de mundo se encaixa. */
export function celulaDoCanto(canto: Ponto, tamanhoCelula: number): CelulaGrid {
  return {
    x: Math.round(canto.x / tamanhoCelula),
    y: Math.round(canto.y / tamanhoCelula),
  };
}

/**
 * Zoom ancorado: o ponto do visor informado continua mostrando exatamente a
 * mesma coordenada de mundo depois da mudança de escala. Ampliar em direção ao
 * canto da tela é desorientador — a célula sob o cursor tem de ficar sob o
 * cursor.
 *
 * A âncora é honrada mesmo quando a escala bate no limite, porque o
 * deslocamento é recalculado a partir da escala **já limitada**.
 */
export function aplicarZoomAncorado(camera: Camera, fator: number, ancora: Ponto): Camera {
  const escala = limitarEscala(camera.escala * fator);
  const mundo = telaParaMundo(ancora, camera);
  return {
    escala,
    deslocX: ancora.x - mundo.x * escala,
    deslocY: ancora.y - mundo.y * escala,
  };
}

/**
 * Câmera que põe o mapa no centro do visor, em escala 1. Quando o mapa é maior
 * que o visor o deslocamento fica negativo — o que é justamente "centralizar":
 * o meio do mapa aparece no meio da tela.
 */
export function centralizarMapa(visor: Dimensoes, mapa: Dimensoes): Camera {
  return {
    escala: 1,
    deslocX: (visor.largura - mapa.largura) / 2,
    deslocY: (visor.altura - mapa.altura) / 2,
  };
}

interface EstadoTabletop extends Camera {
  /** Multiplica a escala pelo fator, mantendo a âncora sob o mesmo ponto. */
  aplicarZoom(fator: number, ancora: Ponto): void;
  /** Move a câmera por um delta em pixels de tela. */
  arrastarCamera(dx: number, dy: number): void;
  /** Volta para escala 1 com o mapa centralizado no visor. */
  centralizar(visor: Dimensoes, mapa: Dimensoes): void;
}

export const useTabletop = create<EstadoTabletop>()((set) => ({
  ...CAMERA_INICIAL,
  aplicarZoom: (fator, ancora) => set((atual) => aplicarZoomAncorado(atual, fator, ancora)),
  arrastarCamera: (dx, dy) =>
    set((atual) => ({ deslocX: atual.deslocX + dx, deslocY: atual.deslocY + dy })),
  centralizar: (visor, mapa) => set(centralizarMapa(visor, mapa)),
}));
