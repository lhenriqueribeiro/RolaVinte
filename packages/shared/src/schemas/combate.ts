import { z } from 'zod';

/**
 * Contrato do combate (RV-060 … RV-065): DTOs, limites e schemas de entrada.
 *
 * Arquivo próprio, e não mais um bloco em `schemas/jogo.ts`, porque o combate é
 * um agregado novo dentro do módulo `jogo` — cena, token e chat não precisam de
 * nada daqui, e nada daqui precisa deles.
 */

/**
 * Teto de participantes num combate.
 *
 * Não é enfeite: `tokenIds` vem do cliente, e sem teto um `POST` com dez mil ids
 * faz o servidor carregar a cena inteira, montar o agregado e gravar dez mil
 * linhas numa requisição autenticada — a mesma classe de negação de serviço
 * barata que `LIMITE_MENSAGENS_MAXIMO` fecha no histórico do chat. Cinquenta é
 * folgado para qualquer luta de mesa (o recorde de uma sessão real é uma ordem de
 * grandeza abaixo) e é o **mesmo número** conferido na borda HTTP e no agregado
 * `Combate`: um valor, dois trechos que o leem.
 */
export const MAXIMO_PARTICIPANTES_COMBATE = 50;

export const MENSAGEM_PARTICIPANTES_COMBATE = `Um combate tem de 1 a ${MAXIMO_PARTICIPANTES_COMBATE} participantes.`;

export const MENSAGEM_PARTICIPANTE_DUPLICADO =
  'O mesmo token foi informado duas vezes na lista de participantes.';

/**
 * Faixa da iniciativa.
 *
 * A iniciativa é o **total** de uma rolagem, então o limite existe para recusar
 * lixo (e a expressão que produz lixo), não para modelar regra de sistema:
 * `1d20+3` cabe de sobra, e `1000d20` não vira participante com 20 mil de
 * iniciativa. Negativo é possível de verdade — um modificador de Destreza −5 num
 * 1 natural dá −4.
 */
export const INICIATIVA_MINIMA = -99;
export const INICIATIVA_MAXIMA = 999;

export const MENSAGEM_INICIATIVA = `A iniciativa deve ser um número inteiro entre ${INICIATIVA_MINIMA} e ${INICIATIVA_MAXIMA}.`;

/** Tamanho do nome do participante — o mesmo do nome do token, que é a origem dele. */
export const MENSAGEM_NOME_PARTICIPANTE =
  'Nome do participante do combate deve ter entre 1 e 60 caracteres.';

/**
 * Um participante na ordem de iniciativa.
 *
 * **Não tem `personagemId` de propósito.** Quem vincula peça e ficha é
 * `TokenDTO.personagemId`, e o cliente já carrega os tokens da cena: copiar o
 * vínculo para cá criaria uma segunda verdade que divergiria no instante em que
 * o mestre trocasse a ficha do token (F12 da taxonomia). Pelo mesmo motivo não
 * há PV aqui — ele vive só no `PersonagemDTO` (RV-042).
 *
 * **Não tem `ordemDesempate` de propósito.** O desempate é o que torna a ordem
 * estável no servidor; expô-lo convidaria o cliente a reordenar a lista por
 * conta própria, que é uma segunda implementação da regra de ordenação. A lista
 * chega **já ordenada** e é para ser renderizada na ordem em que veio.
 */
export interface ParticipanteCombateDTO {
  tokenId: string;
  nome: string;
  /** `null` enquanto ninguém rolou a iniciativa deste participante. */
  iniciativa: number | null;
}

export interface CombateDTO {
  id: string;
  mesaId: string;
  cenaId: string;
  rodada: number;
  /** Posição do turno atual **dentro de `participantes`**, que já vem ordenado. */
  indiceTurno: number;
  /**
   * `false` depois de encerrado. O combate encerrado continua chegando ao
   * cliente uma última vez, pelo `combate:atualizado`, para que o painel esvazie
   * na hora — um evento separado de "encerrado" seria um segundo contrato com o
   * mesmo payload.
   */
  ativo: boolean;
  participantes: ParticipanteCombateDTO[];
  /**
   * `tokenId` de quem está no turno, derivado de `indiceTurno`; `null` quando não
   * há participante nenhum.
   *
   * Vem pronto para que o realce no mapa não dependa de o cliente repetir o
   * cálculo de índice — e para que um `indiceTurno` que o cliente interprete
   * errado não realce a peça errada.
   */
  tokenIdDoTurno: string | null;
}

/**
 * Resposta de `GET /mesas/:mesaId/combate`.
 *
 * Embrulhado num objeto, e não um `CombateDTO | null` cru no corpo, pela mesma
 * razão de `CenaComTokensDTO`: um corpo `null` obriga o cliente a distinguir
 * "não há combate" de "a resposta veio vazia por erro de rede".
 */
export interface CombateAtivoDTO {
  combate: CombateDTO | null;
}

/**
 * `POST /mesas/:mesaId/combate` — inicia o combate com os tokens escolhidos.
 *
 * O `refine` de duplicatas está aqui e não no agregado por conveniência da
 * mensagem (a borda diz qual foi o problema em PT-BR), mas o agregado **também**
 * recusa: a lista pode vir de um caminho de escrita futuro que não passe por
 * este schema, e a invariante é dele.
 */
