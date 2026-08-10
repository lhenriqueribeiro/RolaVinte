import type { GrauSucesso } from '../sistemas/pathfinder2e/regras';

/**
 * Avaliação de uma rolagem contra uma CD, e como o chat a diz em PT-BR (RV-154).
 *
 * ## Por que este arquivo existe, e por que ele mora em `chat/`
 *
 * O grau de sucesso é uma regra de Pathfinder 2e (`sistemas/pathfinder2e/regras.ts`,
 * RV-151) e a **única** superfície que o exibe é o chat da mesa. Este arquivo é a
 * ponte: guarda o formato do que é gravado junto da mensagem e o vocabulário com
 * que a tela o lê. Não há aritmética aqui — quem compara total com CD é
 * `grauSucesso`, e quem descobre o d20 natural é `d20NaturalDe`, os dois em
 * `regras.ts`. Uma segunda comparação viveria três dias antes de discordar da
 * primeira.
 *
 * ## Sem CD não há grau
 *
 * `MensagemDTO.avaliacao` é `null` na esmagadora maioria das mensagens: rolagem
 * livre (`/r 1d20`) **não** tem CD e portanto não tem grau. Não existe CD padrão,
 * e inventar uma seria pior que não avaliar — o jogador leria "Falha" numa
 * rolagem de dano. Mensagem gravada antes deste card também volta com `null`, e o
 * chat trata os dois casos do mesmo jeito: exibe a rolagem como sempre exibiu.
 */

// ─────────────────────────────────────────────────────────────────────
// A CD: faixa aceita e mensagens
// ─────────────────────────────────────────────────────────────────────

/**
 * Faixa aceita para uma CD informada à mão.
 *
 * Não é uma regra de PF2e — as regras vivem em `regras.ts` — e sim o limite de
 * entrada do chat: existe para que `cd 200` e `cd 0` sejam recusados com uma
 * frase em PT-BR em vez de virarem uma avaliação sem sentido. O teto é generoso
 * de propósito (a CD tabelada mais alta do PF2e é a do nível 25, e ainda cabem os
 * ajustes de dificuldade acima dela): quem erra a digitação é barrado, quem tem
 * uma CD legítima alta não é.
 */
export const CD_MINIMA = 1;
export const CD_MAXIMA = 60;

export const MENSAGEM_CD_INVALIDA = `A CD precisa ser um número inteiro entre ${CD_MINIMA} e ${CD_MAXIMA}.`;

/** `true` quando o número serve como CD. Um só lugar decide, três o consultam. */
export function cdValida(cd: number): boolean {
  return Number.isInteger(cd) && cd >= CD_MINIMA && cd <= CD_MAXIMA;
}

/**
 * Recusa de CD num sistema que não avalia grau de sucesso.
 *
 * Nomeia o sistema porque a mesma mesa pode ser de qualquer um deles e "este
 * sistema" não diz qual é. Descartar a CD em silêncio seria pior: o jogador
 * digitaria a CD toda vez e nunca entenderia por que o grau não aparece (F6 da
 * taxonomia — a interface prometendo o que o backend não cumpre).
 */
export function mensagemSistemaSemAvaliacao(nomeDoSistema: string): string {
  return `Mesas de ${nomeDoSistema} não avaliam grau de sucesso: remova a CD da rolagem.`;
}

// ─────────────────────────────────────────────────────────────────────
// O que é gravado junto da mensagem
// ─────────────────────────────────────────────────────────────────────

/**
 * O que o 20/1 natural fez com o grau **naquela** rolagem.
 *
 * `'sem-efeito'` não é firula: um 20 natural contra uma CD baixa já entra como
 * sucesso crítico, e o ajuste não tem para onde subir. Sem este valor, a tela
 * teria de escolher entre calar (perdendo o cenário de aceite "indica em texto
 * que o 20 natural melhorou um grau") ou afirmar que melhorou algo que não
 * melhorou — mentira pequena, e ainda assim mentira.
 */
export const EFEITOS_DADO_NATURAL = ['melhorou', 'piorou', 'sem-efeito'] as const;

export type EfeitoDadoNatural = (typeof EFEITOS_DADO_NATURAL)[number];

