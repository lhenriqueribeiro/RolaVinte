import { z } from 'zod';
import { CD_MAXIMA, CD_MINIMA, MENSAGEM_CD_INVALIDA } from '../chat/avaliacao';

export const enviarMensagemSchema = z.object({
  mesaId: z.string().uuid(),
  conteudo: z.string().trim().min(1, 'Mensagem vazia').max(2000),
});
export type EnviarMensagemEntrada = z.infer<typeof enviarMensagemSchema>;

export const rolarDadosSchema = z.object({
  mesaId: z.string().uuid(),
  expressao: z.string().trim().min(1).max(200),
  motivo: z.string().trim().max(120).default(''),
  /**
   * Rolagem oculta do mestre (RV-071). Fica exposta na rota de propósito: a
   * proteção é o 403 do caso de uso, não o comando estar escondido na UI.
   */
  oculta: z.boolean().default(false),
  /**
   * CD da checagem (RV-154), quando quem rola é a **ficha** e não uma pessoa
   * digitando: a salvaguarda clicada já sabe o número, e mandá-lo como número
   * evita montar `"1d20+6 cd 18"` para o servidor desmontar de novo — duas
   * gramáticas para o mesmo dado, que é o defeito que o RV-074 apagou do chat.
   *
   * `null`/ausente = sem CD, e portanto **sem grau de sucesso**: não existe CD
   * padrão. A faixa é a mesma do sufixo `cd N` do chat, da mesma constante.
   */
  cd: z
    .number()
    .int(MENSAGEM_CD_INVALIDA)
    .min(CD_MINIMA, MENSAGEM_CD_INVALIDA)
    .max(CD_MAXIMA, MENSAGEM_CD_INVALIDA)
    .nullable()
    .default(null),
});
export type RolarDadosEntrada = z.infer<typeof rolarDadosSchema>;

/**
 * Paginação do histórico do chat (RV-073).
 *
 * O cursor é o par `(criadoEm, id)` da mensagem mais antiga já carregada — e
 * **não** um `offset`. Com deslocamento, uma mensagem que chega entre o pedido
 * da página 1 e o da página 2 empurra a janela inteira: o leitor recebe de novo
 * o registro que estava na fronteira (ou pula um, se alguém apagasse). Com
 * cursor, a segunda página é definida pelo conteúdo — "o que é anterior a esta
 * mensagem" — e nada que chegue depois a desloca.
 *
 * O `id` desempata: numa mesa movimentada duas mensagens caem no mesmo
 * milissegundo, e um cursor só de instante ou repetiria as empatadas (`lte`) ou
 * as engoliria (`lt`). Por isso as duas metades andam **juntas**, e meia metade
 * é 400 em vez de um cursor que erra em silêncio.
 */
export const LIMITE_MENSAGENS_PADRAO = 50;

/**
 * Teto de página. Não é enfeite: sem ele `?limite=100000` é uma negação de
 * serviço barata — uma requisição autenticada varre a tabela de mensagens da
 * mesa e monta o JSON inteiro na memória do processo.
 */
export const LIMITE_MENSAGENS_MAXIMO = 100;

export const MENSAGEM_LIMITE_MENSAGENS = `O limite de mensagens deve ser um inteiro entre 1 e ${LIMITE_MENSAGENS_MAXIMO}.`;
export const MENSAGEM_CURSOR_INVALIDO =
  'Cursor de histórico inválido: "antesDe" é uma data ISO e "antesDeId" é o id da mensagem.';
export const MENSAGEM_CURSOR_INCOMPLETO =
  'Para carregar mensagens anteriores, informe "antesDe" e "antesDeId" juntos.';

/** Posição estável no histórico: a mensagem a partir da qual se olha para trás. */
export interface CursorMensagens {
  /** `criadoEm` da mensagem, ISO 8601. */
  antesDe: string;
  /** Id da mensagem — desempata quem nasceu no mesmo instante. */
  antesDeId: string;
}

