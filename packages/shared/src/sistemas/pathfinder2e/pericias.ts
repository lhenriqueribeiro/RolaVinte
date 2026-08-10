import { z } from 'zod';
import type {
  AcaoDePericia,
  DadosFicha,
  FamiliaPericia,
  GrauPericia,
  PericiaFicha,
} from '../tipos';
import { GRAUS_TREINAMENTO, type GrauTreinamento } from './regras';

/**
 * Perícias de Pathfinder Segunda Edição (RV-153) — a **tabela**, e nada de
 * aritmética.
 *
 * **Atribuição.** O que está aqui é mecânica (nome de perícia, atributo-chave e
 * nome de ação), que é Open Game Content sob a OGL 1.0a e pode ser implementado
 * com atribuição — o texto que precisa viajar junto disto na tela vem de
 * `ATRIBUICAO_PF2E` (`atribuicao.ts`, RV-150), carregado por
 * `DefinicaoSistema.atribuicao`. **Nenhum texto descritivo de regra entra
 * aqui**: nomes e faixas, só. A fronteira está em `docs/licencas/pathfinder2e.md`.
 *
 * **A conta não mora aqui.** O bônus é `modificador do atributo + bônus de
 * proficiência`, e o bônus de proficiência é de `regras.ts` (RV-151), onde vive
 * a armadilha que este épico persegue: **destreinado é +0, sem somar o nível**.
 * Um destreinado de nível 20 com Destreza +4 tem Furtividade +4, não +24. Este
 * arquivo diz *quais* perícias existem e *de qual atributo* cada uma sai; quem
 * soma é `bonusDeChecagem` em `definicao.ts`, que chama `bonusProficiencia`.
 *
 * **Percepção não é perícia no PF2e.** Ela é uma defesa (RV-155) e é o que rola
 * iniciativa (RV-158). Não a acrescente a `PERICIAS_PF2E` — há teste exigindo a
 * ausência.
 *
 * ## Saber é uma família, não uma chave
 *
 * "Saber (Guerra)" treinado e "Saber (Náutico)" destreinado convivem na mesma
 * ficha. Isso não cabe como entrada fixa do mapa de treinamentos: a lista é do
 * personagem, não do sistema. Por isso o Saber é uma `FamiliaPericia`
 * (`FAMILIA_SABER`) e as instâncias moram em `dados.saberes`, como lista de
 * `{ especializacao, grau }`.
 *
 * A chave de uma instância é `saber:<especialização>` — a especialização vai
 * **dentro** da chave de propósito, para que o rótulo (`Saber (Guerra)`) seja
 * derivável da chave sozinha. É o que permite ao motivo da rolagem no chat ser
 * montado sem a ficha em mãos (`motivoDeRolagemDePericia`, em `calculo.ts`).
 */

// ─────────────────────────────────────────────────────────────────────
// Graus de treinamento (rótulo e schema)
// ─────────────────────────────────────────────────────────────────────

const ROTULO_GRAU: Record<GrauTreinamento, string> = {
  destreinado: 'Destreinado',
  treinado: 'Treinado',
  perito: 'Perito',
  // "master" é grau de treinamento; `Mestre` (dono da mesa) continua sendo outra
  // coisa. A convenção do épico é que este seja só um valor literal, nunca um
  // nome de tipo ou variável.
  mestre: 'Mestre',
  lendario: 'Lendário',
};

/** Os cinco graus com rótulo exibível, na ordem do menor para o maior. */
export const GRAUS_TREINAMENTO_PF2E: readonly GrauPericia[] = Object.freeze(
  GRAUS_TREINAMENTO.map((chave) => ({ chave, rotulo: ROTULO_GRAU[chave] })),
);

/**
 * Schema de um grau de treinamento, com mensagem em PT-BR.
 *
 * O `errorMap` não é preciosismo: sem ele o Zod devolve "Invalid enum value" em
 * inglês, e essa frase chega ao usuário no corpo do 400.
 */
export const grauTreinamentoSchema = z.enum(GRAUS_TREINAMENTO, {
  errorMap: () => ({
    message: `Grau de treinamento inválido. Use um de: ${GRAUS_TREINAMENTO.join(', ')}.`,
  }),
});

/** O piso da regra: sem treinamento declarado, o personagem é destreinado. */
export const GRAU_PADRAO: GrauTreinamento = 'destreinado';

/** Uma perícia do PF2e, com as ações que exigem treinamento. */
export interface PericiaPathfinder extends PericiaFicha {
  readonly acoesTreinadas: readonly string[];
}

