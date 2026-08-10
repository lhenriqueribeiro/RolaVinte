import { SISTEMAS_RPG, type SistemaRpg } from '../schemas/mesas';
import {
  ATRIBUTOS,
  ROTULOS_ATRIBUTO,
  type Atributos,
  type NomeAtributo,
} from '../schemas/personagens';
import { SISTEMA_DND5E } from './dnd5e';
import { definicaoGenericaPara, SISTEMA_GENERICO } from './generico';
import { SISTEMA_PATHFINDER2E } from './pathfinder2e/definicao';
import type { DadosFicha, DefinicaoSistema } from './tipos';

/**
 * Registro de sistemas (RV-091) — o **único** lugar do repositório autorizado a
 * associar uma chave de sistema a um comportamento.
 *
 * `Record<SistemaRpg, DefinicaoSistema>` não é decoração: acrescentar um valor a
 * `SISTEMAS_RPG` sem uma linha aqui **para de compilar** (`npm run check`
 * vermelho com `TS2741`, nomeando a chave que falta), e o teste ao lado fica
 * vermelho em tempo de execução nomeando o sistema — as duas portas, porque
 * `npm run test` não faz typecheck e um dos dois comandos sozinho deixaria
 * passar. É o mesmo mecanismo do `Record` de eventos WS do RV-115, que neste
 * projeto já pagou duas vezes.
 *
 * Tormenta 20 e Ordem Paranormal reusam a ficha genérica de propósito: eles
 * estão no enum desde o começo e ainda não têm card de ficha própria. Quando
 * tiverem, troca-se a linha — e nada fora deste arquivo muda.
 */
const REGISTRO: Record<SistemaRpg, DefinicaoSistema> = {
  dnd5e: SISTEMA_DND5E,
  pathfinder2e: SISTEMA_PATHFINDER2E,
  tormenta20: definicaoGenericaPara('tormenta20', 'Tormenta 20'),
  'ordem-paranormal': definicaoGenericaPara('ordem-paranormal', 'Ordem Paranormal'),
  generico: SISTEMA_GENERICO,
};

/** A definição do sistema. Nunca devolve `undefined`: o `Record` é total. */
export function definicaoDoSistema(sistema: SistemaRpg): DefinicaoSistema {
  return REGISTRO[sistema];
}

/** Todas as definições, na ordem de `SISTEMAS_RPG`. */
export const DEFINICOES_SISTEMA: readonly DefinicaoSistema[] = Object.freeze(
  SISTEMAS_RPG.map((chave) => REGISTRO[chave]),
);

/** A ficha de sistema de um personagem recém-criado, com todos os padrões. */
export function dadosIniciaisDaFicha(sistema: SistemaRpg): DadosFicha {
  return definicaoDoSistema(sistema).schemaFicha.parse({});
}

/**
 * Os seis atributos de um personagem recém-criado, na escala do sistema
 * (RV-098): 10 no d20 clássico, +0 no PF2e.
 *
 * Existe porque o padrão **não** cabia no `criarPersonagemSchema`: um `10` fixo
 * ali é o padrão de um sistema só, e numa mesa de PF2e significaria "+10 em
 * tudo" — acima do teto da própria escala, recusado na criação de toda ficha.
 */
export function atributosIniciais(sistema: SistemaRpg): Atributos {
  const { padrao } = definicaoDoSistema(sistema).atributos;
  return {
    forca: padrao,
    destreza: padrao,
    constituicao: padrao,
    inteligencia: padrao,
    sabedoria: padrao,
    carisma: padrao,
  };
}

export interface AtributosValidos {
  ok: true;
  atributos: Atributos;
}

export interface AtributosInvalidos {
  ok: false;
  /** Mensagem em PT-BR, pronta para virar o corpo de um 400. */
  erro: string;
}