/**
 * Querystring de `GET /mesas/:mesaId/mensagens`.
 *
 * Os campos entram como texto porque é o que uma querystring é; o schema é o
 * único lugar que converte. `limite` é validado pelo formato **antes** de virar
 * número para que `?limite=100000` e `?limite=abc` recebam a mesma frase em
 * PT-BR, em vez de um "Expected number, received nan" vindo do Zod.
 */
export const listarMensagensQuerySchema = z
  .object({
    antesDe: z.string().datetime({ offset: true, message: MENSAGEM_CURSOR_INVALIDO }).optional(),
    antesDeId: z.string().uuid(MENSAGEM_CURSOR_INVALIDO).optional(),
    limite: z
      .string()
      .regex(/^\d{1,4}$/, MENSAGEM_LIMITE_MENSAGENS)
      .transform(Number)
      .refine((n) => n >= 1 && n <= LIMITE_MENSAGENS_MAXIMO, MENSAGEM_LIMITE_MENSAGENS)
      .default(String(LIMITE_MENSAGENS_PADRAO)),
  })
  .refine((q) => (q.antesDe === undefined) === (q.antesDeId === undefined), {
    message: MENSAGEM_CURSOR_INCOMPLETO,
    path: ['antesDe'],
  });
export type ListarMensagensQuery = z.infer<typeof listarMensagensQuerySchema>;

/**
 * O cursor da querystring, ou `null` na primeira página.
 *
 * Mora aqui, ao lado do `refine` que exige as duas metades juntas: quem lê a
 * query não precisa repetir a regra — e não existe um segundo lugar para ela
 * divergir.
 */
export function cursorDeMensagens(query: ListarMensagensQuery): CursorMensagens | null {
  if (query.antesDe === undefined || query.antesDeId === undefined) return null;
  return { antesDe: query.antesDe, antesDeId: query.antesDeId };
}

/** Lado da célula do grid, em pixels (RV-033). */
export const TAMANHO_CELULA_MIN = 20;
export const TAMANHO_CELULA_MAX = 200;
export const TAMANHO_CELULA_PADRAO = 44;

/**
 * Mensagem única do limite de célula. O schema Zod e o agregado `Cena` usam
 * esta constante: o mestre recebe o mesmo texto vindo da borda HTTP ou do
 * domínio, e não existe cópia para divergir.
 */
export const MENSAGEM_TAMANHO_CELULA = 'Tamanho da célula deve estar entre 20 e 200.';

export const COR_GRID_PADRAO = '#3a4a63';

const COR_HEXADECIMAL = /^#[0-9a-fA-F]{6}$/;

export const criarCenaSchema = z.object({
  mesaId: z.string().uuid(),
  nome: z.string().trim().min(1).max(80),
  larguraGrid: z.number().int().min(5).max(100).default(25),
  alturaGrid: z.number().int().min(5).max(100).default(15),
  corFundo: z.string().regex(COR_HEXADECIMAL, 'Cor inválida').default('#1a2332'),
  tamanhoCelula: z
    .number()
    .int(MENSAGEM_TAMANHO_CELULA)
    .min(TAMANHO_CELULA_MIN, MENSAGEM_TAMANHO_CELULA)
    .max(TAMANHO_CELULA_MAX, MENSAGEM_TAMANHO_CELULA)
    .default(TAMANHO_CELULA_PADRAO),
  gridVisivel: z.boolean().default(true),
  corGrid: z.string().regex(COR_HEXADECIMAL, 'Cor do grid inválida').default(COR_GRID_PADRAO),
});
export type CriarCenaEntrada = z.infer<typeof criarCenaSchema>;

/**
 * Edição da cena (RV-030/RV-033): PATCH parcial derivado de `criarCenaSchema`,
 * para que as mensagens de validação sejam idênticas às da criação. `mesaId`
 * sai porque cena não muda de mesa.
 *
 * `.partial()` embrulha cada campo em `optional`, que curto-circuita antes do
 * `default` — campo ausente chega como `undefined` ao caso de uso, e não como o
 * valor padrão (senão um PATCH de nome zeraria a cor do grid).
 */
