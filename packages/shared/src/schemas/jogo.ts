import { z } from 'zod';

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