// ─────────────────────────────────────────────────────────────────────
// A tabela
// ─────────────────────────────────────────────────────────────────────

/**
 * As dezesseis perícias de chave fixa, em ordem alfabética. Com o Saber
 * (`FAMILIA_SABER`) são as dezessete do sistema.
 *
 * `acoesTreinadas` lista ações que **exigem ao menos treinado**. A lista é o
 * subconjunto que a interface precisa hoje, não um catálogo: catálogo é o
 * RV-157, atrás da port, com `fonte` em cada item. O que importa aqui é que a
 * regra "esta ação exige treinamento" seja **dado da tabela**, e não um `if`
 * escondido num componente (F4/F6 da taxonomia).
 */
export const PERICIAS_PF2E: readonly PericiaPathfinder[] = Object.freeze([
  {
    chave: 'acrobacia',
    rotulo: 'Acrobacia',
    atributo: 'destreza',
    acoesTreinadas: ['Manobrar em Voo', 'Espremer-se'],
  },
  {
    chave: 'arcanismo',
    rotulo: 'Arcanismo',
    atributo: 'inteligencia',
    acoesTreinadas: ['Decifrar Escrita', 'Identificar Magia', 'Aprender uma Magia'],
  },
  {
    chave: 'atletismo',
    rotulo: 'Atletismo',
    atributo: 'forca',
    acoesTreinadas: ['Desarmar', 'Salto Alto', 'Salto em Distância'],
  },
  { chave: 'atuacao', rotulo: 'Atuação', atributo: 'carisma', acoesTreinadas: ['Ganhar Renda'] },
  { chave: 'diplomacia', rotulo: 'Diplomacia', atributo: 'carisma', acoesTreinadas: [] },
  { chave: 'enganacao', rotulo: 'Enganação', atributo: 'carisma', acoesTreinadas: ['Fintar'] },
  { chave: 'furtividade', rotulo: 'Furtividade', atributo: 'destreza', acoesTreinadas: [] },
  { chave: 'intimidacao', rotulo: 'Intimidação', atributo: 'carisma', acoesTreinadas: [] },
  {
    chave: 'ladinagem',
    rotulo: 'Ladinagem',
    atributo: 'destreza',
    acoesTreinadas: ['Desativar Dispositivo', 'Arrombar Fechadura'],
  },
  {
    chave: 'medicina',
    rotulo: 'Medicina',
    atributo: 'sabedoria',
    acoesTreinadas: ['Tratar Ferimentos', 'Tratar Doença', 'Tratar Veneno'],
  },
  {
    chave: 'natureza',
    rotulo: 'Natureza',
    atributo: 'sabedoria',
    acoesTreinadas: ['Identificar Magia', 'Aprender uma Magia'],
  },
  {
    chave: 'ocultismo',
    rotulo: 'Ocultismo',
    atributo: 'inteligencia',
    acoesTreinadas: ['Decifrar Escrita', 'Identificar Magia', 'Aprender uma Magia'],
  },
  {
    chave: 'oficio',
    rotulo: 'Ofício',
    atributo: 'inteligencia',
    acoesTreinadas: ['Criar', 'Ganhar Renda', 'Identificar Alquimia'],
  },
  {
    chave: 'religiao',
    rotulo: 'Religião',
    atributo: 'sabedoria',
    acoesTreinadas: ['Decifrar Escrita', 'Identificar Magia', 'Aprender uma Magia'],
  },
  {
    chave: 'sobrevivencia',
    rotulo: 'Sobrevivência',
    atributo: 'sabedoria',
    acoesTreinadas: ['Rastrear', 'Cobrir Rastros'],
  },
  {
    chave: 'sociedade',
    rotulo: 'Sociedade',
    atributo: 'inteligencia',
    acoesTreinadas: ['Decifrar Escrita', 'Criar Falsificação'],
  },
] as const satisfies readonly PericiaPathfinder[]);

/** Busca na tabela de chave fixa. `undefined` para chave de família. */
export function periciaFixa(chave: string): PericiaPathfinder | undefined {
  return PERICIAS_PF2E.find((p) => p.chave === chave);
}

// ─────────────────────────────────────────────────────────────────────
// Saber — a família
// ─────────────────────────────────────────────────────────────────────

/** Onde as especializações de Saber moram dentro de `dados`. */
export const CHAVE_SABERES = 'saberes';