export const atualizarCenaSchema = criarCenaSchema.omit({ mesaId: true }).partial();
export type AtualizarCenaEntrada = z.infer<typeof atualizarCenaSchema>;

/** Imagem de fundo da cena (RV-032): o que a API aceita em `POST /cenas/:id/fundo`. */
export const TIPOS_IMAGEM_FUNDO = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type TipoImagemFundo = (typeof TIPOS_IMAGEM_FUNDO)[number];

export const TAMANHO_MAXIMO_IMAGEM_FUNDO_BYTES = 8 * 1024 * 1024;

/** Nome do campo multipart que carrega o arquivo. */
export const CAMPO_IMAGEM_FUNDO = 'arquivo';

export const MENSAGEM_TIPO_IMAGEM_FUNDO = 'Envie uma imagem PNG, JPEG ou WebP.';
export const MENSAGEM_TAMANHO_IMAGEM_FUNDO = 'A imagem do mapa deve ter no máximo 8 MB.';

export const criarTokenSchema = z.object({
  cenaId: z.string().uuid(),
  nome: z.string().trim().min(1).max(60),
  cor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#e74c3c'),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  personagemId: z.string().uuid().nullable().default(null),
});
export type CriarTokenEntrada = z.infer<typeof criarTokenSchema>;

export const moverTokenSchema = z.object({
  tokenId: z.string().uuid(),
  x: z.number().int().min(0).max(999),
  y: z.number().int().min(0).max(999),
});
export type MoverTokenEntrada = z.infer<typeof moverTokenSchema>;

/**
 * Edição das propriedades do token (RV-040): PATCH parcial derivado de
 * `criarTokenSchema`, para que nome e cor tenham exatamente as mesmas regras da
 * criação. Posição fica de fora de propósito — mover tem rota própria, com
 * autorização diferente (jogador move o token do seu personagem; só o mestre
 * renomeia e recolore).
 */
export const atualizarTokenSchema = criarTokenSchema.pick({ nome: true, cor: true }).partial();
export type AtualizarTokenEntrada = z.infer<typeof atualizarTokenSchema>;

/**
 * Arte do token (RV-041).
 *
 * Tipo, tamanho máximo e nome do campo multipart são **os mesmos** da imagem de
 * fundo (RV-032): as constantes são reaproveitadas, não recopiadas, para que
 * apertar ou afrouxar o limite valha para os dois uploads de uma vez. Só a
 * mensagem de tamanho é própria — quem sobe a arte de um monstro não deve ler
 * "imagem do mapa".
 */
export const TIPOS_IMAGEM_TOKEN = TIPOS_IMAGEM_FUNDO;
export type TipoImagemToken = TipoImagemFundo;
export const TAMANHO_MAXIMO_IMAGEM_TOKEN_BYTES = TAMANHO_MAXIMO_IMAGEM_FUNDO_BYTES;
export const CAMPO_IMAGEM_TOKEN = CAMPO_IMAGEM_FUNDO;
export const MENSAGEM_TIPO_IMAGEM_TOKEN = MENSAGEM_TIPO_IMAGEM_FUNDO;
export const MENSAGEM_TAMANHO_IMAGEM_TOKEN = 'A arte do token deve ter no máximo 8 MB.';

/**
 * O que uma condição é, para quem a desenha (RV-064).
 *
 * O `icone` **nunca** aparece sozinho: a UI é obrigada a mostrar o `rotulo`
 * junto (ou como `aria-label`/`title`), porque nada neste projeto pode ser
 * transmitido só por cor ou só por forma. Um emoji é forma.
 */
export interface DefinicaoCondicao {
  /** Rótulo em PT-BR, do jeito que o mestre lê na mesa. */
  rotulo: string;
  /** Símbolo curto, um único grafema. Acompanha o rótulo, não o substitui. */
  icone: string;
  /** Uma linha sobre o efeito, para o `title` do ícone. */
  descricao: string;
}

