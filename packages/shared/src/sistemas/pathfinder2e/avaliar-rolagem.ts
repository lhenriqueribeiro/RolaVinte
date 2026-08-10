import type { ResultadoRolagem } from '../../dados/motor-dados';
import type { AvaliacaoRolagem, EfeitoDadoNatural } from '../../chat/avaliacao';
import { d20NaturalDe, grauSucesso, GRAUS_SUCESSO, type GrauSucesso } from './regras';

/**
 * A avaliação de uma checagem de Pathfinder 2e (RV-154) — o primeiro consumidor
 * de produção da metade do RV-151 que só tinha testes.
 *
 * **Este arquivo não decide nada de regra.** Ele chama `grauSucesso` e
 * `d20NaturalDe` e embala a resposta no formato que a mensagem grava. A tentação
 * que o card nomeia é reescrever a comparação com a CD aqui (ou no componente de
 * chat): são três linhas, funcionam, e passam a existir duas aritméticas — a
 * errata do dia seguinte é aplicada numa só, e as duas telas discordam.
 *
 * O par canônico é `grauSucesso({ total, cd, d20Natural: d20NaturalDe(resultado) })`,
 * e `d20Natural: null` significa **sem ajuste**, não "não deu 20": em `1d20+1d6`
 * não existe resposta segura para "qual foi o d20?", então a regra do dado natural
 * simplesmente não se aplica (perde-se o crítico, não se inventa um).
 */

/**
 * Este valor de dado aciona a regra do dado natural?
 *
 * A pergunta é respondida **pelo próprio motor de regras**, e não por um
 * `natural === 20 || natural === 1` escrito aqui: os números da regra moram em
 * `regras.ts` e o DoD do RV-151 exige que continuem morando só lá. A sonda usa
 * uma checagem sintética exatamente na CD — `total === cd` cai em "sucesso", que
 * é um grau do meio da escala e portanto pode subir **ou** descer sem topar nas
 * pontas. Se o grau muda quando o dado natural entra na conta, então aquele valor
 * de dado aciona o ajuste.
 *
 * Sem esta pergunta não há como distinguir "o dado era 7 e a regra nem se aplica"
 * de "o dado era 20 e o grau já era o melhor possível" — e a tela precisa dizer
 * coisas diferentes nos dois casos.
 */
function dadoAcionaAjuste(d20Natural: number, cd: number): boolean {
  return grauSucesso({ total: cd, cd }) !== grauSucesso({ total: cd, cd, d20Natural });
}

/** Para que lado o ajuste levou o grau — `GRAUS_SUCESSO` vai do melhor ao pior. */
function efeitoDoDadoNatural(
  comAjuste: GrauSucesso,
  semAjuste: GrauSucesso,
  d20Natural: number | null,
  cd: number,
): EfeitoDadoNatural | null {
  if (d20Natural === null) return null;
  if (!dadoAcionaAjuste(d20Natural, cd)) return null;
  const distancia = GRAUS_SUCESSO.indexOf(comAjuste) - GRAUS_SUCESSO.indexOf(semAjuste);
  if (distancia < 0) return 'melhorou';
  if (distancia > 0) return 'piorou';
  // A regra se aplicou e o grau não mudou: já estava na ponta da escala. É o caso
  // do 20 natural contra uma CD que o total já superava por 10.
  return 'sem-efeito';
}

/**
 * Avalia a rolagem contra a CD informada.
 *
 * `grauSucesso` é chamada duas vezes de propósito — com e sem o dado natural —
 * porque a diferença entre as duas respostas **é** o efeito do 20/1 natural. Não
 * é conta repetida: é a mesma função respondendo a duas perguntas, e é o que
 * permite gravar o efeito em vez de a tela deduzi-lo depois.
 */
export function avaliarRolagemPathfinder2e(
  resultado: ResultadoRolagem,
  cd: number,
): AvaliacaoRolagem {
  const d20Natural = d20NaturalDe(resultado);
  const total = resultado.total;
  const semAjuste = grauSucesso({ total, cd });
  const grau = grauSucesso({ total, cd, d20Natural });
  return {
    cd,
    grau,
    d20Natural,
    efeitoNatural: efeitoDoDadoNatural(grau, semAjuste, d20Natural, cd),
  };
}
