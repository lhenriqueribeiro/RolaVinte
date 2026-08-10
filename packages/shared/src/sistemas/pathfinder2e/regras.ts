import type { ResultadoRolagem, TermoAvaliado } from '../../dados/motor-dados';

/**
 * Motor de regras de Pathfinder Segunda Edição (RV-151).
 *
 * **Atribuição.** O que está aqui é *mecânica* — proficiência, graus de sucesso,
 * CDs, tipos de modificador —, que é Open Game Content sob a OGL 1.0a e pode ser
 * implementado com atribuição. O texto que precisa acompanhar qualquer exibição
 * disto vive em `ATRIBUICAO_PF2E` (`atribuicao.ts`, RV-150), e a fronteira do que
 * pode entrar no repositório está em `docs/licencas/pathfinder2e.md`. **Nenhum
 * conteúdo** (talento, magia, item, monstro) entra neste arquivo: aqui há
 * aritmética e tabelas de regra, nada de texto descritivo.
 *
 * **Por que um arquivo só.** Ficha, chat e combate precisam chegar ao mesmo
 * número. Se cada um somasse o seu, uma errata viraria três correções e duas
 * divergências. Toda a aritmética do sistema sai daqui, e o resto do repositório
 * — inclusive a definição de ficha do RV-152 — apenas chama estas funções.
 *
 * **Pureza (DoD do card).** Sem I/O, sem `Date`, sem `Math.random`, sem import de
 * `apps/`. A única dependência é o *tipo* `ResultadoRolagem` do motor de dados:
 * este módulo **consome** rolagens e nunca as produz. O caminho inverso está
 * proibido — `motor-dados.ts` é agnóstico de sistema e não sabe o que é uma CD.
 *
 * **Falha esperada volta como valor.** `packages/shared` não tem `Result` (esse é
 * o padrão do domínio da api). Seguindo o que `validarExpressao` já faz aqui,
 * entrada fora da faixa devolve `null` em vez de lançar.
 */

// ─────────────────────────────────────────────────────────────────────
// Proficiência
// ─────────────────────────────────────────────────────────────────────

/**
 * Os cinco graus de treinamento, do menor para o maior.
 *
 * Sobre `'mestre'`: no PF2e "master" traduz para mestre, e `Mestre` já significa
 * o dono da mesa neste domínio. A convenção do épico (E15) é que `'mestre'`
 * exista **apenas como valor literal** desta união — nunca como nome de tipo,
 * classe ou variável.
 */
export const GRAUS_TREINAMENTO = [
  'destreinado',
  'treinado',
  'perito',
  'mestre',
  'lendario',
] as const;

export type GrauTreinamento = (typeof GRAUS_TREINAMENTO)[number];

/**
 * A regra de proficiência como **dado**, não como `if`.
 *
 * O bônus é `nível + acréscimo`, com uma exceção que é a armadilha nº 1 do card:
 * **destreinado não soma o nível**. `bonusProficiencia(12, 'destreinado')` é `0`,
 * e não `12` — errar isto infla em silêncio toda perícia não treinada de todo
 * personagem, e o número errado continua parecendo um número.
 *
 * A exceção mora em `somaNivel` de propósito. Escrita como `if (grau ===
 * 'destreinado')` ela seria uma regra escondida no meio de uma conta; escrita
 * como coluna da tabela, ela é visível para quem lê a tabela.
 */
const PROFICIENCIA_POR_GRAU: Record<
  GrauTreinamento,
  { readonly somaNivel: boolean; readonly acrescimo: number }
> = {
  destreinado: { somaNivel: false, acrescimo: 0 },
  treinado: { somaNivel: true, acrescimo: 2 },
  perito: { somaNivel: true, acrescimo: 4 },
  mestre: { somaNivel: true, acrescimo: 6 },
  lendario: { somaNivel: true, acrescimo: 8 },
};

/**
 * Bônus de proficiência: nível + 2/4/6/8 conforme o grau, e **+0** quando
 * destreinado.
 *
 * O nível chega como o chamador o tem e **não é limitado a 1..20**: personagem
 * vai até 20, mas criatura e CD de encontro passam disso, e cortar aqui daria um
 * número errado sem avisar. Quem precisa da faixa de personagem valida antes —
 * é o `schemaFicha` do RV-152 que faz isso.
 */
export function bonusProficiencia(nivel: number, grau: GrauTreinamento): number {
  const regra = PROFICIENCIA_POR_GRAU[grau];
  return (regra.somaNivel ? nivel : 0) + regra.acrescimo;
}

// ─────────────────────────────────────────────────────────────────────
// Graus de sucesso
// ─────────────────────────────────────────────────────────────────────

