import {
  definicaoDoSistema,
  opcoesDeIniciativa,
  type CombateDTO,
  type OpcaoDeIniciativa,
  type PersonagemDTO,
  type TokenDTO,
} from '@rolavinte/shared';

/**
 * As contas do painel de iniciativa (RV-063), como funções puras.
 *
 * Elas existem fora do componente por dois motivos. O primeiro é o de sempre
 * neste projeto: cruzamento de caches e derivação de estado se provam sem
 * navegador. O segundo é específico deste painel — cada linha da ordem precisa de
 * três caches ao mesmo tempo (`['combate']`, `['cena']` e `['personagens']`), e
 * fazer esse cruzamento dentro do JSX espalharia o `?.` por toda a árvore.
 *
 * ## O que estas funções deliberadamente NÃO fazem
 *
 * **Não ordenam nada.** `CombateDTO.participantes` chega já ordenado pelo
 * agregado `Combate`, com o desempate estável que só o servidor conhece
 * (`ordemDesempate` não sai no DTO justamente para não convidar o cliente a
 * repetir a regra). Reordenar aqui seria uma segunda implementação da ordenação,
 * livre para divergir — e o texto que o painel mostra ao usuário
 * (`REGRA_DESEMPATE_INICIATIVA`) passaria a descrever algo que a tela não faz.
 *
 * **Não recalculam o turno a partir do índice.** Quem está na vez é
 * `combate.tokenIdDoTurno`, que vem pronto no contrato.
 *
 * **Não copiam PV.** O PV vive no `PersonagemDTO` (RV-042) e o participante do
 * combate nem tem o campo; a linha carrega a referência à ficha, e quem desenha lê
 * dela.
 */

/** Uma linha da ordem de iniciativa, com tudo que a tela precisa já resolvido. */
export interface LinhaDeCombate {
  tokenId: string;
  /** Nome copiado do token quando a luta começou — é o que o painel mostra. */
  nome: string;
  /** `null` enquanto ninguém rolou a iniciativa desta peça. */
  iniciativa: number | null;
  /** Posição na ordem, começando em 1 — para leitura, não para cálculo. */
  posicao: number;
  /** `true` na peça de quem está na vez, derivado de `tokenIdDoTurno`. */
  noTurno: boolean;
  /**
   * A peça no mapa, quando ainda está na cena. `null` quando o token foi
   * removido: o participante continua na ordem gravada no servidor, e some do
   * painel só quando o servidor o tirar.
   */
  token: TokenDTO | null;
  /** Ficha vinculada à peça; `null` no NPC e no objeto (RV-042). */
  personagem: PersonagemDTO | null;
  /** `true` quando a ficha desta peça é de um personagem meu. */
  minha: boolean;
  /**
   * As formas de rolar iniciativa que o **sistema da mesa** oferece para esta
   * ficha (RV-158), na ordem declarada — a padrão primeiro. `[]` sem ficha, e aí
   * o único caminho é o mestre informar a expressão à mão.
   */
  opcoes: readonly OpcaoDeIniciativa[];
}

interface Entrada {
  combate: CombateDTO;
  /** Tokens da cena ativa, do cache `['cena', mesaId]`. */
  tokens: readonly TokenDTO[];
  /** Fichas da mesa, do cache `['personagens', mesaId]`. */
  personagens: readonly PersonagemDTO[];
  /** Ids das fichas que são minhas — quem pode rolar a própria iniciativa. */
  meusPersonagemIds: ReadonlySet<string>;
}

/**
 * As linhas do painel, **na ordem em que os participantes vieram do servidor**.
 *
 * O sistema sai de `personagem.sistema`, que o `PersonagemDTO` carrega desde o
 * RV-091: assim a linha é autossuficiente e o painel não precisa esperar o cache
 * `['mesa', id]` para saber com o que se rola iniciativa.
 */
