import type { DefinicaoSistema, FichaCalculavel, RolagemPadrao } from './tipos';

/**
 * Iniciativa (RV-158) — **quem** responde "com o que se rola iniciativa", e como
 * a resposta chega a quem precisa dela.
 *
 * ## O problema que este arquivo resolve
 *
 * A iniciativa não é do combate, é do **sistema**. Em D&D 5e é uma checagem de
 * Destreza; em Pathfinder 2e é uma checagem de **Percepção**, ou de uma perícia
 * quando a cena pede (Furtividade numa emboscada, Enganação numa negociação que
 * desanda). Uma mesa de D&D não pode passar a rolar Percepção porque o PF2e
 * entrou no repositório, e um `if (mesa.sistema === …)` no caso de uso de combate
 * é o `switch` que o registro de sistemas existe para apagar
 * (`.claude/rules/04-design-patterns.md`).
 *
 * Então a resposta vem de `DefinicaoSistema.rolagensPadrao`, e este arquivo é o
 * **tradutor** entre aquela lista e o que um consumidor precisa: uma opção com
 * chave, rótulo e expressão pronta para o motor de dados.
 *
 * ## `rolagensPadrao` era contrato órfão, e é isto que fecha a F2
 *
 * `dnd5e`, `tormenta20`, `ordem-paranormal` e `generico` declaravam a iniciativa
 * desde que o registro nasceu, e **zero linhas de produção** a leiam — só testes
 * (medido na verificação da v0.7.0). Consequência para o usuário: a iniciativa que
 * a definição promete não era oferecida em tela nenhuma, em sistema nenhum. É a
 * classe **F2** da taxonomia, a mesma de `mesa:participante-removido`.
 *
 * O consumidor de produção é `RolarIniciativa` (`apps/api`), que pede a opção
 * daqui em vez de aceitar do cliente a expressão de quem tem ficha. E o buraco
 * fica **fechado por teste**: `iniciativa.test.ts` exige que **toda** entrada de
 * `rolagensPadrao` de **todo** sistema seja oferecida por `opcoesDeIniciativa`.
 * Declarar uma rolagem padrão que nada oferece deixa a suíte vermelha nomeando o
 * sistema e a chave — que é o mesmo mecanismo do `Record` de eventos WS (RV-116).
 *
 * ## A convenção de chave, e por que ela existe
 *
 * - `iniciativa` — a rolagem **padrão** do sistema. Uma por sistema.
 * - `iniciativa:<perícia>` — uma **alternativa**, quando o sistema oferece
 *   escolha.
 *
 * As alternativas são declaradas **pelo sistema**, e não montadas aqui a partir
 * de `definicao.pericias`: "o mestre pode pedir outra perícia para a iniciativa" é
 * regra de Pathfinder 2e, e oferecê-la numa mesa de D&D 5e seria legislar sobre a
 * regra alheia — do lado errado, porque em D&D a iniciativa é sempre Destreza.
 * Sistema que não oferece escolha declara uma entrada só, e o seletor da interface
 * nasce com uma opção.
 */

/** Chave da rolagem de iniciativa **padrão** do sistema. */
export const CHAVE_INICIATIVA = 'iniciativa';

/**
 * Como a iniciativa se anuncia no chat e no seletor.
 *
 * Escrito **uma vez** e lido por `rotuloDeIniciativa` (aqui), pelas definições de
 * sistema e pelo caso de uso que monta o motivo da rolagem (`Iniciativa —
 * Thorin`). Duas redações da mesma palavra dariam duas linhas diferentes no chat
 * para a mesma coisa.
 */
export const ROTULO_INICIATIVA = 'Iniciativa';

/** Separador entre a chave da iniciativa e a da perícia alternativa. */
const SEPARADOR = ':';

/** A chave da alternativa que rola por aquela perícia: `iniciativa:furtividade`. */
export function chaveDeIniciativaPor(periciaChave: string): string {
  return `${CHAVE_INICIATIVA}${SEPARADOR}${periciaChave}`;
}

/**
 * `true` quando a chave é uma rolagem de iniciativa — a padrão ou uma
 * alternativa.
 *
 * É por aqui que `opcoesDeIniciativa` separa o que é iniciativa do que um sistema
 * venha a declarar como outra rolagem pronta. Uma rolagem padrão que não seja
 * iniciativa **não** é erro; ela só precisa do seu próprio consumidor, e o teste
 * deste arquivo cobra isso em voz alta.
 */