/** Os quatro graus, **do melhor para o pior** — a ordem é o que faz o ajuste do dado natural funcionar. */
export const GRAUS_SUCESSO = ['sucesso-critico', 'sucesso', 'falha', 'falha-critica'] as const;

export type GrauSucesso = (typeof GRAUS_SUCESSO)[number];

/** Distância da CD que separa o resultado comum do crítico, para cima e para baixo. */
export const MARGEM_CRITICA = 10;

const NATURAL_QUE_MELHORA = 20;
const NATURAL_QUE_PIORA = 1;

export interface EntradaGrauSucesso {
  /** Total da rolagem, já com todos os bônus somados. */
  readonly total: number;
  /** Classe de dificuldade contra a qual o total é comparado. */
  readonly cd: number;
  /**
   * Valor do d20 natural, quando ele é identificável — use `d20NaturalDe`.
   * `null` ou ausente significa **sem ajuste**, nunca "não deu 20".
   */
  readonly d20Natural?: number | null;
}

/** Só a comparação com a CD, antes de qualquer ajuste de dado natural. */
function grauPelaComparacao(total: number, cd: number): GrauSucesso {
  if (total >= cd + MARGEM_CRITICA) return 'sucesso-critico';
  if (total >= cd) return 'sucesso';
  if (total <= cd - MARGEM_CRITICA) return 'falha-critica';
  return 'falha';
}

/**
 * Move `passos` degraus na escala (negativo melhora, positivo piora). As pontas
 * não transbordam: melhorar um sucesso crítico continua sucesso crítico.
 */
function deslocarGrau(grau: GrauSucesso, passos: number): GrauSucesso {
  const indice = GRAUS_SUCESSO.indexOf(grau);
  const destino = Math.min(Math.max(indice + passos, 0), GRAUS_SUCESSO.length - 1);
  return GRAUS_SUCESSO[destino] ?? grau;
}

/**
 * Grau de sucesso de uma checagem.
 *
 * **Armadilha nº 2 do card, e a mais cara: a ordem.** Primeiro compara-se o total
 * com a CD; **depois** o 20/1 natural desloca **um** grau. Não são sucesso nem
 * falha automáticos:
 *
 * - CD 40, total 25, 20 natural → falha crítica sobe para **falha**, e para aí.
 * - CD 10, total 31, 1 natural → sucesso crítico desce para **sucesso**.
 *
 * Um teste que só verifica "20 natural ⇒ sucesso" passa contra uma implementação
 * errada, e é por isso que a tabela de testes deste arquivo cruza as quatro
 * faixas com os três casos de dado natural.
 *
 * Qualquer outro valor de `d20Natural` (17, por exemplo) não ajusta nada, e
 * `null` — o que `d20NaturalDe` devolve quando não dá para saber qual é o d20 —
 * também não.
 */
export function grauSucesso({ total, cd, d20Natural = null }: EntradaGrauSucesso): GrauSucesso {
  const base = grauPelaComparacao(total, cd);
  if (d20Natural === NATURAL_QUE_MELHORA) return deslocarGrau(base, -1);
  if (d20Natural === NATURAL_QUE_PIORA) return deslocarGrau(base, +1);
  return base;
}

// ─────────────────────────────────────────────────────────────────────
// Classes de dificuldade
// ─────────────────────────────────────────────────────────────────────

/**
 * CDs simples, para quando o mestre precisa de uma CD na hora e a tarefa não tem
 * nível. Repare no salto de 20 para 30 entre perito e mestre: não é progressão
 * aritmética, é tabela — por isso está escrita, e não calculada.
 */
export const CDS_SIMPLES: Record<GrauTreinamento, number> = {
  destreinado: 10,
  treinado: 15,
  perito: 20,
  mestre: 30,
  lendario: 40,
};

/**
 * CDs por nível, do 0 ao 25. Também é tabela: cresce +1 por nível com um +1
 * extra a cada três níveis até o 20, e +2 por nível do 21 em diante. Transcrever
 * é mais honesto que reproduzir a curva com aritmética que casa por acidente.
 */
const CDS_POR_NIVEL: readonly number[] = Object.freeze([
  14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 34, 35, 36, 38, 39, 40, 42, 44, 46,
  48, 50,
]);

/** Menor nível com CD tabelada. */
export const NIVEL_MINIMO_COM_CD = 0;
/** Maior nível com CD tabelada. */
export const NIVEL_MAXIMO_COM_CD = CDS_POR_NIVEL.length - 1;

/**
 * CD de uma tarefa de nível `nivel`. Fora de 0..25 — e para nível fracionário —
 * devolve `null`, **sem exceção**: extrapolar a tabela seria inventar uma regra,
 * e um número inventado é indistinguível de um número certo na tela.
 */
