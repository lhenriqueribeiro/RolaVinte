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
