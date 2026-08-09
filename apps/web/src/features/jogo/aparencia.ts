import { COR_GRID_PADRAO } from '@rolavinte/shared';

/**
 * Aparência do tabletop: cor do grid (RV-033) e faixas da barra de vida
 * (RV-042).
 *
 * São funções puras de propósito. As decisões que dependem só de números — que
 * cor de linha desenhar, em que faixa um personagem está — não podem ficar
 * escondidas dentro do JSX, onde só um teste de DOM as alcançaria.
 */

const COR_HEXADECIMAL = /^#[0-9a-fA-F]{6}$/;

/**
 * Converte `#rrggbb` em `rgba(r, g, b, alfa)`. A cor do grid é escolhida pelo
 * mestre e desenhada como linha fina sobre o mapa: sem transparência ela
 * esconde o desenho por baixo, e a cor "certa" para o mapa seria sempre a mais
 * apagada possível.
 *
 * Cor fora do formato cai no padrão do contrato — dado antigo em cache não
 * pode apagar o grid.
 */
export function corComAlfa(cor: string, alfa: number): string {
  const hex = COR_HEXADECIMAL.test(cor) ? cor : COR_GRID_PADRAO;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alfa})`;
}

/** Opacidade das linhas do grid sobre o mapa. */
export const ALFA_LINHA_GRID = 0.45;

export type FaixaDeVida = 'saudavel' | 'ferido' | 'critico';

/**
 * Faixa de vida do personagem (RV-042): verde acima de 50%, âmbar entre 25% e
 * 50%, vermelha abaixo de 25%. `pvMax` zerado ou negativo conta como crítico —
 * é ficha malformada, e mostrar "saudável" seria mentir.
 */
export function faixaDeVida(pvAtual: number, pvMax: number): FaixaDeVida {
  const fracao = fracaoDeVida(pvAtual, pvMax);
  if (fracao > 0.5) return 'saudavel';
  if (fracao >= 0.25) return 'ferido';
  return 'critico';
}

/** Fração de vida entre 0 e 1, já protegida contra ficha malformada. */
export function fracaoDeVida(pvAtual: number, pvMax: number): number {
  if (pvMax <= 0) return 0;
  return Math.min(Math.max(pvAtual / pvMax, 0), 1);
}

/** Classe Tailwind de cada faixa — as mesmas do painel de personagens. */
export const CLASSE_DA_FAIXA: Record<FaixaDeVida, string> = {
  saudavel: 'bg-sucesso',
  ferido: 'bg-ouro',
  critico: 'bg-perigo',
};

/** Texto que acompanha a barra: cor nunca é o único canal de informação. */
export function rotuloDeVida(pvAtual: number, pvMax: number): string {
  return `${pvAtual}/${pvMax} PV`;
}
