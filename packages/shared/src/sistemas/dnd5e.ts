import { z } from 'zod';
import { modificadorAtributo } from '../schemas/personagens';
import { formatarBonus } from './generico';
import type {
  DadosFicha,
  DefinicaoSistema,
  FichaCalculavel,
  GrauPericia,
  PericiaFicha,
} from './tipos';

/**
 * D&D 5e (RV-091 + RV-090) — a primeira prova de que a strategy aguenta um
 * sistema com regra própria.
 *
 * O escopo aqui é deliberadamente pequeno: perícias com grau de treinamento e
 * o cabeçalho de combate. A ficha completa (salvaguardas, ataques, espaços de
 * magia, abas) é o RV-092, e **estende** este arquivo — nenhuma outra parte do
 * código precisa saber que ele cresceu.
 */

/** Onde o grau de treinamento das perícias mora dentro de `dados`. */
const CHAVE_PERICIAS = 'pericias';

/**
 * As 18 perícias e o atributo do qual cada uma deriva. Só mecânica: nome e
 * atributo-base, sem uma linha de texto descritivo.
 */
export const PERICIAS_DND5E: readonly PericiaFicha[] = Object.freeze([
  { chave: 'acrobacia', rotulo: 'Acrobacia', atributo: 'destreza' },
  { chave: 'adestrar-animais', rotulo: 'Adestrar Animais', atributo: 'sabedoria' },
  { chave: 'arcanismo', rotulo: 'Arcanismo', atributo: 'inteligencia' },
  { chave: 'atletismo', rotulo: 'Atletismo', atributo: 'forca' },
  { chave: 'atuacao', rotulo: 'Atuação', atributo: 'carisma' },
  { chave: 'enganacao', rotulo: 'Enganação', atributo: 'carisma' },
  { chave: 'furtividade', rotulo: 'Furtividade', atributo: 'destreza' },
  { chave: 'historia', rotulo: 'História', atributo: 'inteligencia' },
  { chave: 'intimidacao', rotulo: 'Intimidação', atributo: 'carisma' },
  { chave: 'intuicao', rotulo: 'Intuição', atributo: 'sabedoria' },
  { chave: 'investigacao', rotulo: 'Investigação', atributo: 'inteligencia' },
  { chave: 'medicina', rotulo: 'Medicina', atributo: 'sabedoria' },
  { chave: 'natureza', rotulo: 'Natureza', atributo: 'inteligencia' },
  { chave: 'percepcao', rotulo: 'Percepção', atributo: 'sabedoria' },
  { chave: 'persuasao', rotulo: 'Persuasão', atributo: 'carisma' },
  { chave: 'prestidigitacao', rotulo: 'Prestidigitação', atributo: 'destreza' },
  { chave: 'religiao', rotulo: 'Religião', atributo: 'inteligencia' },
  { chave: 'sobrevivencia', rotulo: 'Sobrevivência', atributo: 'sabedoria' },
] as const satisfies readonly PericiaFicha[]);

/**
 * Quantas vezes o bônus de proficiência entra no total. Especialista dobra —
 * é a "expertise" do ladino e do bardo.
 */
const MULTIPLICADOR_POR_GRAU: Record<string, number> = {
  destreinado: 0,
  proficiente: 1,
  especialista: 2,
};

export const GRAUS_PERICIA_DND5E: readonly GrauPericia[] = Object.freeze([
  { chave: 'destreinado', rotulo: 'Destreinado' },
  { chave: 'proficiente', rotulo: 'Proficiente' },
  { chave: 'especialista', rotulo: 'Especialista' },
]);

const CHAVES_GRAU = GRAUS_PERICIA_DND5E.map((g) => g.chave) as [string, ...string[]];

/**
 * Bônus de proficiência por nível: +2 no 1º e +1 a cada quatro níveis.
 * Nível 1–4 → +2 · 5–8 → +3 · 9–12 → +4 · 13–16 → +5 · 17–20 → +6.
 */
export function bonusProficienciaDnd5e(nivel: number): number {
  return 2 + Math.floor((Math.min(Math.max(nivel, 1), 20) - 1) / 4);
}

const grauSchema = z.enum(CHAVES_GRAU, {
  invalid_type_error: 'Grau de perícia inválido.',
});

const periciasSchema = z
  .object(
    Object.fromEntries(
      PERICIAS_DND5E.map((p) => [p.chave, grauSchema.default('destreinado')]),
    ) as Record<string, z.ZodDefault<typeof grauSchema>>,
  )
  .strict()
  .default({});