function problemaDoAtributo(
  definicao: DefinicaoSistema,
  atributo: NomeAtributo,
  valor: unknown,
): string | null {
  const rotulo = ROTULOS_ATRIBUTO[atributo];
  const escala = definicao.atributos;
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    return `${rotulo}: informe um número.`;
  }
  if (!Number.isInteger(valor)) return `${rotulo}: informe um número inteiro.`;
  if (valor < escala.minimo || valor > escala.maximo) {
    // A faixa não é reescrita aqui: sai de `escala.descricao`, o único lugar onde
    // ela está redigida para o usuário.
    return `${rotulo} ${valor} está fora da escala do sistema (${escala.descricao}).`;
  }
  return null;
}

/**
 * Valida os seis atributos contra a **escala do sistema da mesa** (RV-098).
 *
 * É o irmão de `validarDadosDaFicha`, e existe pelo mesmo motivo: a faixa depende
 * do sistema, e o schema HTTP não sabe de que mesa a requisição fala. O
 * `atributosSchema` garante a forma (seis inteiros); a escala é conferida aqui,
 * com o sistema em mãos, e a recusa vira 400 em PT-BR dizendo o atributo, o valor
 * e a escala — "Destreza 18 está fora da escala do sistema (modificador direto,
 * de -5 a +8)".
 *
 * Devolve objeto em vez de lançar porque falha de validação é resultado esperado
 * (`.claude/rules/01-arquitetura.md`), e o `packages/shared` não conhece o
 * `Result` do domínio da api.
 */
export function validarAtributosDoSistema(
  sistema: SistemaRpg,
  atributos: Atributos,
): AtributosValidos | AtributosInvalidos {
  const definicao = definicaoDoSistema(sistema);
  const problemas = ATRIBUTOS.map((atributo) =>
    problemaDoAtributo(definicao, atributo, atributos[atributo]),
  ).filter((problema): problema is string => problema !== null);

  if (problemas.length > 0) {
    return { ok: false, erro: `Atributos de ${definicao.nome}: ${problemas.join(' ')}` };
  }
  // Só as seis chaves conhecidas atravessam: o que vier de fora do contrato não
  // entra na coluna de carona.
  return {
    ok: true,
    atributos: {
      forca: atributos.forca,
      destreza: atributos.destreza,
      constituicao: atributos.constituicao,
      inteligencia: atributos.inteligencia,
      sabedoria: atributos.sabedoria,
      carisma: atributos.carisma,
    },
  };
}

export interface FichaValida {
  ok: true;
  dados: DadosFicha;
}

export interface FichaInvalida {
  ok: false;
  /** Mensagem em PT-BR, pronta para virar o corpo de um 400. */
  erro: string;
}

/**
 * Valida a metade da ficha que pertence ao sistema.
 *
 * Campo fora da definição é **recusado**, com o nome do campo na mensagem —
 * ignorar em silêncio deixaria o usuário achando que salvou. Devolve um objeto
 * em vez de lançar porque falha de validação é resultado esperado
 * (`.claude/rules/01-arquitetura.md`), e o `packages/shared` não conhece o
 * `Result` do domínio da api.
 */
export function validarDadosDaFicha(
  sistema: SistemaRpg,
  dados: unknown,
): FichaValida | FichaInvalida {
  const definicao = definicaoDoSistema(sistema);
  const resultado = definicao.schemaFicha.safeParse(dados ?? {});
  if (resultado.success) return { ok: true, dados: resultado.data };

  const desconhecidos = resultado.error.issues.flatMap((issue) =>
    issue.code === 'unrecognized_keys' ? issue.keys : [],
  );
  if (desconhecidos.length > 0) {
    const plural = desconhecidos.length > 1 ? 'Campos não previstos' : 'Campo não previsto';
    return {
      ok: false,
      erro: `${plural} na ficha de ${definicao.nome}: ${desconhecidos.join(', ')}.`,
    };
  }

  const detalhes = resultado.error.issues.map((issue) => {
    const caminho = issue.path.join('.');
    return caminho ? `${caminho}: ${issue.message}` : issue.message;
  });
  return { ok: false, erro: `Ficha de ${definicao.nome} inválida. ${detalhes.join(' ')}`.trim() };
}
