import { z } from 'zod';

export const ATRIBUTOS = [
  'forca',
  'destreza',
  'constituicao',
  'inteligencia',
  'sabedoria',
  'carisma',
] as const;
export type NomeAtributo = (typeof ATRIBUTOS)[number];

export const atributosSchema = z.object({
  forca: z.number().int().min(1).max(30),
  destreza: z.number().int().min(1).max(30),
  constituicao: z.number().int().min(1).max(30),
  inteligencia: z.number().int().min(1).max(30),
  sabedoria: z.number().int().min(1).max(30),
  carisma: z.number().int().min(1).max(30),
});
export type Atributos = z.infer<typeof atributosSchema>;

/**
 * A metade da ficha que pertence ao sistema da mesa (RV-091).
 *
 * Aqui só se verifica que é um objeto: **quem valida o conteúdo é o
 * `schemaFicha` do sistema** (`sistemas/registro.ts`), e este schema não tem
 * como saber de que mesa a requisição fala. A validação de verdade acontece no
 * domínio, com o sistema em mãos, e campo fora da definição vira 400.
 */
export const dadosFichaSchema = z.record(z.string(), z.unknown(), {
  invalid_type_error: 'Os dados da ficha devem ser um objeto.',
});

export const criarPersonagemSchema = z.object({
  nome: z.string().trim().min(2).max(60),
  classe: z.string().trim().max(40).default(''),
  nivel: z.number().int().min(1).max(20).default(1),
  pvMax: z.number().int().min(1).max(999).default(10),
  atributos: atributosSchema.default({
    forca: 10,
    destreza: 10,
    constituicao: 10,
    inteligencia: 10,
    sabedoria: 10,
    carisma: 10,
  }),
  anotacoes: z.string().max(5000).default(''),
  /** Omitido nasce com os padrões do sistema (`dadosIniciaisDaFicha`). */
  dados: dadosFichaSchema.optional(),
});
export type CriarPersonagemEntrada = z.infer<typeof criarPersonagemSchema>;

export const atualizarPersonagemSchema = criarPersonagemSchema.partial().extend({
  pvAtual: z.number().int().min(0).max(999).optional(),
});
export type AtualizarPersonagemEntrada = z.infer<typeof atualizarPersonagemSchema>;

/** Modificador de atributo estilo d20: (valor - 10) / 2, arredondado para baixo. */
export function modificadorAtributo(valor: number): number {
  return Math.floor((valor - 10) / 2);
}
