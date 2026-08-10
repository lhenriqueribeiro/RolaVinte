import type { z } from 'zod';
import type { AvaliacaoRolagem } from '../chat/avaliacao';
import type { ResultadoRolagem } from '../dados/motor-dados';
import type { SistemaRpg } from '../schemas/mesas';
import type { Atributos, NomeAtributo } from '../schemas/personagens';

/**
 * Contrato de um sistema de RPG (RV-091, corrigido no RV-098).
 *
 * A ficha do RolaVinte tem duas metades:
 *
 * - **comum a todos os sistemas** — nome, classe, nível, PV e os seis atributos.
 *   São colunas da tabela `personagens` e continuam existindo sem mudança.
 * - **própria do sistema** — tudo o mais, guardado em `personagens.dados`
 *   (jsonb) e validado pelo `schemaFicha` da definição.
 *
 * **A ressalva que o RV-098 acrescentou:** "coluna comum" quer dizer *um lugar
 * só*, e não *significado idêntico*. Os seis atributos são o caso: todo sistema
 * tem Força, mas a **escala** muda (1..30 no d20 clássico, −5..+8 no PF2e
 * pós-remaster). Quando o RV-091 leu "comum" como "igual", o PF2e não caberia na
 * coluna e passou a guardar os modificadores num segundo lugar — duas verdades
 * para o mesmo conceito, uma exigida na criação e ignorada na leitura. A saída é
 * `EscalaDeAtributo`: o número continua num lugar só (a coluna comum) e a
 * **interpretação** dele passa a ser dado da definição, como todo o resto que
 * varia por sistema.
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
export type TipoCampoFicha = 'texto' | 'texto-longo' | 'numero' | 'booleano' | 'selecao';

/**
 * Uma opção de um campo `selecao` (RV-155).
 *
 * `valor` é o que vai para `dados`; `rotulo` é o que o jogador lê. As opções são
 * **dado da definição** pelo mesmo motivo dos graus de perícia: quem sabe quais
 * valores o `schemaFicha` aceita é o sistema, e uma lista escrita no JSX
 * divergiria do schema no primeiro valor novo — a tela ofereceria uma opção que
 * a API recusa com 400.
 */
export interface OpcaoCampo {
  readonly valor: string;
  readonly rotulo: string;
}

/**
 * Um campo escalar da ficha, na ordem em que a interface deve mostrá-lo.
 *
 * `minimo`/`maximo` existem para a interface (atributos do `input`), **não**
 * como segunda validação: quem valida é o `schemaFicha`. Para que os dois não
 * divirjam em silêncio, o teste do registro exige que `minimo` e `maximo` sejam
 * aceitos pelo schema e que `minimo - 1` e `maximo + 1` sejam recusados.
 *
 * `opcoes` segue a mesma disciplina para o tipo `selecao`: o teste do registro
 * exige que **toda** opção declarada seja aceita pelo schema, e que um valor
 * fora da lista seja recusado.
 */
