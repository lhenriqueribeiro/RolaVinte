import { z } from 'zod';
import type { SistemaRpg } from '../schemas/mesas';
import { modificadorAtributo } from '../schemas/personagens';
import { CHAVE_INICIATIVA, ROTULO_INICIATIVA } from './iniciativa';
import type { DadosFicha, DefinicaoSistema, EscalaDeAtributo, FichaCalculavel } from './tipos';

/**
 * Ficha genérica (RV-091) — o piso de todo sistema que ainda não tem ficha
 * própria.
 *
 * Ela é **exatamente** a ficha que a plataforma sempre teve: nome, classe,
 * nível, PV e os seis atributos, todos colunas da tabela `personagens`. A parte
 * do sistema (`personagens.dados`) é vazia, e o schema abaixo diz isso de forma
 * verificável: `z.object({}).strict()` aceita `{}` e recusa qualquer outra
 * coisa.
 *
 * É por isso que o card exige "sem perda de dados": um personagem gravado antes
 * deste card não tem a coluna `dados`, a migration a cria com `'{}'`, e `{}` é
 * o único valor que esta definição considera válido. Nada a converter, nada a
 * perder.
 */
const schemaFichaGenerica = z.object({}).strict();

/** Formata um bônus para dentro de uma expressão de dados: `+3`, `-1`, `+0`. */
export function formatarBonus(valor: number): string {
  return valor < 0 ? String(valor) : `+${valor}`;
}

/** Menor e maior valor de atributo do d20 clássico, e o valor de uma ficha nova. */
const VALOR_MINIMO_D20 = 1;
const VALOR_MAXIMO_D20 = 30;
const VALOR_PADRAO_D20 = 10;

/**
 * A escala de atributo do d20 clássico (RV-098): valor de 1 a 30, e o bônus sai
 * da fórmula `(valor − 10) / 2`.
 *
 * Vale para a ficha genérica, para D&D 5e e para qualquer sistema que herde a
 * aritmética do d20 — é a escala que a plataforma sempre pressupôs, agora dita em
 * voz alta em vez de estar embutida no schema de `atributos`. Um sistema com
 * escala própria (o PF2e é o primeiro) declara a sua na própria definição.
 */
export const ESCALA_D20_CLASSICA: EscalaDeAtributo = Object.freeze({
  descricao: `valor de ${VALOR_MINIMO_D20} a ${VALOR_MAXIMO_D20}`,
  minimo: VALOR_MINIMO_D20,
  maximo: VALOR_MAXIMO_D20,
  padrao: VALOR_PADRAO_D20,
  modificador: modificadorAtributo,
});

/**
 * Iniciativa d20 — a única rolagem que a ficha genérica sabe oferecer.
 *
 * O sistema genérico já pressupõe d20 em outro lugar (os atributos vão de 1 a
 * 30 e `modificadorAtributo` é a fórmula `(valor - 10) / 2`), então oferecê-la
 * aqui não acrescenta suposição nova.
 */
function iniciativaD20(ficha: FichaCalculavel): string {
  return `1d20${formatarBonus(ESCALA_D20_CLASSICA.modificador(ficha.atributos.destreza))}`;
}

/**
 * Monta a definição da ficha genérica sob outra chave.
 *
 * Serve aos sistemas que já estão em `SISTEMAS_RPG` e ainda não ganharam ficha
 * própria (Tormenta 20 e Ordem Paranormal). A alternativa — deixá-los sem
 * definição — quebraria o registro, que é justamente o ponto: **todo** sistema
 * declarado tem uma ficha, nem que seja a genérica. Quando o card do sistema
 * chegar, troca-se a linha do registro e nada mais.
 */
export function definicaoGenericaPara(chave: SistemaRpg, nome: string): DefinicaoSistema {
  return {
    chave,
    nome,
    schemaFicha: schemaFichaGenerica,
    secoes: [],
    pericias: [],
    familiasPericia: [],
    grausPericia: [],
    dadoDeTeste: '1d20',
    // A ficha genérica é a do d20 clássico: valor de 1 a 30 com o modificador
    // derivado (RV-098). Nada de material licenciado a atribuir (RV-152).
    atributos: ESCALA_D20_CLASSICA,
    atribuicao: null,
    // A ficha genérica **mantém** a iniciativa por Destreza (decisão registrada no
    // RV-158, que é quem lhe deu o primeiro consumidor). Ela não é "um sistema sem
    // regra": é a ficha do d20 clássico, e isso já está declarado em voz alta duas
    // linhas acima (`ESCALA_D20_CLASSICA`, `dadoDeTeste: '1d20'`). Tirá-la deixaria
    // Tormenta 20 e Ordem Paranormal — que reusam esta definição e são d20 — sem
    // iniciativa nenhuma na plataforma, obrigando o mestre a digitar o bônus de cada
    // participante à mão. A chave sai da constante do contrato: é por ela que o
    // consumidor acha a iniciativa.
    rolagensPadrao: [
      { chave: CHAVE_INICIATIVA, rotulo: ROTULO_INICIATIVA, expressao: iniciativaD20 },
    ],
    // Sem perícias: a ficha genérica não presume a lista de nenhum sistema. As
    // três funções abaixo não são "não implementado" — são a resposta correta
    // para um sistema sem perícias, e a interface nem chega a chamá-las porque
    // `pericias` está vazio.
    bonusPericia: () => null,
    grauDePericia: () => null,
    definirGrauDePericia: (dados: DadosFicha) => dados,
    acoesDePericia: () => [],
    // Nenhuma defesa derivada (RV-155): a ficha genérica não presume a fórmula de
    // CA nem de salvaguarda de sistema nenhum. Derivar por conta própria daria um
    // número plausível numa mesa que joga outra regra.
    defesas: () => [],
    // Nenhum modelo de ataques (RV-156): a ficha genérica não presume a economia de
    // ações de sistema nenhum, e a penalidade de ataques múltiplos é regra de PF2e —
    // oferecer três botões de golpe aqui aplicaria a penalidade de um sistema a uma
    // mesa que joga outro.
    ataques: null,
    // Nenhum grau de sucesso: sem sistema declarado, "28 contra CD 18" não tem
    // resposta certa. Informar uma CD numa mesa destas é 400 em PT-BR (RV-154),
    // e não uma rolagem que engole o número em silêncio.
    avaliarRolagem: null,
  };
}

export const SISTEMA_GENERICO: DefinicaoSistema = definicaoGenericaPara('generico', 'Genérico');