export function linhasDeCombate({
  combate,
  tokens,
  personagens,
  meusPersonagemIds,
}: Entrada): LinhaDeCombate[] {
  const tokenPorId = new Map(tokens.map((t) => [t.id, t]));
  const personagemPorId = new Map(personagens.map((p) => [p.id, p]));

  return combate.participantes.map((participante, indice) => {
    const token = tokenPorId.get(participante.tokenId) ?? null;
    const personagem = token?.personagemId
      ? (personagemPorId.get(token.personagemId) ?? null)
      : null;
    return {
      tokenId: participante.tokenId,
      nome: participante.nome,
      iniciativa: participante.iniciativa,
      posicao: indice + 1,
      noTurno: combate.tokenIdDoTurno === participante.tokenId,
      token,
      personagem,
      minha: personagem !== null && meusPersonagemIds.has(personagem.id),
      opcoes: personagem
        ? opcoesDeIniciativa(definicaoDoSistema(personagem.sistema), personagem)
        : [],
    };
  });
}

/**
 * `true` quando a vez é de uma peça **minha** — o gatilho do aviso destacado.
 *
 * Fora da minha vez devolve `false`, inclusive quando ninguém está na vez
 * (combate sem participantes) e quando a peça da vez não tem ficha.
 */
export function ehMinhaVez(linhas: readonly LinhaDeCombate[]): boolean {
  return linhas.some((linha) => linha.noTurno && linha.minha);
}

/**
 * Quem está na vez, para o aviso e para o realce. `null` quando o combate não tem
 * participante nenhum.
 */
export function linhaDoTurno(linhas: readonly LinhaDeCombate[]): LinhaDeCombate | null {
  return linhas.find((linha) => linha.noTurno) ?? null;
}

/**
 * Quem pode rolar a iniciativa desta peça: o mestre rola por qualquer um, o
 * jogador só pela ficha dele.
 *
 * É a mesma regra que `RolarIniciativa` aplica no servidor (403 com
 * `INICIATIVA_DE_TERCEIRO`), repetida aqui **só** para não oferecer um botão que
 * vai falhar. Quem protege é o caso de uso — esconder o controle nunca é
 * autorização (F4).
 */
export function podeRolarIniciativa(linha: LinhaDeCombate, souMestre: boolean): boolean {
  return souMestre || linha.minha;
}

/**
 * O corpo do `POST /combates/:id/iniciativa` para esta linha.
 *
 * A regra decisiva está aqui, e é a razão de a função existir separada do JSX:
 * quando a peça tem ficha, o cliente manda **a chave da forma de rolar**
 * (`rolagem`) e nunca a expressão. Mandar `expressao` calculada no navegador
 * **anularia** a derivação do RV-158 — a iniciativa do jogador voltaria a ser um
 * número que o cliente escolhe. O servidor recusa isso com 403 desde o RV-066
 * (`INICIATIVA_INFORMADA_E_DO_MESTRE`); o que esta função evita é a requisição que
 * já se sabe recusada. Sem ficha, a expressão digitada pelo mestre é o único
 * caminho (é o NPC), e é o que vai.
 *
 * `null` quando não há o que mandar: peça sem ficha e sem expressão digitada
 * levaria 400 (`INICIATIVA_SEM_FICHA`), então o botão fica desabilitado em vez de
 * gastar uma requisição.
 */
export function pedidoDeIniciativa(
  linha: LinhaDeCombate,
  rolagemEscolhida: string,
  expressaoDigitada: string,
): { tokenId: string; rolagem?: string; expressao?: string } | null {
  if (linha.opcoes.length > 0) {
    // Chave vazia é tratada pelo servidor como "a padrão do sistema", então
    // omiti-la e mandá-la vazia são a mesma coisa — omitir é o corpo menor.
    return rolagemEscolhida === ''
      ? { tokenId: linha.tokenId }
      : { tokenId: linha.tokenId, rolagem: rolagemEscolhida };
  }
  const expressao = expressaoDigitada.trim();
  if (expressao === '') return null;
  return { tokenId: linha.tokenId, expressao };
}