function inteiro(rotulo: string, minimo: number, maximo: number) {
  return z
    .number({ invalid_type_error: `${rotulo}: informe um número.` })
    .int(`${rotulo}: informe um número inteiro.`)
    .min(minimo, `${rotulo}: o mínimo é ${minimo}.`)
    .max(maximo, `${rotulo}: o máximo é ${maximo}.`);
}

const CA_MINIMO = 1;
const CA_MAXIMO = 40;
const DESLOCAMENTO_MINIMO = 0;
const DESLOCAMENTO_MAXIMO = 200;

const schemaFichaDnd5e = z
  .object({
    ca: inteiro('Classe de armadura', CA_MINIMO, CA_MAXIMO).default(10),
    deslocamento: inteiro('Deslocamento', DESLOCAMENTO_MINIMO, DESLOCAMENTO_MAXIMO).default(9),
    inspiracao: z.boolean({ invalid_type_error: 'Inspiração: informe sim ou não.' }).default(false),
    [CHAVE_PERICIAS]: periciasSchema,
  })
  .strict();

/** Lê o mapa de graus de dentro de `dados` sem confiar no formato gravado. */
function mapaDePericias(dados: DadosFicha): Record<string, string> {
  const bruto = dados[CHAVE_PERICIAS];
  if (typeof bruto !== 'object' || bruto === null) return {};
  const saida: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(bruto as Record<string, unknown>)) {
    if (typeof valor === 'string') saida[chave] = valor;
  }
  return saida;
}

function acharPericia(chave: string): PericiaFicha | undefined {
  return PERICIAS_DND5E.find((p) => p.chave === chave);
}

function grauDePericia(ficha: FichaCalculavel, periciaChave: string): string | null {
  if (!acharPericia(periciaChave)) return null;
  const grau = mapaDePericias(ficha.dados)[periciaChave];
  return grau !== undefined && grau in MULTIPLICADOR_POR_GRAU ? grau : 'destreinado';
}

/**
 * Modificador do atributo + proficiência, quando houver.
 *
 * Exemplo do card: Destreza 16 (+3), nível 3 (proficiência +2) e Furtividade
 * proficiente → +5. Sem proficiência, só o +3 da Destreza.
 */
function bonusPericia(ficha: FichaCalculavel, periciaChave: string): number | null {
  const pericia = acharPericia(periciaChave);
  if (!pericia) return null;
  const grau = grauDePericia(ficha, periciaChave) ?? 'destreinado';
  const multiplicador = MULTIPLICADOR_POR_GRAU[grau] ?? 0;
  return (
    modificadorAtributo(ficha.atributos[pericia.atributo]) +
    multiplicador * bonusProficienciaDnd5e(ficha.nivel)
  );
}

function definirGrauDePericia(dados: DadosFicha, periciaChave: string, grau: string): DadosFicha {
  if (!acharPericia(periciaChave) || !(grau in MULTIPLICADOR_POR_GRAU)) return dados;
  return { ...dados, [CHAVE_PERICIAS]: { ...mapaDePericias(dados), [periciaChave]: grau } };
}

export const SISTEMA_DND5E: DefinicaoSistema = {
  chave: 'dnd5e',
  nome: 'D&D 5e',
  schemaFicha: schemaFichaDnd5e,
  secoes: [
    {
      chave: 'combate',
      titulo: 'Combate',
      campos: [
        {
          chave: 'ca',
          rotulo: 'Classe de armadura',
          tipo: 'numero',
          minimo: CA_MINIMO,
          maximo: CA_MAXIMO,
        },
        {
          chave: 'deslocamento',
          rotulo: 'Deslocamento (m)',
          tipo: 'numero',
          minimo: DESLOCAMENTO_MINIMO,
          maximo: DESLOCAMENTO_MAXIMO,
        },
        { chave: 'inspiracao', rotulo: 'Inspiração', tipo: 'booleano' },
      ],
    },
  ],
  pericias: PERICIAS_DND5E,
  // Nenhuma perícia de família aqui: as 18 são de chave fixa (RV-153).
  familiasPericia: [],
  grausPericia: GRAUS_PERICIA_DND5E,
  dadoDeTeste: '1d20',
  // Os atributos 1..30 e a fórmula `(valor - 10) / 2` são de D&D 5e: aqui a
  // metade comum da ficha vale integralmente. Nada a atribuir (RV-152).
  usaAtributosComuns: true,
  atribuicao: null,
  rolagensPadrao: [
    {
      chave: 'iniciativa',
      rotulo: 'Iniciativa',
      expressao: (ficha) => `1d20${formatarBonus(modificadorAtributo(ficha.atributos.destreza))}`,
    },
  ],
  bonusPericia,
  grauDePericia,
  definirGrauDePericia,
  // D&D 5e não modela ação de perícia com pré-requisito de treinamento (RV-153).
  acoesDePericia: () => [],
};
