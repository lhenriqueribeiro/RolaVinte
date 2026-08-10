import { formatarBonus } from '../generico';
import { CHAVE_INICIATIVA, chaveDeIniciativaPor, rotuloDeIniciativa } from '../iniciativa';
import type { DefesaFicha, DefinicaoSistema, FichaCalculavel, RolagemPadrao } from '../tipos';
import { CHAVE_PERCEPCAO } from './defesas';
import { PERICIAS_PF2E, type PericiaPathfinder } from './pericias';

/**
 * Iniciativa de Pathfinder Segunda Edição (RV-158).
 *
 * **Atribuição.** O que está aqui é *mecânica* — "a iniciativa é uma checagem de
 * Percepção, ou de outra perícia quando a situação pede" —, Open Game Content sob
 * a OGL 1.0a, implementável com atribuição. O texto que acompanha a exibição vem
 * de `ATRIBUICAO_PF2E` (RV-150), por `DefinicaoSistema.atribuicao`.
 *
 * ## Nenhuma aritmética entra neste arquivo
 *
 * É o ponto do card, e a armadilha nomeada no briefing: a Percepção **já está
 * calculada** desde o RV-155, e a soma tem dono. Este arquivo:
 *
 * - lê a Percepção da lista de `defesas(ficha)` pela chave `CHAVE_PERCEPCAO` — a
 *   **mesma** lista que a ficha desenha, produzida por `montarDefesas` →
 *   `calcularPercepcao` → `bonusProficiencia`;
 * - lê o bônus da perícia alternativa pelo `bonusPericia` da própria definição, que
 *   é o mesmo que a seção Perícias mostra.
 *
 * Não há um `+ nivel` escrito aqui, nem tabela de proficiência, nem `10 +` nada.
 * Se houvesse, a errata de proficiência seria aplicada em um lugar e a iniciativa
 * continuaria errada — com um número plausível, que é o pior tipo de número errado.
 * Há teste comparando a expressão da iniciativa com a expressão que a Percepção da
 * ficha oferece: os dois têm de ser idênticos, caractere por caractere.
 *
 * ## Por que uma fábrica, e não uma constante
 *
 * `defesas` e `bonusPericia` moram em `definicao.ts`, que importa este arquivo. Uma
 * constante que os chamasse direto fecharia um ciclo de importação; receber as
 * duas funções é o mesmo caminho que `montarDefesas(ficha, modificadorDe)` e
 * `ATAQUES_PF2E(dadoDeTeste)` já seguem. O efeito prático é que este módulo não
 * consegue supor a escala de atributo nem por acidente.
 *
 * ## As dezessete opções
 *
 * A padrão é a Percepção. As dezesseis alternativas são as perícias de chave fixa,
 * porque no PF2e a iniciativa pode sair de qualquer perícia que a cena justifique.
 * O Saber fica de fora: as instâncias dele são da ficha (`dados.saberes`), e
 * `rolagensPadrao` é uma lista estática — declarar "Iniciativa (Saber (Guerra))"
 * exigiria a ficha em mãos na hora de montar a definição.
 */

/** Como a Percepção se chama no seletor e no chat: `Iniciativa (Percepção)`. */
const ROTULO_PERCEPCAO = 'Percepção';

/**
 * O que este arquivo precisa da definição do sistema — e nada além.
 *
 * `Pick` em vez de uma interface escrita à mão: se a assinatura de `defesas` ou de
 * `bonusPericia` mudar em `DefinicaoSistema`, esta fábrica para de compilar em vez
 * de continuar chamando um contrato que deixou de existir.
 */
export type RegrasDeIniciativaPf2e = Pick<
  DefinicaoSistema,
  'dadoDeTeste' | 'defesas' | 'bonusPericia'
>;

/**
 * A expressão de uma checagem deste sistema: `1d20+9`.
 *
 * `bonus === null` é inalcançável nos dois chamadores (a Percepção está sempre em
 * `DEFESAS_PF2E`, e as alternativas **são** a tabela de perícias). Não se inventa
 * um `+0` para o caso impossível: sem bônus a expressão sai como o dado puro, que
 * é distinguível de `1d20+0` e é justamente o que o teste "toda opção traz um
 * termo de bônus explícito" derruba se algum dia acontecer.
 */
function expressaoDeChecagem(dadoDeTeste: string, bonus: number | null): string {
  return bonus === null ? dadoDeTeste : `${dadoDeTeste}${formatarBonus(bonus)}`;
}

/** A Percepção desta ficha, lida da mesma lista que a ficha mostra. */
function percepcaoDaFicha(regras: RegrasDeIniciativaPf2e, ficha: FichaCalculavel): number | null {
  const percepcao: DefesaFicha | undefined = regras
    .defesas(ficha)
    .find((defesa) => defesa.chave === CHAVE_PERCEPCAO);
  return percepcao?.valor ?? null;
}

/**
 * As formas de rolar iniciativa em Pathfinder 2e: a Percepção primeiro, depois as
 * dezesseis perícias, na ordem alfabética da tabela.
 *
 * A Percepção vem primeiro porque é a regra; a interface pré-seleciona a que tem
 * `padrao: true`, e é esta.
 */
export function rolagensDeIniciativaPf2e(regras: RegrasDeIniciativaPf2e): readonly RolagemPadrao[] {
  const porPericia = (pericia: PericiaPathfinder): RolagemPadrao => ({
    chave: chaveDeIniciativaPor(pericia.chave),
    rotulo: rotuloDeIniciativa(pericia.rotulo),
    expressao: (ficha) =>
      expressaoDeChecagem(regras.dadoDeTeste, regras.bonusPericia(ficha, pericia.chave)),
  });

  return Object.freeze([
    {
      chave: CHAVE_INICIATIVA,
      rotulo: rotuloDeIniciativa(ROTULO_PERCEPCAO),
      expressao: (ficha: FichaCalculavel) =>
        expressaoDeChecagem(regras.dadoDeTeste, percepcaoDaFicha(regras, ficha)),
    },
    ...PERICIAS_PF2E.map(porPericia),
  ]);
}