/** Prefixo da chave de uma instância: `saber:Guerra`. */
export const PREFIXO_SABER = 'saber:';

/** O atributo-chave do Saber, como o das demais perícias de conhecimento. */
const ATRIBUTO_SABER = 'inteligencia';

/**
 * Teto de especializações por ficha.
 *
 * Existe para que a lista não vire uma caixa sem fundo dentro de um `jsonb` que
 * a interface renderiza inteiro. Doze é folgado para uma mesa e pequeno o
 * bastante para caber na tela; mudar o número é decisão consciente e o motivo
 * vai no diff.
 */
export const LIMITE_SABERES = 12;

/** Teto de caracteres de uma especialização — nome curto, não descrição. */
export const TAMANHO_MAXIMO_ESPECIALIZACAO = 40;

/** Ações de Saber que exigem treinamento. */
const ACOES_SABER: readonly string[] = Object.freeze(['Ganhar Renda']);

const saberSchema = z
  .object({
    especializacao: z
      .string({ invalid_type_error: 'Saber: informe a especialização como texto.' })
      .trim()
      .min(1, 'Saber: informe a especialização (por exemplo, Guerra).')
      .max(
        TAMANHO_MAXIMO_ESPECIALIZACAO,
        `Saber: o máximo da especialização é ${TAMANHO_MAXIMO_ESPECIALIZACAO} caracteres.`,
      ),
    grau: grauTreinamentoSchema.default(GRAU_PADRAO),
  })
  .strict();

/** Uma especialização de Saber já validada. */
export type SaberDaFicha = z.infer<typeof saberSchema>;

function normalizar(especializacao: string): string {
  return especializacao.trim().toLocaleLowerCase('pt-BR');
}

/**
 * A lista de Saberes da ficha.
 *
 * Duas especializações iguais são recusadas: elas dariam duas linhas com o
 * mesmo rótulo, a mesma chave e graus diferentes — e a segunda venceria a
 * primeira na leitura, sem aviso.
 */
export const saberesSchema = z
  .array(saberSchema)
  .max(LIMITE_SABERES, `Saber: o máximo é ${LIMITE_SABERES} especializações por ficha.`)
  .superRefine((lista, ctx) => {
    const vistas = new Set<string>();
    for (const [indice, saber] of lista.entries()) {
      const chave = normalizar(saber.especializacao);
      if (vistas.has(chave)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [indice, 'especializacao'],
          message: `Saber: a especialização "${saber.especializacao}" está repetida.`,
        });
      }
      vistas.add(chave);
    }
  })
  .default([]);

/** Lê a lista gravada sem confiar no formato — a ficha pode ser antiga. */
export function saberesDe(dados: DadosFicha): readonly SaberDaFicha[] {
  const bruto = dados[CHAVE_SABERES];
  if (!Array.isArray(bruto)) return [];
  return bruto.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const { especializacao, grau } = item as { especializacao?: unknown; grau?: unknown };
    if (typeof especializacao !== 'string' || especializacao.trim() === '') return [];
    const conhecido = GRAUS_TREINAMENTO.find((g) => g === grau);
    return [{ especializacao: especializacao.trim(), grau: conhecido ?? GRAU_PADRAO }];
  });
}

/** A chave de uma instância a partir da especialização: `saber:Guerra`. */
export function chaveDeSaber(especializacao: string): string {
  return `${PREFIXO_SABER}${especializacao.trim()}`;
}

/** A especialização de volta, a partir da chave. `null` se a chave não é de Saber. */
export function especializacaoDaChave(periciaChave: string): string | null {
  if (!periciaChave.startsWith(PREFIXO_SABER)) return null;
  const especializacao = periciaChave.slice(PREFIXO_SABER.length).trim();
  return especializacao === '' ? null : especializacao;
}

/** `Saber (Guerra)`. `null` quando a chave não é de uma instância de Saber. */
export function rotuloDeSaber(periciaChave: string): string | null {
  const especializacao = especializacaoDaChave(periciaChave);
  return especializacao === null ? null : `Saber (${especializacao})`;
}

function periciaDeSaber(saber: SaberDaFicha): PericiaPathfinder {
  return {
    chave: chaveDeSaber(saber.especializacao),
    rotulo: `Saber (${saber.especializacao})`,
    atributo: ATRIBUTO_SABER,
    acoesTreinadas: ACOES_SABER,
  };
}

/** As perícias de Saber desta ficha, na ordem gravada. */
export function periciasDeSaber(dados: DadosFicha): readonly PericiaPathfinder[] {
  return saberesDe(dados).map(periciaDeSaber);
}