export function cdPorNivel(nivel: number): number | null {
  if (!Number.isInteger(nivel)) return null;
  return CDS_POR_NIVEL[nivel] ?? null;
}

// ─────────────────────────────────────────────────────────────────────
// Modificadores e empilhamento
// ─────────────────────────────────────────────────────────────────────

export const TIPOS_MODIFICADOR = ['circunstancia', 'item', 'status', 'sem-tipo'] as const;

export type TipoModificador = (typeof TIPOS_MODIFICADOR)[number];

export interface Modificador {
  /** Positivo é bônus, negativo é penalidade. Zero não muda nada. */
  readonly valor: number;
  readonly tipo: TipoModificador;
  /** De onde veio, em PT-BR — é o que a ficha mostra ao explicar o número. */
  readonly origem: string;
}

/** O único tipo que soma com tudo, inclusive consigo mesmo. */
const TIPO_QUE_SEMPRE_SOMA: TipoModificador = 'sem-tipo';

/**
 * Soma modificadores respeitando o empilhamento do PF2e.
 *
 * **Armadilha nº 4 do card.** Do mesmo tipo, vale o **maior bônus** e a **pior
 * penalidade** — os dois entram, porque um bônus de item e uma penalidade de
 * item não se cancelam por serem do mesmo tipo. Tipos diferentes somam entre si.
 * Sem-tipo soma sempre, com todos e com os outros sem-tipo.
 *
 * Um `reduce` ingênuo somando tudo dá o número errado e ninguém percebe até a
 * mesa reclamar: item +1 e item +2 valem **+2**, não +3.
 */
export function somarModificadores(modificadores: readonly Modificador[]): number {
  const melhorBonus = new Map<TipoModificador, number>();
  const piorPenalidade = new Map<TipoModificador, number>();
  let total = 0;

  for (const { valor, tipo } of modificadores) {
    if (tipo === TIPO_QUE_SEMPRE_SOMA) {
      total += valor;
    } else if (valor > 0) {
      melhorBonus.set(tipo, Math.max(melhorBonus.get(tipo) ?? 0, valor));
    } else if (valor < 0) {
      piorPenalidade.set(tipo, Math.min(piorPenalidade.get(tipo) ?? 0, valor));
    }
  }

  for (const valor of melhorBonus.values()) total += valor;
  for (const valor of piorPenalidade.values()) total += valor;
  return total;
}

// ─────────────────────────────────────────────────────────────────────
// Leitura do d20 natural
// ─────────────────────────────────────────────────────────────────────

const FACES_DO_D20 = 20;

type TermoDeDados = Extract<TermoAvaliado, { tipo: 'dados' }>;

/**
 * O valor do d20 natural de uma rolagem, ou `null` quando não dá para saber.
 *
 * **Armadilha nº 3 do card: nunca adivinhe.** Em `1d20+1d6` a pergunta "qual foi
 * o d20 natural?" tem resposta óbvia para um humano e nenhuma garantia para o
 * código — a próxima expressão pode ser `1d20+1d20`. Chutar aqui produz um
 * ajuste de grau fantasma, e o jogador vê "Sucesso crítico" sem saber de onde
 * veio. Então a regra é estreita de propósito; devolve o valor **só** quando:
 *
 * 1. a expressão tem **exatamente um** termo de dados (constantes não contam, e
 *    é por isso que `1d20+11` funciona — que é o caso normal de uma checagem);
 * 2. esse termo é de faces 20;
 * 3. ele é somado, não subtraído (`30-1d20` não é uma checagem);
 * 4. sobra **exatamente um** dado não descartado.
 *
 * Daí: `1d20` e `1d20+11` devolvem o dado; `2d20kh1` devolve o **mantido**, que é
 * o dado da checagem (o descartado não existe para a regra); `1d20+1d6`, `3d6` e
 * `2d20` sem `kh` devolvem `null` — e sem d20 identificável **não há ajuste**,
 * que é o comportamento seguro: perde-se o crítico, não se inventa um.
 */
export function d20NaturalDe(resultado: ResultadoRolagem): number | null {
  const termosDeDados = resultado.termos.filter(
    (termo): termo is TermoDeDados => termo.tipo === 'dados',
  );
  const termo = termosDeDados.length === 1 ? termosDeDados[0] : undefined;
  if (termo === undefined) return null;
  if (termo.faces !== FACES_DO_D20 || termo.sinal !== 1) return null;

  const mantidos = termo.dados.filter((dado) => !dado.descartado);
  if (mantidos.length !== 1) return null;
  return mantidos[0]?.valor ?? null;
}