export interface CampoFicha {
  chave: string;
  rotulo: string;
  tipo: TipoCampoFicha;
  ajuda?: string;
  minimo?: number;
  maximo?: number;
  /** Obrigatório quando `tipo` é `selecao`; ignorado nos outros tipos. */
  opcoes?: readonly OpcaoCampo[];
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
 * Uma defesa **derivada** da ficha (RV-155): CA, salvaguardas, Percepção, CD de
 * classe.
 *
 * O que ela tem e uma perícia não tem: o número pode ser um **alvo** (CA, CD de
 * classe) em vez de um bônus de checagem, e por isso `rolavel` existe. Rolar uma
 * CA não significa nada; rolar Reflexos é a checagem mais comum de uma sessão.
 *
 * `valor` é `null` quando falta à ficha um dado que o sistema **não pode supor**
 * — a CD de classe sem atributo-chave informado é o caso real. Devolver um número
 * ali seria escolher um atributo por conta própria, e um número inventado é
 * indistinguível de um número certo na tela; `detalhe` diz o que falta, em PT-BR.
 *
 * `detalhe` existe para que a composição do número seja **legível** ("10 +
 * proficiência 7 + Destreza +1 (teto +1 da armadura) + item +4"): é o que
 * responde "por que a minha CA é 22?" sem abrir o livro, e é montado no `shared`
 * porque a interface não faz aritmética.
 */
export interface DefesaFicha {
  readonly chave: string;
  /** Nome exibível, em PT-BR: `CA`, `Fortitude`, `Percepção`, `CD de classe`. */
  readonly rotulo: string;
  /** O número derivado; `null` quando a ficha não tem como calculá-lo ainda. */
  readonly valor: number | null;
  /** O mesmo número pronto para leitura: `22`, `+10`, `—` quando não há valor. */
  readonly valorFormatado: string;
  /** Como o número foi composto — ou o que falta informar. Em PT-BR. */
  readonly detalhe: string;
  /**
   * `true` quando a defesa é uma **checagem de d20** (as três salvaguardas e a
   * Percepção). CA e CD de classe são números-alvo: não se rolam.
   */
  readonly rolavel: boolean;
}

/**
 * Uma variante de rolagem de um ataque, pronta para virar um botão (RV-156).
 *
 * "Variante" porque um ataque não tem uma rolagem, tem várias: no PF2e são três de
 * acerto (uma por ordem do golpe no turno, com a penalidade de ataques múltiplos já
 * aplicada) e duas de dano (a normal e a dobrada do crítico).
 *
 * `expressao: null` significa **não há o que rolar ainda** — falta um dado que a
 * ficha não pode supor, como o bônus de acerto — e `detalhe` diz o que falta. É o
 * mesmo contrato de `DefesaFicha.valor === null`: quem renderiza mostra o controle
 * **desabilitado com o motivo**, e nunca o esconde.
 */
export interface RolagemDeAtaque {
  readonly chave: string;
  /** O que o botão diz: `2º ataque (-5)`, `Dano 1d8+4`, `Dano dobrado (crítico)`. */
  readonly rotulo: string;
  /**
   * Como a rolagem se identifica no chat, **já com o nome do ataque**:
   * `Espada longa (2º ataque (-5))`. O nome do personagem entra depois, em
   * `calculo.ts`, que é onde o travessão do motivo está escrito uma única vez.
   */
  readonly descricao: string;
  /** Expressão pronta para o motor de dados; `null` quando não há o que rolar. */
  readonly expressao: string | null;
  /** Como o número foi composto — ou o que falta informar. Em PT-BR. */
  readonly detalhe: string;
}

/**
 * Um ataque da ficha, com as suas variantes de rolagem (RV-156).
 *
 * **`acertos` e `danos` são listas separadas, e a separação é o contrato.** Acerto
 * é uma checagem: vai contra a CA do alvo e por isso aceita CD, o que faz o chat
 * anunciar o grau de sucesso (RV-154). Dano **não é checado contra nada** — não
 * existe "falha crítica" num 1d8+4 —, e uma lista só, com um campo `aceitaCd`,
 * deixaria a interface livre para esquecer o `if`. Assim ela não tem como errar:
 * só o que está em `acertos` recebe CD.
 */
export interface AtaqueDaFicha {
  /** Identifica o ataque dentro desta ficha; não é gravada em lugar nenhum. */
  readonly chave: string;
  readonly nome: string;
  /**
   * Os campos **informados** deste ataque, como estão gravados. É o que a
   * interface edita, com os mesmos componentes das seções da ficha — daí o formato
   * de `DadosFicha`, e não um objeto com nomes fixos que a tela teria de conhecer.
   */
  readonly valores: DadosFicha;
  readonly acertos: readonly RolagemDeAtaque[];
  readonly danos: readonly RolagemDeAtaque[];
}

/**
 * Como o sistema modela os ataques da ficha (RV-156). `null` no sistema que não os
 * modela — que é resposta, e não pendência.
 *
 * É um objeto, e não quatro membros novos em `DefinicaoSistema`, pelo mesmo motivo
 * de `FamiliaPericia`: a lista é do personagem (ele cria, edita e remove ataques),
 * então o contrato precisa levar junto os campos editáveis e as três funções puras
 * que produzem a próxima versão de `dados`.
 *
 * **Todo texto que a seção mostra sai daqui**, inclusive as frases de regra. Escrever
 * "a penalidade zera no fim do turno" no JSX seria colocar regra na tela, onde ela
 * divergiria da regra que está no cálculo — e nenhum sistema fora do seu diretório
 * pode ser citado pela interface.
 */
export interface ModeloDeAtaques {
  /** Título da seção, em PT-BR. */
  readonly rotulo: string;
  /** As regras que o jogador precisa ler para usar a seção sem se enganar. */
  readonly ajuda: string;
  /** Rótulo do campo que cria um ataque. */
  readonly rotuloNovo: string;
  /** Rótulo do número-alvo do acerto (`CA do alvo`, no PF2e). */
  readonly rotuloCdAlvo: string;
  /** Por que ele é opcional e o que muda quando é informado. Em PT-BR. */
  readonly ajudaCdAlvo: string;
  /** Teto de ataques por ficha. */
  readonly limite: number;
  /** Os campos informados de **um** ataque, na ordem de exibição. */
  readonly campos: readonly CampoFicha[];
  /** Os ataques desta ficha, já com as variantes de rolagem resolvidas. */
  ataques(ficha: FichaCalculavel): readonly AtaqueDaFicha[];
  /**
   * Cópia de `dados` com um ataque novo. Pura. Nome vazio, longo demais ou lista
   * cheia devolvem `dados` inalterado — quem diz o que é válido é o `schemaFicha`.
   */
  acrescentar(dados: DadosFicha, nome: string): DadosFicha;
  /** Cópia de `dados` sem aquele ataque. Pura. */
  remover(dados: DadosFicha, ataqueChave: string): DadosFicha;
  /** Cópia de `dados` com um campo daquele ataque trocado. Pura. */
  definirCampo(dados: DadosFicha, ataqueChave: string, campo: string, valor: unknown): DadosFicha;
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

/**
 * A escala dos seis atributos comuns naquele sistema (RV-098).
 *
 * O que ela responde, e que antes não tinha dono: **o que significa o número
 * gravado em `personagens.atributos`**. No d20 clássico é o valor 1..30, e o
 * bônus sai da fórmula `(valor − 10) / 2`; no Pathfinder 2e pós-remaster o
 * número gravado **já é** o modificador, de −5 a +8, e a fórmula não existe.
 *
 * É obrigatória e sem padrão, pelo mesmo motivo dos outros campos deste contrato:
 * sistema novo declara a sua escala conscientemente, e não herda a de outro em
 * silêncio — herdar em silêncio foi o defeito que este contrato veio matar.
 *
 * Todo consumidor do número passa por aqui: a ficha usa `minimo`/`maximo` no
 * `input`, `padrao` na criação, `modificador` na rolagem, e `validarAtributosDoSistema`
 * (`registro.ts`) transforma a faixa em 400 com mensagem em PT-BR.
 */
export interface EscalaDeAtributo {
  /**
   * A escala em uma frase, em PT-BR, para legenda e mensagem de erro:
   * `valor de 1 a 30`, `modificador direto, de -5 a +8`.
   *
   * É o **único** lugar onde a faixa aparece escrita para o usuário: repeti-la
   * no JSX ou na mensagem de validação deixaria dois textos para divergir.
   */
  readonly descricao: string;
  readonly minimo: number;
  readonly maximo: number;
  /** Valor de cada atributo numa ficha recém-criada. */
  readonly padrao: number;
  /**
   * O número gravado virando o bônus que entra na rolagem. Identidade nos
   * sistemas cuja escala já é o modificador.
   */
  modificador(valor: number): number;
}

/**
 * O mínimo de uma ficha para calcular qualquer bônus — sem entidade, sem banco.
 *
 * `atributos` está **na escala do sistema** (RV-098): 16 numa ficha de D&D 5e é
 * o valor que vale +3; 4 numa ficha de PF2e já é o +4. Quem lê o número sem
 * passar por `definicao.atributos.modificador` está supondo uma escala.
 */
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
   * A escala dos seis atributos comuns neste sistema (RV-098).
   *
   * Substituiu o `usaAtributosComuns: boolean` do RV-152, que era a pergunta
   * errada: o problema nunca foi *se* as colunas comuns valem — elas são o único
   * lugar do atributo —, e sim **em que escala** o número está. Enquanto a
   * pergunta era booleana, o PF2e respondia "não valem" e guardava os seus
   * modificadores em `dados`, criando a segunda verdade que o RV-098 fechou.
   */
  readonly atributos: EscalaDeAtributo;

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

  /**
   * As defesas derivadas desta ficha, na ordem de exibição (RV-155). `[]` no
   * sistema que não as modela — que é a resposta certa, não um "não
   * implementado".
   *
   * É obrigatório e sem padrão, como os outros campos deste contrato: um sistema
   * novo declara `[]` e fica evidente que a decisão foi tomada. E é **método**, e
   * não lista, porque toda defesa depende do que está gravado na ficha — nível,
   * grau e atributo entram na conta.
   */
  defesas(ficha: FichaCalculavel): readonly DefesaFicha[];

  /**
   * Como este sistema modela ataques (RV-156). `null` no sistema que não os modela.
   *
   * **Obrigatório e sem padrão**, como `defesas`, `atribuicao` e `avaliarRolagem`:
   * ter ou não ataques na ficha é comportamento que o jogador percebe, e um `?`
   * opcional deixaria todo sistema novo respondendo "não tenho" por omissão em vez
   * de por decisão.
   */
  readonly ataques: ModeloDeAtaques | null;

  /**
   * Como este sistema transforma uma rolagem e uma CD num grau de sucesso
   * (RV-154). `null` no sistema que **não** avalia — e aí informar uma CD é 400
   * em PT-BR, não descarte silencioso.
   *
   * É o ponto de extensão do card: `RolarDados` pede a definição do sistema da
   * mesa ao registro e chama isto se não for `null`. Sem o campo, a alternativa
   * seria um `if (mesa.sistema === 'pathfinder2e')` dentro do caso de uso — o
   * `switch` que este arquivo existe para apagar, e que o DoD do RV-154 proíbe
   * por nome.
   *
   * **Obrigatório e sem padrão**, como `atribuicao`, `familiasPericia` e
   * `defesas`: "esta mesa aceita CD?" é comportamento que o jogador percebe, e um
   * `?` opcional deixaria todo sistema novo respondendo "não" por omissão em vez
   * de por decisão. *(O escopo do card escrevia `avaliarRolagem?`; a divergência
   * está registrada na nota de entrega do RV-154 — F11 da taxonomia.)*
   */
  readonly avaliarRolagem: AvaliadorDeRolagem | null;
}

/**
 * Recebe o resultado do motor de dados (agnóstico de sistema) e a CD, devolve a
 * avaliação. Pura: nada de I/O, nada de estado.
 */
export type AvaliadorDeRolagem = (resultado: ResultadoRolagem, cd: number) => AvaliacaoRolagem;
