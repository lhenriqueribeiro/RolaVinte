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
 * Uma ação de perícia e se **esta** ficha pode usá-la (RV-153).
 *
 * Existe porque a regra "esta ação exige treinamento" é do sistema, e não da
 * tela. Escondê-la com um `if` no componente seria decidir por sistema fora do
 * registro e, pior, deixar o jogador sem saber que a ação existe — a interface
 * mostra a ação **indisponível com o motivo escrito**, nunca só oculta.
 */
export interface AcaoDePericia {
  readonly nome: string;
  readonly disponivel: boolean;
  /** Por que está indisponível, em PT-BR. `null` quando está disponível. */
  readonly motivo: string | null;
}

/**
 * Perícia que é uma **família**: o personagem cria quantas instâncias quiser,
 * cada uma com sua especialização e seu próprio grau (RV-153).
 *
 * O caso que obrigou o contrato é o Saber de Pathfinder 2e — "Saber (Guerra)"
 * treinado e "Saber (Náutico)" destreinado convivem na mesma ficha, com bônus
 * diferentes. Como entrada fixa do mapa de treinamentos isso não cabe: a lista
 * é do personagem, não do sistema.
 *
 * A chave de uma instância carrega a especialização (`saber:Guerra`), e é por
 * isso que `rotuloDeInstancia` consegue responder **sem** a ficha: o motivo que
 * acompanha a rolagem no chat é montado a partir da chave.
 */
export interface FamiliaPericia {
  readonly chave: string;
  /** Nome da família, em PT-BR: `Saber`. */
  readonly rotulo: string;
  /** Rótulo do campo que cria uma instância: `Especialização`. */
  readonly rotuloEspecializacao: string;
  readonly ajuda?: string;
  /** As instâncias que **esta** ficha tem, na ordem de exibição. */
  instancias(ficha: FichaCalculavel): readonly PericiaFicha[];
  /** Rótulo exibível da chave (`Saber (Guerra)`); `null` se a chave não é desta família. */
  rotuloDeInstancia(periciaChave: string): string | null;
  /**
   * Cópia de `dados` com uma especialização nova. Pura. Entrada que o sistema
   * recusa (vazia, repetida, acima do teto) devolve `dados` inalterado — quem
   * diz o que é válido é o `schemaFicha`, na hora de salvar.
   */
  acrescentar(dados: DadosFicha, especializacao: string): DadosFicha;
  /** Cópia de `dados` sem aquela instância. Pura. */
  remover(dados: DadosFicha, periciaChave: string): DadosFicha;
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

/**
 * Atribuição de licença que precisa viajar **junto** do conteúdo do sistema
 * (RV-150/RV-152).
 *
 * Um aviso no rodapé do site não cobre uma ficha aberta direto por link, e um
 * `if (sistema === 'pathfinder2e')` na tela para decidir se o aviso aparece é o
 * `switch` que o registro existe para apagar. Então a atribuição é **dado da
 * definição**: quem renderiza monta o aviso quando ela não é `null`, sem saber
 * de que sistema se trata.
 */
export interface AtribuicaoDeSistema {
  readonly texto: string;
  readonly links: readonly { readonly rotulo: string; readonly href: string }[];
}

export interface DefinicaoSistema {
  /** Igual à chave sob a qual a definição está registrada — o teste confere. */
  readonly chave: SistemaRpg;
  /** Nome exibível, em PT-BR. */
  readonly nome: string;
  readonly schemaFicha: SchemaFicha;
  readonly secoes: readonly SecaoFicha[];
  readonly pericias: readonly PericiaFicha[];

  /**
   * Perícias de família, cujas instâncias saem da ficha e não desta lista
   * (RV-153). `[]` em todo sistema que não tem nenhuma — que é o normal.
   *
   * É obrigatório e sem padrão pelo mesmo motivo dos outros campos deste
   * contrato: um sistema novo declara `[]` e fica evidente que a decisão foi
   * tomada, em vez de herdar silêncio.
   */
  readonly familiasPericia: readonly FamiliaPericia[];

  readonly grausPericia: readonly GrauPericia[];
  /** Dado usado nos testes do sistema (`1d20` nos sistemas d20). */
  readonly dadoDeTeste: string;
  readonly rolagensPadrao: readonly RolagemPadrao[];

  /**
   * Se as seis colunas comuns `personagens.atributos` (1..30, lidas por
   * `modificadorAtributo`) valem neste sistema.
   *
   * Existe porque Pathfinder 2e guarda o **modificador** direto na sua metade da
   * ficha e ignora aquelas colunas: oferecer ali o teste genérico de atributo
   * rolaria `+0` para sempre — uma promessa que o sistema não cumpre (F6 da
   * taxonomia). Quem renderiza a metade comum da ficha consulta este campo em
   * vez de perguntar qual é o sistema.
   *
   * É obrigatório e não tem padrão de propósito: sistema novo precisa dizer, em
   * uma palavra, se herda a aritmética de atributo do d20 clássico.
   */
  readonly usaAtributosComuns: boolean;

  /**
   * Atribuição obrigatória ao exibir conteúdo deste sistema. `null` quando não
   * há nada a atribuir — que é o caso de todo sistema sem material licenciado.
   */
  readonly atribuicao: AtribuicaoDeSistema | null;

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

  /**
   * As ações daquela perícia, já resolvidas contra **esta** ficha (RV-153).
   * `[]` quando a perícia não existe ou o sistema não modela ações.
   */
  acoesDePericia(ficha: FichaCalculavel, periciaChave: string): readonly AcaoDePericia[];
}
