/**
 * Matemática da rolagem do chat (RV-073), em funções puras.
 *
 * A regra que estas funções protegem: **o chat só se move sozinho quando o
 * usuário já está no fim**. Uma sessão de três horas tem gente relendo o que o
 * mestre descreveu dez minutos atrás; puxar a tela para baixo a cada mensagem
 * nova torna o histórico ilegível justamente quando ele importa. Quem está lendo
 * para trás recebe um aviso de "novas mensagens" e decide quando descer.
 *
 * Puras porque a alternativa é provar rolagem em jsdom, que não implementa
 * layout: `scrollHeight`, `clientHeight` e `scrollTop` são sempre 0 lá. Aqui os
 * três entram como números e o resultado é verificável sem navegador.
 */

export interface MetricasRolagem {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/**
 * Folga em pixels para considerar que o usuário está "no fim".
 *
 * Não é zero porque rolagem suave, arredondamento de zoom do navegador e a
 * altura fracionária de uma linha de texto param a lista um ou dois pixels
 * antes do fim — e um limite exato faria o chat parar de acompanhar sozinho sem
 * que ninguém tivesse rolado para lugar nenhum.
 */
export const FOLGA_FIM_PX = 48;

export function distanciaAteOFim(metricas: MetricasRolagem): number {
  return metricas.scrollHeight - metricas.scrollTop - metricas.clientHeight;
}

export function estaNoFim(metricas: MetricasRolagem, folga = FOLGA_FIM_PX): boolean {
  return distanciaAteOFim(metricas) <= folga;
}

/**
 * Rótulo em PT-BR do aviso de mensagens não lidas, com plural correto.
 *
 * Nota sobre o que **não** está aqui: a compensação de `scrollTop` ao prepender
 * uma página antiga (`scrollTopAntes + (alturaDepois - alturaAntes)`) é a outra
 * metade do RV-073 e continua por escrever. O motivo mudou: a rota já aceita
 * cursor (`?antesDe=<iso>&antesDeId=<uuid>&limite=<n>`), o que falta é o
 * `useInfiniteQuery` em `api.ts` chamá-la. Uma função pronta e nunca chamada só
 * faria parecer que a paginação já chegou à tela.
 */
export function rotuloNaoLidas(quantidade: number): string {
  return quantidade === 1 ? '1 nova mensagem' : `${quantidade} novas mensagens`;
}
