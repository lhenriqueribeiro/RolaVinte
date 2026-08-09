import { describe, expect, it } from 'vitest';
import { distanciaAteOFim, estaNoFim, FOLGA_FIM_PX, rotuloNaoLidas } from './rolagem-chat';

/**
 * A conta que decide se o chat pode se mover sozinho (RV-073).
 *
 * Vale testar aqui, e não pelo componente, porque o jsdom não faz layout: lá
 * `scrollHeight`, `clientHeight` e `scrollTop` são sempre 0, e todo caso cairia
 * no mesmo resultado.
 */

function metricas(scrollTop: number, scrollHeight: number, clientHeight: number) {
  return { scrollTop, scrollHeight, clientHeight };
}

describe('estaNoFim', () => {
  it('lista curta demais para rolar está sempre no fim', () => {
    expect(estaNoFim(metricas(0, 200, 400))).toBe(true);
  });

  it('rolagem no fim exato', () => {
    expect(estaNoFim(metricas(600, 1000, 400))).toBe(true);
  });

  it('lida no topo de um histórico longo não está no fim', () => {
    expect(estaNoFim(metricas(0, 5000, 400))).toBe(false);
  });

  it('a folga cobre o pixel que sobra da rolagem suave', () => {
    // Faltam 3px para o fim: seria "não está no fim" num limite exato, e o chat
    // pararia de acompanhar sozinho sem ninguém ter rolado nada.
    expect(distanciaAteOFim(metricas(597, 1000, 400))).toBe(3);
    expect(estaNoFim(metricas(597, 1000, 400))).toBe(true);
  });

  it('os dois lados exatos da folga', () => {
    const naFolga = metricas(600 - FOLGA_FIM_PX, 1000, 400);
    const umPixelAlem = metricas(600 - FOLGA_FIM_PX - 1, 1000, 400);
    expect(estaNoFim(naFolga)).toBe(true);
    expect(estaNoFim(umPixelAlem)).toBe(false);
  });

  it('folga customizada é respeitada', () => {
    expect(estaNoFim(metricas(500, 1000, 400), 100)).toBe(true);
    expect(estaNoFim(metricas(500, 1000, 400), 50)).toBe(false);
  });
});

describe('rotuloNaoLidas', () => {
  it('singular e plural em PT-BR', () => {
    expect(rotuloNaoLidas(1)).toBe('1 nova mensagem');
    expect(rotuloNaoLidas(2)).toBe('2 novas mensagens');
    expect(rotuloNaoLidas(37)).toBe('37 novas mensagens');
  });
});
