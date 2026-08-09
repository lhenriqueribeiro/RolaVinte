import { z } from 'zod';

export const SISTEMAS_RPG = ['dnd5e', 'tormenta20', 'ordem-paranormal', 'generico'] as const;
export type SistemaRpg = (typeof SISTEMAS_RPG)[number];

export const criarMesaSchema = z.object({
  nome: z.string().trim().min(3, 'Nome muito curto').max(80, 'Nome muito longo'),
  descricao: z.string().trim().max(500).default(''),
  sistema: z.enum(SISTEMAS_RPG).default('generico'),
});
export type CriarMesaEntrada = z.infer<typeof criarMesaSchema>;

/**
 * Edição da mesa (RV-024): PATCH parcial derivado de `criarMesaSchema`, para que
 * as mensagens de validação sejam exatamente as mesmas da criação.
 */
export const atualizarMesaSchema = criarMesaSchema.partial();
export type AtualizarMesaEntrada = z.infer<typeof atualizarMesaSchema>;

export const convidarJogadorSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido'),
});
export type ConvidarJogadorEntrada = z.infer<typeof convidarJogadorSchema>;

export const aceitarConviteSchema = z.object({
  token: z.string().min(10),
});
export type AceitarConviteEntrada = z.infer<typeof aceitarConviteSchema>;