/**
 * Catálogo de condições — **o ponto de extensão** (RV-064).
 *
 * ## Como acrescentar uma condição
 *
 * Acrescente uma entrada aqui. Nada mais. Não existe `if`, `switch` nem lista
 * paralela: `CondicaoToken`, `condicaoSchema` (o 400 da rota), a ordem de
 * exibição e os botões do painel do mestre **todos derivam deste objeto**. Uma
 * condição nova é aceita pela API e ganha botão na tela sem tocar em caso de uso
 * nem em componente.
 *
 * ## Por que a chave é o `keyof` e não um union escrito à mão
 *
 * Um `type CondicaoToken = 'caido' | …` ao lado do catálogo seriam duas listas
 * da mesma coisa, e a segunda envelheceria em silêncio — a classe **F2** da
 * taxonomia. Derivando o tipo do valor, esquecer a metade é impossível: não há
 * metade.
 *
 * ## Por que não há uma lista destas em SQL
 *
 * A coluna `tokens.condicoes` é `text[]` **sem** `check` enumerando as chaves,
 * de propósito (migration `0011`): um `check` seria a mesma lista em outra
 * linguagem, exatamente o defeito que o `mesas.sistema` cobrou (RV-096) e que
 * só se conserta com uma guarda comparando as duas pontas. Aqui a lista tem uma
 * casa só, e quem recusa valor desconhecido é o `condicaoSchema` (400) mais o
 * agregado `Token` — nesta ordem, e os dois com teste.
 *
 * ## Por que o catálogo é único, e não um por sistema de RPG
 *
 * Marcar "envenenado" no token é anotação de mesa, não regra de sistema: nada
 * aqui calcula penalidade nenhuma. Se algum dia uma condição precisar de efeito
 * mecânico (o `enfraquecido` do PF2e mexe em CD e acerto), o lugar dela é a
 * `DefinicaoSistema` do registro de sistemas, e este catálogo continua sendo o
 * vocabulário comum de marcação.
 *
 * A ordem das entradas é alfabética e é a ordem de exibição — ver
 * `normalizarCondicoes`.
 */
const CATALOGO_CONDICOES = {
  agarrado: {
    rotulo: 'Agarrado',
    icone: '🕸️',
    descricao: 'Preso por outra criatura ou efeito; não sai do lugar.',
  },
  amedrontado: {
    rotulo: 'Amedrontado',
    icone: '😱',
    descricao: 'Com medo: penalidade nas rolagens enquanto durar.',
  },
  atordoado: {
    rotulo: 'Atordoado',
    icone: '💫',
    descricao: 'Sem conseguir agir no próprio turno.',
  },
  caido: {
    rotulo: 'Caído',
    icone: '🔻',
    descricao: 'No chão; levantar custa parte do turno.',
  },
  cego: {
    rotulo: 'Cego',
    icone: '🕶️',
    descricao: 'Não vê nada — só percebe o que ouve ou toca.',
  },
  enfeiticado: {
    rotulo: 'Enfeitiçado',
    icone: '💗',
    descricao: 'Sob efeito de encantamento de outra criatura.',
  },
  enfraquecido: {
    rotulo: 'Enfraquecido',
    icone: '📉',
    descricao: 'Penalidade geral em testes, ataques e defesas.',
  },
  envenenado: {
    rotulo: 'Envenenado',
    icone: '🤢',
    descricao: 'Veneno em ação: penalidade e, às vezes, dano contínuo.',
  },
  imovel: {
    rotulo: 'Imóvel',
    icone: '⛔',
    descricao: 'Não pode se deslocar, mas continua agindo.',
  },
  inconsciente: {
    rotulo: 'Inconsciente',
    icone: '💤',
    descricao: 'Desacordado, indefeso e sem ações.',
  },
  invisivel: {
    rotulo: 'Invisível',
    icone: '👻',
    descricao: 'Não pode ser visto sem magia ou sentido especial.',
  },
  lento: {
    rotulo: 'Lento',
    icone: '🐌',
    descricao: 'Menos ações ou menos deslocamento por turno.',
  },
  sangrando: {
    rotulo: 'Sangrando',
    icone: '🩸',
    descricao: 'Dano contínuo até alguém estancar.',
  },
  surdo: {
    rotulo: 'Surdo',
    icone: '🔇',
    descricao: 'Não ouve nada; falha no que depende de escutar.',
  },
} as const satisfies Record<string, DefinicaoCondicao>;