export const iniciarCombateSchema = z.object({
  mesaId: z.string().uuid(),
  tokenIds: z
    .array(z.string().uuid())
    .min(1, MENSAGEM_PARTICIPANTES_COMBATE)
    .max(MAXIMO_PARTICIPANTES_COMBATE, MENSAGEM_PARTICIPANTES_COMBATE)
    .refine((ids) => new Set(ids).size === ids.length, MENSAGEM_PARTICIPANTE_DUPLICADO),
});
export type IniciarCombateEntrada = z.infer<typeof iniciarCombateSchema>;

/**
 * `POST /combates/:combateId/iniciativa` — rola a iniciativa de um participante.
 *
 * O schema **nunca inventa a expressão** — não havia e continua não havendo um
 * `default('1d20')` aqui, porque "com o que se rola iniciativa" é resposta do
 * sistema: em Pathfinder 2e é Percepção, em D&D 5e é Destreza. Quem responde é
 * `DefinicaoSistema.rolagensPadrao`, no registro de sistemas.
 *
 * O RV-158 deu a esse contrato o seu primeiro consumidor, e por isso os dois
 * campos abaixo são **opcionais**:
 *
 * - `expressao` informada **manda**, e é o caminho do NPC sem ficha: o mestre
 *   digita `15` ou `1d20+2` e o combate não trava esperando uma ficha que não
 *   existe.
 * - `rolagem` escolhe entre as formas que o sistema declara (`iniciativa` é a
 *   padrão; `iniciativa:furtividade` é a emboscada de PF2e). Ausente, vale a
 *   padrão do sistema.
 * - **Nenhum dos dois** informado, com peça vinculada a uma ficha: o servidor
 *   deriva o bônus da ficha pela definição do sistema. É por isso que a
 *   iniciativa do jogador não é um número que o cliente escolhe.
 */
export const rolarIniciativaSchema = z.object({
  tokenId: z.string().uuid(),
  expressao: z.string().trim().min(1).max(200).optional(),
  /**
   * Chave da forma de rolar declarada pelo sistema (`CHAVE_INICIATIVA` e as
   * alternativas). Ignorada quando `expressao` vem informada.
   */
  rolagem: z.string().trim().max(80).optional(),
  /** Rótulo da rolagem no chat; vazio deixa o caso de uso montar "Iniciativa — <nome>". */
  motivo: z.string().trim().max(120).default(''),
});
export type RolarIniciativaEntrada = z.infer<typeof rolarIniciativaSchema>;

/**
 * A regra de desempate da ordem de iniciativa, em PT-BR — para a interface
 * **escrever** o que o servidor faz (DoD do RV-158).
 *
 * Mora aqui, junto do DTO cuja ordem ela descreve, e não no componente, porque a
 * ordenação é do agregado `Combate` (RV-060): um texto redigido na tela por conta
 * própria é o caminho curto para a interface prometer um desempate que o servidor
 * não aplica — a classe F6 da taxonomia. Se a regra mudar no agregado, esta frase
 * é o único lugar a corrigir.
 *
 * **Não** diz "personagem de jogador vem antes de NPC": esse desempate não existe
 * na plataforma, e o motivo está registrado no card RV-158.
 */
export const REGRA_DESEMPATE_INICIATIVA =
  'Ordem por iniciativa, da maior para a menor. Empate fica com quem entrou primeiro no combate, ' +
  'e quem ainda não rolou espera no fim da fila.';

/** Maior dano ou cura aceito de uma vez — a mesma ordem de grandeza do teto de PV. */
export const DELTA_PV_MAXIMO = 999;

export const MENSAGEM_DELTA_PV = `Informe um valor inteiro entre -${DELTA_PV_MAXIMO} e ${DELTA_PV_MAXIMO} e diferente de zero: negativo é dano, positivo é cura.`;

/**
 * `POST /combates/:combateId/participantes/:tokenId/pv` — dano ou cura (RV-065).
 *
 * `delta`, e não `pvAtual`: o painel de combate sabe "levou 7", não "ficou com
 * 23". Mandar o valor final obrigaria o cliente a ler o PV, subtrair e escrever
 * — três passos em que dois clientes aplicando dano ao mesmo tempo perdem um dos
 * golpes. O delta é a intenção real e é aplicado sobre o que está gravado.
 *
 * Zero é recusado: uma requisição que grava o mesmo valor, publica dois eventos e
 * escreve "sofreu 0 de dano" no chat é ruído, não uma operação.
 */
export const aplicarDanoSchema = z.object({
  delta: z
    .number()
    .int(MENSAGEM_DELTA_PV)
    .min(-DELTA_PV_MAXIMO, MENSAGEM_DELTA_PV)
    .max(DELTA_PV_MAXIMO, MENSAGEM_DELTA_PV)
    .refine((valor) => valor !== 0, MENSAGEM_DELTA_PV),
});
export type AplicarDanoEntrada = z.infer<typeof aplicarDanoSchema>;