/**
 * A avaliação, como fica gravada na mensagem e como sai no `MensagemDTO`.
 *
 * É um **registro do que foi anunciado**, e não uma receita para recalcular
 * depois: os quatro campos são o que a mesa viu no momento da rolagem. Por isso
 * `efeitoNatural` é gravado em vez de deduzido na renderização — uma errata de
 * regra amanhã não pode reescrever o que o chat disse ontem.
 */
export interface AvaliacaoRolagem {
  /** A CD contra a qual o total foi comparado. */
  readonly cd: number;
  readonly grau: GrauSucesso;
  /**
   * O d20 natural, quando identificável (`d20NaturalDe`). `null` significa
   * "não deu para saber qual era o d20", nunca "não deu 20".
   */
  readonly d20Natural: number | null;
  /** `null` quando o dado natural não acionou a regra do ajuste. */
  readonly efeitoNatural: EfeitoDadoNatural | null;
}

// ─────────────────────────────────────────────────────────────────────
// Como o chat diz isso em PT-BR
// ─────────────────────────────────────────────────────────────────────

/**
 * Intensidade do resultado, para a moldura do selo.
 *
 * A cor **acompanha** o rótulo e nunca o substitui: sucesso crítico e falha
 * crítica precisam ser legíveis por quem não distingue as cores e por quem ouve
 * a tela (regra do RV-084, e o DoD deste card a repete). Quem renderiza escolhe
 * as classes; o texto vem daqui pronto.
 */
export type TomDoGrau = 'otimo' | 'bom' | 'ruim' | 'pessimo';

interface ApresentacaoDoGrau {
  readonly rotulo: string;
  readonly tom: TomDoGrau;
  /** Decoração, sempre `aria-hidden` — nunca a única pista do resultado. */
  readonly icone: string;
}

/**
 * Rótulo, tom e ícone dos quatro graus.
 *
 * `Record<GrauSucesso, …>` total de propósito: um grau novo em `regras.ts` para
 * de compilar aqui até alguém decidir como o chat o anuncia — em vez de aparecer
 * na tela como a chave crua `sucesso-critico`.
 */
const APRESENTACAO_POR_GRAU: Record<GrauSucesso, ApresentacaoDoGrau> = {
  'sucesso-critico': { rotulo: 'Sucesso crítico', tom: 'otimo', icone: '★' },
  sucesso: { rotulo: 'Sucesso', tom: 'bom', icone: '✔' },
  falha: { rotulo: 'Falha', tom: 'ruim', icone: '✖' },
  'falha-critica': { rotulo: 'Falha crítica', tom: 'pessimo', icone: '☠' },
};

/** Frase do ajuste, por efeito. Total, pelo mesmo motivo do mapa acima. */
const FRASE_POR_EFEITO: Record<EfeitoDadoNatural, (natural: number) => string> = {
  melhorou: (natural) => `${natural} natural: um grau acima.`,
  piorou: (natural) => `${natural} natural: um grau abaixo.`,
  'sem-efeito': (natural) => `${natural} natural: o grau já estava no limite da escala.`,
};

export interface DescricaoAvaliacao {
  /** "Sucesso crítico" — o texto que carrega o resultado. */
  readonly rotulo: string;
  /** "contra CD 18". */
  readonly contraCd: string;
  readonly tom: TomDoGrau;
  readonly icone: string;
  /** Frase do 20/1 natural, ou `null` quando não houve dado natural em jogo. */
  readonly detalheNatural: string | null;
}

/**
 * A avaliação em texto, pronta para a tela — função pura, testável sem navegador.
 *
 * Existe para que o componente de mensagem não monte frase nenhuma: ele recebe
 * `rotulo`, `contraCd` e `detalheNatural` e só decide classes de CSS. É a mesma
 * divisão que `avisoPrivacidade` já usa no chat.
 */
export function descreverAvaliacao(avaliacao: AvaliacaoRolagem): DescricaoAvaliacao {
  const apresentacao = APRESENTACAO_POR_GRAU[avaliacao.grau];
  const natural = avaliacao.d20Natural;
  const efeito = avaliacao.efeitoNatural;
  return {
    rotulo: apresentacao.rotulo,
    contraCd: `contra CD ${avaliacao.cd}`,
    tom: apresentacao.tom,
    icone: apresentacao.icone,
    detalheNatural: efeito !== null && natural !== null ? FRASE_POR_EFEITO[efeito](natural) : null,
  };
}
