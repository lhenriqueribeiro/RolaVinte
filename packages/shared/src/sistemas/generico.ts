import { z } from 'zod';
import type { SistemaRpg } from '../schemas/mesas';
import { modificadorAtributo } from '../schemas/personagens';
import type { DadosFicha, DefinicaoSistema, FichaCalculavel } from './tipos';

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

/**
 * Iniciativa d20 — a única rolagem que a ficha genérica sabe oferecer.
 *
 * O sistema genérico já pressupõe d20 em outro lugar (os atributos vão de 1 a
 * 30 e `modificadorAtributo` é a fórmula `(valor - 10) / 2`), então oferecê-la
 * aqui não acrescenta suposição nova.
 */
function iniciativaD20(ficha: FichaCalculavel): string {
  return `1d20${formatarBonus(modificadorAtributo(ficha.atributos.destreza))}`;
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
    grausPericia: [],
    dadoDeTeste: '1d20',
    rolagensPadrao: [{ chave: 'iniciativa', rotulo: 'Iniciativa', expressao: iniciativaD20 }],
    // Sem perícias: a ficha genérica não presume a lista de nenhum sistema. As
    // três funções abaixo não são "não implementado" — são a resposta correta
    // para um sistema sem perícias, e a interface nem chega a chamá-las porque
    // `pericias` está vazio.
    bonusPericia: () => null,
    grauDePericia: () => null,
    definirGrauDePericia: (dados: DadosFicha) => dados,
  };
}

export const SISTEMA_GENERICO: DefinicaoSistema = definicaoGenericaPara('generico', 'Genérico');
