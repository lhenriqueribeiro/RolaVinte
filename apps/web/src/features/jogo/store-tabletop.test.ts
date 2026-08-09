import { beforeEach, describe, expect, it } from 'vitest';
import {
  CAMERA_INICIAL,
  ESCALA_MAXIMA,
  ESCALA_MINIMA,
  aplicarZoomAncorado,
  celulaDoCanto,
  centralizarMapa,
  gridParaTela,
  limitarEscala,
  mundoParaTela,
  posicionarTokenNoPonteiro,
  telaParaGrid,
  telaParaMundo,
  useTabletop,
  type Camera,
} from './store-tabletop';

const CELULA = 44;

/**
 * Três câmeras com escala diferente e **deslocamento diferente de zero** — o
 * caso em que a conta antiga (`clientX - rect.left` dividido pela célula)
 * errava a célula.
 */
const CAMERAS: { rotulo: string; camera: Camera }[] = [
  { rotulo: 'escala 1', camera: { escala: 1, deslocX: 120, deslocY: 80 } },
  { rotulo: 'escala 0,5', camera: { escala: 0.5, deslocX: -30, deslocY: 20 } },
  { rotulo: 'escala 2', camera: { escala: 2, deslocX: -500, deslocY: -300 } },
];

/** Ponto de tela sobre o centro de uma célula, calculado sem usar a conversão. */
function centroDaCelulaNaTela(coluna: number, linha: number, camera: Camera) {
  return {
    x: (coluna + 0.5) * CELULA * camera.escala + camera.deslocX,
    y: (linha + 0.5) * CELULA * camera.escala + camera.deslocY,
  };
}