/** Chave de condição — derivada do catálogo, nunca escrita à mão. */
export type CondicaoToken = keyof typeof CATALOGO_CONDICOES;

/** O catálogo, para quem precisa do rótulo e do ícone de uma chave. */
export const CONDICOES: Readonly<Record<CondicaoToken, DefinicaoCondicao>> =
  Object.freeze(CATALOGO_CONDICOES);

/**
 * As chaves na ordem canônica de exibição. É esta lista que o painel do mestre
 * percorre — botão novo aparece por acréscimo ao catálogo, sem tocar na tela.
 */
export const CONDICOES_DISPONIVEIS: readonly CondicaoToken[] = Object.freeze(
  Object.keys(CATALOGO_CONDICOES) as CondicaoToken[],
);

/**
 * A condição que o zerar de PV aplica (RV-065).
 *
 * Existe como constante para que o caso de uso de dano não digite a string: um
 * `'inconciente'` com erro de digitação seria recusado só em runtime, e aqui é
 * erro de compilação.
 */
export const CONDICAO_INCONSCIENTE: CondicaoToken = 'inconsciente';

export const MENSAGEM_CONDICAO_DESCONHECIDA = `Condição desconhecida. As condições disponíveis são: ${CONDICOES_DISPONIVEIS.join(', ')}.`;

/** Narrowing de uma chave crua vinda do cliente ou do banco. */
export function ehCondicaoConhecida(valor: string): valor is CondicaoToken {
  return Object.hasOwn(CATALOGO_CONDICOES, valor);
}

/**
 * Normaliza uma coleção de chaves cruas: **descarta desconhecidas, remove
 * duplicatas e ordena pela ordem do catálogo**.
 *
 * É o único lugar onde "sem duplicata e sem ordem significativa" existe, e ele
 * é usado pelo agregado `Token` (na criação, na reconstituição e em cada
 * marcação) — logo marcar "caído" duas vezes deixa uma, e marcar A depois B é
 * indistinguível de marcar B depois A. Ordem estável também evita que o mesmo
 * conjunto de ícones troque de lugar na tela entre dois `token:atualizado`.
 *
 * Descartar chave desconhecida é o que mantém a leitura viva depois de uma
 * condição sair do catálogo: a peça perde o marcador (que ninguém saberia
 * desenhar) em vez de derrubar a cena inteira.
 */
export function normalizarCondicoes(valores: readonly string[]): CondicaoToken[] {
  const presentes = new Set(valores.filter(ehCondicaoConhecida));
  return CONDICOES_DISPONIVEIS.filter((chave) => presentes.has(chave));
}

/**
 * Uma condição de cada vez, dita como fato: `aplicada: true` marca,
 * `false` desmarca (`PATCH /tokens/:tokenId/condicoes`).
 *
 * **Por que não `{ condicoes: [...] }` substituindo a lista inteira:** o mestre
 * e o combate escrevem no mesmo token quase ao mesmo tempo. Uma substituição
 * total faz o "inconsciente" do RV-065 apagar o "envenenado" que o mestre
 * acabou de marcar, sem ninguém notar. Delta de um item é a menor escrita que
 * expressa a intenção real, e é idempotente por construção.
 */
export const alternarCondicaoTokenSchema = z.object({
  condicao: z.string().refine((valor): valor is CondicaoToken => ehCondicaoConhecida(valor), {
    message: MENSAGEM_CONDICAO_DESCONHECIDA,
  }),
  aplicada: z.boolean(),
});
export type AlternarCondicaoTokenEntrada = z.infer<typeof alternarCondicaoTokenSchema>;
