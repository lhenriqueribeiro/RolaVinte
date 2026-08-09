import { SISTEMAS_RPG, type SistemaRpg } from '../schemas/mesas';
import { SISTEMA_DND5E } from './dnd5e';
import { definicaoGenericaPara, SISTEMA_GENERICO } from './generico';
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
