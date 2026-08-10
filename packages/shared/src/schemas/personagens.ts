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

/** Nome exibível de cada atributo, em PT-BR. Usado em tela e em mensagem de erro. */
export const ROTULOS_ATRIBUTO: Record<NomeAtributo, string> = {
  forca: 'Força',
  destreza: 'Destreza',
  constituicao: 'Constituição',
  inteligencia: 'Inteligência',
  sabedoria: 'Sabedoria',
  carisma: 'Carisma',
};

/**
 * Os seis atributos, **sem faixa** — a faixa é do sistema (RV-098).
 *
 * Até o RV-098 este schema fixava 1..30, a escala do d20 clássico, como se ela
 * fosse universal. Não é: Pathfinder 2e pós-remaster guarda o **modificador**
 * direto, de −5 a +8. Com a faixa escrita aqui, o único jeito de o PF2e caber era
 * guardar os modificadores num segundo lugar (`dados.modificadorForca`) — e foi
 * exatamente o que aconteceu, produzindo duas verdades para o mesmo conceito: a
 * coluna comum exigida na criação, gravada e **ignorada** pela ficha.
 *
 * Aqui só se verifica a **forma** (seis inteiros). Quem valida a faixa é
 * `validarAtributosDoSistema` (`sistemas/registro.ts`), com o sistema da mesa em
 * mãos — a mesma divisão que `dadosFichaSchema` já usava para a metade da ficha
 * que pertence ao sistema. Um HTTP schema não sabe de que mesa a requisição
 * fala; o domínio sabe, e é lá que o 400 nasce.
 */
export const atributosSchema = z.object({
  forca: z.number().int(),
  destreza: z.number().int(),
  constituicao: z.number().int(),
  inteligencia: z.number().int(),
  sabedoria: z.number().int(),
  carisma: z.number().int(),
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
  /**
   * Omitido nasce com o padrão da **escala do sistema** (`atributosIniciais`) —
   * 10 no d20 clássico, +0 no PF2e (RV-098).
   *
   * O `10` fixo que estava aqui era o padrão de um sistema só: numa mesa de PF2e
   * ele significaria "+10 em tudo", acima do teto da escala. Um padrão que
   * depende do sistema não pode morar num schema que não conhece a mesa.
   */
  atributos: atributosSchema.optional(),
  anotacoes: z.string().max(5000).default(''),
  /** Omitido nasce com os padrões do sistema (`dadosIniciaisDaFicha`). */
  dados: dadosFichaSchema.optional(),
});
export type CriarPersonagemEntrada = z.infer<typeof criarPersonagemSchema>;

export const atualizarPersonagemSchema = criarPersonagemSchema.partial().extend({
  pvAtual: z.number().int().min(0).max(999).optional(),
});
export type AtualizarPersonagemEntrada = z.infer<typeof atualizarPersonagemSchema>;

/**
 * Modificador de atributo estilo d20: (valor − 10) / 2, arredondado para baixo.
 *
 * É a fórmula **daquela escala**, não a de todo sistema: quem precisa do
 * modificador de uma ficha qualquer chama `definicao.atributos.modificador(...)`,
 * que em PF2e é a identidade (o número gravado já é o modificador).
 */
export function modificadorAtributo(valor: number): number {
  return Math.floor((valor - 10) / 2);
}