export function ehChaveDeIniciativa(chave: string): boolean {
  return chave === CHAVE_INICIATIVA || chave.startsWith(`${CHAVE_INICIATIVA}${SEPARADOR}`);
}

/**
 * Rótulo de uma iniciativa que diz **por que** se rola: `Iniciativa (Percepção)`.
 *
 * Existe para que o parêntese esteja escrito num lugar só. O sistema que rola
 * iniciativa de uma única forma não precisa dele: `Iniciativa` sozinho já é a
 * frase completa (é o caso de D&D 5e e da ficha genérica).
 */
export function rotuloDeIniciativa(porQue: string): string {
  return `${ROTULO_INICIATIVA} (${porQue})`;
}

/**
 * Uma forma de rolar iniciativa **nesta ficha**, pronta para virar opção de
 * seletor e para ir ao motor de dados.
 *
 * Não tem `motivo` de propósito: o motivo do chat leva o nome de quem rola, e no
 * combate esse nome é o do **participante** (o nome do token, que é o que o painel
 * mostra), não o do personagem. Quem monta a frase é o consumidor, com `rotulo` em
 * mãos — do contrário haveria duas frases para a mesma linha de chat.
 */
export interface OpcaoDeIniciativa {
  /** Como o pedido se refere a esta opção: `iniciativa`, `iniciativa:furtividade`. */
  readonly chave: string;
  /** O que o seletor mostra e o que o chat anuncia: `Iniciativa (Percepção)`. */
  readonly rotulo: string;
  /** Expressão pronta para o motor de dados, com o bônus desta ficha: `1d20+9`. */
  readonly expressao: string;
  /** `true` na rolagem que o sistema considera a padrão. Exatamente uma, quando há. */
  readonly padrao: boolean;
}

function comoOpcao(rolagem: RolagemPadrao, ficha: FichaCalculavel): OpcaoDeIniciativa {
  return {
    chave: rolagem.chave,
    rotulo: rolagem.rotulo,
    expressao: rolagem.expressao(ficha),
    padrao: rolagem.chave === CHAVE_INICIATIVA,
  };
}

/**
 * As formas de rolar iniciativa que **este sistema** oferece para **esta ficha**,
 * na ordem em que a definição as declarou (a padrão primeiro, por convenção das
 * definições).
 *
 * `[]` no sistema que não declara iniciativa nenhuma — e isso é resposta, não
 * pendência: quem chama informa a expressão na mão (é o caminho do NPC sem ficha,
 * que existe de qualquer forma).
 *
 * Recebe a **definição**, e não a chave do sistema, para não importar o registro:
 * assim este módulo é folha e pode ser importado de dentro de uma definição sem
 * ciclo. Quem tem a chave em mãos resolve com `definicaoDoSistema(...)`, como
 * `rolar-dados.ts` já faz para o grau de sucesso.
 */
export function opcoesDeIniciativa(
  definicao: DefinicaoSistema,
  ficha: FichaCalculavel,
): readonly OpcaoDeIniciativa[] {
  return definicao.rolagensPadrao
    .filter((rolagem) => ehChaveDeIniciativa(rolagem.chave))
    .map((rolagem) => comoOpcao(rolagem, ficha));
}

/**
 * A opção escolhida: a de `chave`, ou a padrão do sistema quando `chave` é
 * ausente ou vazia.
 *
 * `null` tem dois significados, e quem chama distingue olhando
 * `opcoesDeIniciativa`: lista vazia é "este sistema não declara iniciativa";
 * lista com itens é "a chave pedida não é uma delas". A distinção importa porque
 * as duas viram mensagens de recusa diferentes para o mestre.
 */
export function iniciativaEscolhida(
  definicao: DefinicaoSistema,
  ficha: FichaCalculavel,
  chave?: string,
): OpcaoDeIniciativa | null {
  const opcoes = opcoesDeIniciativa(definicao, ficha);
  const procurada =
    chave === undefined || chave === ''
      ? opcoes.find((opcao) => opcao.padrao)
      : opcoes.find((opcao) => opcao.chave === chave);
  return procurada ?? null;
}