/** O grau gravado daquela instância; `null` se a ficha não tem essa especialização. */
export function grauDeSaber(dados: DadosFicha, periciaChave: string): GrauTreinamento | null {
  const especializacao = especializacaoDaChave(periciaChave);
  if (especializacao === null) return null;
  const alvo = normalizar(especializacao);
  return saberesDe(dados).find((s) => normalizar(s.especializacao) === alvo)?.grau ?? null;
}

/** A perícia daquela instância, se a ficha a tiver. */
export function periciaDeSaberDaFicha(
  dados: DadosFicha,
  periciaChave: string,
): PericiaPathfinder | undefined {
  return periciasDeSaber(dados).find((p) => p.chave === periciaChave);
}

function comSaberes(dados: DadosFicha, saberes: readonly SaberDaFicha[]): DadosFicha {
  return { ...dados, [CHAVE_SABERES]: saberes.map((s) => ({ ...s })) };
}

/**
 * Acrescenta uma especialização. Vazia, repetida ou acima do teto devolve
 * `dados` inalterado — a interface impede as três antes de chegar aqui, e o
 * `schemaFicha` recusa em PT-BR quem tentar pela API.
 */
export function acrescentarSaber(dados: DadosFicha, especializacao: string): DadosFicha {
  const limpa = especializacao.trim();
  if (limpa === '' || limpa.length > TAMANHO_MAXIMO_ESPECIALIZACAO) return dados;
  const atuais = saberesDe(dados);
  if (atuais.length >= LIMITE_SABERES) return dados;
  if (atuais.some((s) => normalizar(s.especializacao) === normalizar(limpa))) return dados;
  return comSaberes(dados, [...atuais, { especializacao: limpa, grau: GRAU_PADRAO }]);
}

/** Remove aquela instância. Chave desconhecida devolve `dados` inalterado. */
export function removerSaber(dados: DadosFicha, periciaChave: string): DadosFicha {
  const especializacao = especializacaoDaChave(periciaChave);
  if (especializacao === null) return dados;
  const atuais = saberesDe(dados);
  const alvo = normalizar(especializacao);
  const restantes = atuais.filter((s) => normalizar(s.especializacao) !== alvo);
  return restantes.length === atuais.length ? dados : comSaberes(dados, restantes);
}

/** Troca o grau de uma instância. Chave ou grau desconhecidos não mudam nada. */
export function definirGrauDeSaber(
  dados: DadosFicha,
  periciaChave: string,
  grau: string,
): DadosFicha {
  const especializacao = especializacaoDaChave(periciaChave);
  if (especializacao === null) return dados;
  const conhecido = GRAUS_TREINAMENTO.find((g) => g === grau);
  if (!conhecido) return dados;
  const alvo = normalizar(especializacao);
  const atuais = saberesDe(dados);
  if (!atuais.some((s) => normalizar(s.especializacao) === alvo)) return dados;
  return comSaberes(
    dados,
    atuais.map((s) => (normalizar(s.especializacao) === alvo ? { ...s, grau: conhecido } : s)),
  );
}

/** A família Saber, como o registro de sistemas a enxerga. */
export const FAMILIA_SABER: FamiliaPericia = {
  chave: 'saber',
  rotulo: 'Saber',
  rotuloEspecializacao: 'Especialização de Saber',
  ajuda: 'Cada especialização é uma perícia própria, com o seu grau.',
  instancias: (ficha) => periciasDeSaber(ficha.dados),
  rotuloDeInstancia: rotuloDeSaber,
  acrescentar: acrescentarSaber,
  remover: removerSaber,
};

// ─────────────────────────────────────────────────────────────────────
// Ações que exigem treinamento
// ─────────────────────────────────────────────────────────────────────

/**
 * As ações de uma perícia, resolvidas contra o grau daquela ficha.
 *
 * Indisponível **com o motivo escrito**, e não oculta: quem é destreinado
 * precisa saber que a ação existe e o que falta para usá-la.
 */
export function acoesDaPericia(
  pericia: PericiaPathfinder,
  grau: GrauTreinamento,
): readonly AcaoDePericia[] {
  const treinado = grau !== GRAU_PADRAO;
  return pericia.acoesTreinadas.map((nome) => ({
    nome,
    disponivel: treinado,
    motivo: treinado ? null : `Exige ao menos treinado em ${pericia.rotulo}.`,
  }));
}
