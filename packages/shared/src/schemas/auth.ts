import { z } from 'zod';

export const registrarSchema = z.object({
  nome: z.string().trim().min(2, 'Nome muito curto').max(60, 'Nome muito longo'),
  email: z.string().trim().toLowerCase().email('Email inválido'),
  senha: z.string().min(8, 'A senha precisa de ao menos 8 caracteres').max(72),
});
export type RegistrarEntrada = z.infer<typeof registrarSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido'),
  senha: z.string().min(1, 'Informe a senha'),
});
export type LoginEntrada = z.infer<typeof loginSchema>;