describe('conversão tela ↔ grid', () => {
  it.each(CAMERAS)('encontra a célula sob o cursor com $rotulo', ({ camera }) => {
    expect(telaParaGrid(centroDaCelulaNaTela(12, 7, camera), camera, CELULA)).toEqual({
      x: 12,
      y: 7,
    });
    expect(telaParaGrid(centroDaCelulaNaTela(0, 0, camera), camera, CELULA)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it.each(CAMERAS)('gridParaTela é o inverso de telaParaGrid com $rotulo', ({ camera }) => {
    const canto = gridParaTela({ x: 9, y: 4 }, camera, CELULA);

    // O canto exato pertence à própria célula, e um passo de meia célula
    // adiante continua dentro dela.
    expect(telaParaGrid(canto, camera, CELULA)).toEqual({ x: 9, y: 4 });
    expect(
      telaParaGrid(
        { x: canto.x + (CELULA / 2) * camera.escala, y: canto.y + (CELULA / 2) * camera.escala },
        camera,
        CELULA,
      ),
    ).toEqual({ x: 9, y: 4 });
  });

  it.each(CAMERAS)('telaParaMundo desfaz mundoParaTela com $rotulo', ({ camera }) => {
    const mundo = { x: 317.5, y: 208.25 };

    const voltou = telaParaMundo(mundoParaTela(mundo, camera), camera);

    expect(voltou.x).toBeCloseTo(mundo.x, 10);
    expect(voltou.y).toBeCloseTo(mundo.y, 10);
  });

  it('ignorar o deslocamento levaria à célula errada (é o defeito que o card conserta)', () => {
    const camera: Camera = { escala: 0.5, deslocX: -30, deslocY: 20 };
    const ponto = centroDaCelulaNaTela(12, 7, camera);

    const ingenuo = { x: Math.floor(ponto.x / CELULA), y: Math.floor(ponto.y / CELULA) };

    expect(ingenuo).not.toEqual({ x: 12, y: 7 });
    expect(telaParaGrid(ponto, camera, CELULA)).toEqual({ x: 12, y: 7 });
  });
});

describe('arrasto de token com a câmera aplicada', () => {
  it('solta na célula (12,7) mesmo com escala 0,5', () => {
    const camera: Camera = { escala: 0.5, deslocX: 0, deslocY: 0 };
    const ponteiro = centroDaCelulaNaTela(12, 7, camera);

    const canto = posicionarTokenNoPonteiro(ponteiro, camera, CELULA, {
      colunas: 40,
      linhas: 30,
    });

    expect(celulaDoCanto(canto, CELULA)).toEqual({ x: 12, y: 7 });
  });

  it.each(CAMERAS)('solta na célula (12,7) com $rotulo', ({ camera }) => {
    const canto = posicionarTokenNoPonteiro(centroDaCelulaNaTela(12, 7, camera), camera, CELULA, {
      colunas: 40,
      linhas: 30,
    });

    expect(celulaDoCanto(canto, CELULA)).toEqual({ x: 12, y: 7 });
  });

  it('limita o token às bordas do grid', () => {
    const camera: Camera = { escala: 2, deslocX: 40, deslocY: -10 };
    const grid = { colunas: 40, linhas: 30 };

    const foraAcima = posicionarTokenNoPonteiro({ x: -9000, y: -9000 }, camera, CELULA, grid);
    const foraAbaixo = posicionarTokenNoPonteiro({ x: 9000, y: 9000 }, camera, CELULA, grid);

    expect(celulaDoCanto(foraAcima, CELULA)).toEqual({ x: 0, y: 0 });
    expect(celulaDoCanto(foraAbaixo, CELULA)).toEqual({ x: 39, y: 29 });
  });
});

describe('zoom ancorado no cursor', () => {
  it('mantém a célula (10,10) sob o cursor ao ampliar', () => {
    const camera: Camera = { escala: 1, deslocX: 0, deslocY: 0 };
    const cursor = centroDaCelulaNaTela(10, 10, camera);

    const ampliada = aplicarZoomAncorado(camera, 1.25, cursor);

    expect(ampliada.escala).toBe(1.25);
    expect(telaParaGrid(cursor, ampliada, CELULA)).toEqual({ x: 10, y: 10 });
    const centroDepois = centroDaCelulaNaTela(10, 10, ampliada);
    expect(centroDepois.x).toBeCloseTo(cursor.x, 10);
    expect(centroDepois.y).toBeCloseTo(cursor.y, 10);
  });

  it('mantém o ponto sob o cursor ao reduzir, partindo de câmera deslocada', () => {
    const camera: Camera = { escala: 2, deslocX: -500, deslocY: -300 };
    const cursor = centroDaCelulaNaTela(3, 21, camera);

    const reduzida = aplicarZoomAncorado(camera, 1 / 1.25, cursor);

    expect(reduzida.escala).toBeCloseTo(1.6, 10);
    expect(telaParaGrid(cursor, reduzida, CELULA)).toEqual({ x: 3, y: 21 });
  });

  it('não desloca o mapa quando a escala já está no limite', () => {
    const camera: Camera = { escala: ESCALA_MAXIMA, deslocX: -120, deslocY: 44 };

    const travada = aplicarZoomAncorado(camera, 2, { x: 300, y: 200 });

    expect(travada).toEqual(camera);
  });
});

describe('limites de escala', () => {
  it('não reduz abaixo de 0,25 nem amplia acima de 3', () => {
    expect(limitarEscala(0.1)).toBe(ESCALA_MINIMA);
    expect(limitarEscala(ESCALA_MINIMA * 0.5)).toBe(ESCALA_MINIMA);
    expect(limitarEscala(7)).toBe(ESCALA_MAXIMA);
    expect(limitarEscala(ESCALA_MAXIMA * 2)).toBe(ESCALA_MAXIMA);
    expect(limitarEscala(1.75)).toBe(1.75);
  });

  it('o zoom ancorado respeita os extremos', () => {
    const camera: Camera = { escala: 0.3, deslocX: 10, deslocY: 10 };

    expect(aplicarZoomAncorado(camera, 0.1, { x: 0, y: 0 }).escala).toBe(ESCALA_MINIMA);
    expect(aplicarZoomAncorado(camera, 100, { x: 0, y: 0 }).escala).toBe(ESCALA_MAXIMA);
  });
});

describe('store da câmera', () => {
  beforeEach(() => {
    useTabletop.setState(CAMERA_INICIAL);
  });

  it('começa em escala 1 sem deslocamento', () => {
    const { escala, deslocX, deslocY } = useTabletop.getState();

    expect({ escala, deslocX, deslocY }).toEqual(CAMERA_INICIAL);
  });

  it('aplicarZoom acumula e para nos extremos', () => {
    for (let i = 0; i < 20; i += 1) useTabletop.getState().aplicarZoom(1.25, { x: 100, y: 100 });
    expect(useTabletop.getState().escala).toBe(ESCALA_MAXIMA);

    for (let i = 0; i < 40; i += 1)
      useTabletop.getState().aplicarZoom(1 / 1.25, { x: 100, y: 100 });
    expect(useTabletop.getState().escala).toBe(ESCALA_MINIMA);
  });

  it('arrastarCamera soma o delta de tela ao deslocamento', () => {
    useTabletop.getState().arrastarCamera(30, -12);
    useTabletop.getState().arrastarCamera(5, 2);

    const { deslocX, deslocY, escala } = useTabletop.getState();
    expect({ deslocX, deslocY, escala }).toEqual({ deslocX: 35, deslocY: -10, escala: 1 });
  });

  it('centralizar volta à escala 1 e põe o meio do mapa no meio do visor', () => {
    useTabletop.getState().aplicarZoom(1.25, { x: 0, y: 0 });
    useTabletop.getState().arrastarCamera(400, 400);

    useTabletop
      .getState()
      .centralizar({ largura: 800, altura: 600 }, { largura: 1760, altura: 1320 });

    const { escala, deslocX, deslocY } = useTabletop.getState();
    expect({ escala, deslocX, deslocY }).toEqual({ escala: 1, deslocX: -480, deslocY: -360 });
    // O centro do mapa cai exatamente no centro do visor.
    expect(mundoParaTela({ x: 880, y: 660 }, { escala, deslocX, deslocY })).toEqual({
      x: 400,
      y: 300,
    });
  });

  it('centralizarMapa é puro e não depende da store', () => {
    expect(centralizarMapa({ largura: 500, altura: 500 }, { largura: 300, altura: 100 })).toEqual({
      escala: 1,
      deslocX: 100,
      deslocY: 200,
    });
  });
});
