import type { z } from 'zod';
import type { SistemaRpg } from '../schemas/mesas';
import type { Atributos, NomeAtributo } from '../schemas/personagens';

/**
 * Contrato de um sistema de RPG (RV-091).
 *
 * A ficha do RolaVinte tem duas metades:
 *
 * - **comum a todos os sistemas** — nome, classe, nível, PV e os seis atributos.
 *   São colunas da tabela `personagens` e continuam existindo sem mudança.
 * - **própria do sistema** — tudo o mais, guardado em `personagens.dados`
 *   (jsonb) e validado pelo `schemaFicha` da definição.
 *
 * A regra que dá sentido ao card: **nenhum código fora deste diretório pode
 * perguntar "é dnd5e ou pathfinder?"**. Quem precisa de um comportamento que
 * varia por sistema pede a definição ao registro e chama um método dela. Um
 * `switch (sistema)` num caso de uso, num schema ou num componente é o defeito
 * que este arquivo existe para impedir (`.claude/rules/04-design-patterns.md`:
 * o ponto de extensão canônico é `Map<chave, definicao>`).
 */

/** Conteúdo de `personagens.dados` — já validado pelo `schemaFicha` do sistema. */
export type DadosFicha = Record<string, unknown>;

/**
 * Schema da metade da ficha que pertence ao sistema.
 *
 * É obrigatoriamente **estrito** (`.strict()`): campo fora da definição é
 * recusado, não ignorado. Aceitar chave desconhecida transformaria a coluna
 * `dados` numa lixeira sem dono, e o erro só apareceria meses depois, na tela
 * de quem não escreveu o campo. O registro tem um teste que prova a estritura
 * de todas as definições.
 */
export type SchemaFicha = z.ZodType<DadosFicha, z.ZodTypeDef, unknown>;

/** Tipos de entrada que a ficha genérica sabe renderizar. */
export type TipoCampoFicha = 'texto' | 'texto-longo' | 'numero' | 'booleano';

/**
 * Um campo escalar da ficha, na ordem em que a interface deve mostrá-lo.
 *
 * `minimo`/`maximo` existem para a interface (atributos do `input`), **não**
 * como segunda validação: quem valida é o `schemaFicha`. Para que os dois não
 * divirjam em silêncio, o teste do registro exige que `minimo` e `maximo` sejam
 * aceitos pelo schema e que `minimo - 1` e `maximo + 1` sejam recusados.
 */
export interface CampoFicha {
  chave: string;
  rotulo: string;
  tipo: TipoCampoFicha;
  ajuda?: string;
  minimo?: number;
  maximo?: number;
}

/** Agrupamento visual de campos. A interface renderiza na ordem declarada. */
export interface SecaoFicha {
  chave: string;
  titulo: string;
  campos: readonly CampoFicha[];
}

/** Uma perícia do sistema e o atributo do qual ela deriva. */
export interface PericiaFicha {
  chave: string;
  rotulo: string;
  atributo: NomeAtributo;
}

/**
 * Grau de treinamento de uma perícia, como valor exibível.
 *
 * É uma lista por sistema de propósito: D&D 5e tem três degraus e o Pathfinder
 * 2e tem cinco. Fixar o conjunto aqui obrigaria o próximo sistema a caber no
 * molde do anterior.
 */
export interface GrauPericia {
  chave: string;
  rotulo: string;
}

/** O mínimo de uma ficha para calcular qualquer bônus — sem entidade, sem banco. */
export interface FichaCalculavel {
  nivel: number;
  atributos: Atributos;
  dados: DadosFicha;
}

/** Rolagem que a ficha oferece pronta (iniciativa, por exemplo). */
export interface RolagemPadrao {
  chave: string;
  rotulo: string;
  /** Expressão pronta para o motor de dados, já com os bônus da ficha. */
  expressao(ficha: FichaCalculavel): string;
}

export interface DefinicaoSistema {
  /** Igual à chave sob a qual a definição está registrada — o teste confere. */
  readonly chave: SistemaRpg;
  /** Nome exibível, em PT-BR. */
  readonly nome: string;
  readonly schemaFicha: SchemaFicha;
  readonly secoes: readonly SecaoFicha[];
  readonly pericias: readonly PericiaFicha[];
  readonly grausPericia: readonly GrauPericia[];
  /** Dado usado nos testes do sistema (`1d20` nos sistemas d20). */
  readonly dadoDeTeste: string;
  readonly rolagensPadrao: readonly RolagemPadrao[];

  /**
   * Bônus total da perícia, pronto para somar ao dado. `null` quando a perícia
   * não existe neste sistema — a ausência é resposta legítima, não erro.
   */
  bonusPericia(ficha: FichaCalculavel, periciaChave: string): number | null;

  /**
   * Grau de treinamento atual. `null` para perícia inexistente.
   *
   * Existe para que a interface **não** precise saber onde o grau mora dentro de
   * `dados`: em D&D é um mapa `pericias`, em outro sistema pode ser outra coisa.
   */
  grauDePericia(ficha: FichaCalculavel, periciaChave: string): string | null;

  /**
   * Devolve uma cópia de `dados` com o grau da perícia trocado. Pura: não muta a
   * entrada. Perícia ou grau desconhecidos devolvem `dados` inalterado — quem
   * decide o que é válido é o `schemaFicha`, na hora de salvar.
   */
  definirGrauDePericia(dados: DadosFicha, periciaChave: string, grau: string): DadosFicha;
}
