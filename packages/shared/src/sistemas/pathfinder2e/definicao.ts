import { z } from 'zod';
import { ATRIBUTOS, type NomeAtributo } from '../../schemas/personagens';
import type {
  AcaoDePericia,
  CampoFicha,
  DadosFicha,
  DefinicaoSistema,
  FichaCalculavel,
} from '../tipos';
import { ATRIBUICAO_PF2E } from './atribuicao';
import {
  acoesDaPericia,
  CHAVE_SABERES,
  definirGrauDeSaber,
  FAMILIA_SABER,
  GRAU_PADRAO,
  GRAUS_TREINAMENTO_PF2E,
  grauDeSaber,
  PERICIAS_PF2E,
  periciaDeSaberDaFicha,
  periciaFixa,
  saberesSchema,
  grauTreinamentoSchema,
  type PericiaPathfinder,
} from './pericias';
import { bonusProficiencia, GRAUS_TREINAMENTO, type GrauTreinamento } from './regras';

/**
 * Ficha de Pathfinder Segunda Edição (RV-152) — uma entrada nova no registro de
 * sistemas (RV-091) e **nada além disso**.
 *
 * **Atribuição.** O que está aqui é *mecânica* (nomes de mecânica, faixas
 * numéricas e aritmética), que é Open Game Content e pode ser implementado com
 * atribuição. O texto que precisa aparecer junto do conteúdo na tela vive em
 * `ATRIBUICAO_PF2E` (`atribuicao.ts`, RV-150) e viaja por `DefinicaoSistema.
 * atribuicao` — é assim que a interface monta o aviso **sem** perguntar qual é o
 * sistema. A fronteira do que pode entrar no repositório está em
 * `docs/licencas/pathfinder2e.md`.
 *
 * **Nenhum conteúdo entra neste arquivo.** Ancestralidade, herança e antecedente
 * são campos de **texto livre**, e não listas: enumerar "Anão, Elfo, Goblin…"
 * seria distribuir conteúdo da Paizo, que é justamente o que a fronteira de
 * licenciamento proíbe. A lista curada chega atrás da port de catálogo (RV-157),
 * com `fonte` em cada item.
 *
 * **A aritmética não mora aqui.** Proficiência, graus de sucesso e CDs são do
 * RV-151 (`regras.ts`). Este arquivo diz **onde os números moram na ficha** e
 * chama aquelas funções. Duas somas para a mesma regra viram duas respostas.
 *
 * ## Armadilha nº 1: modificador direto, não valor de atributo
 *
 * No PF2e o personagem tem o **modificador** (+0, +4, −1), e não o valor 3–18 do
 * d20 clássico. As colunas comuns `personagens.atributos` guardam 1..30 e são
 * lidas por `modificadorAtributo()` — a fórmula `(valor − 10) / 2`, que **não
 * existe** neste sistema. Por isso:
 *
 * - os seis modificadores moram em `dados` (`modificadorForca`, …), na faixa
 *   −5..+8, e são a **única** fonte de bônus de atributo da ficha de PF2e;
 * - `atributosSchema` (1..30) fica **inalterado**: ele é de todos os sistemas e
 *   do `PersonagemDTO`, e mexer nele para caber o PF2e quebraria os outros;
 * - a definição declara `usaAtributosComuns: false`, e é isso que impede a
 *   interface de oferecer o teste genérico de atributo — que rolaria `+0`
 *   eternamente numa ficha de PF2e, uma promessa falsa (F6 da taxonomia).
 *
 * ## O que ainda não está aqui, e por quê
 *
 * - **Perícias** chegaram no RV-153: a tabela mora em `pericias.ts` e este
 *   arquivo só a pluga no registro. Saber é família (`dados.saberes`), não
 *   chave de `treinamentos`.
 * - **Defesas** (CA, salvaguardas, Percepção, CD de classe) são o RV-155.
 * - **Iniciativa** rola por Percepção no PF2e, então `rolagensPadrao` nasce
 *   vazio: é o RV-158. Declarar a iniciativa por Destreza da ficha genérica
 *   seria justamente a regra errada com cara de regra certa.
 * - **Classe e nível** não se duplicam em `dados`: são colunas comuns da tabela
 *   `personagens` (`classe` texto, `nivel` 1..20 por `criarPersonagemSchema`), já
 *   exibidas e validadas. Repeti-las aqui daria dois campos "Nível" na mesma
 *   tela e duas respostas para "qual é o nível?" na hora de somar a proficiência.
 */

// ─────────────────────────────────────────────────────────────────────
// Identidade
// ─────────────────────────────────────────────────────────────────────

/** Teto de caracteres dos campos de identidade — nome próprio, não descrição. */
const TAMANHO_MAXIMO_TEXTO = 60;

function texto(rotulo: string) {
  return z
    .string({ invalid_type_error: `${rotulo}: informe um texto.` })
    .trim()
    .max(TAMANHO_MAXIMO_TEXTO, `${rotulo}: o máximo é ${TAMANHO_MAXIMO_TEXTO} caracteres.`)
    .default('');
}

const CAMPOS_IDENTIDADE: readonly CampoFicha[] = Object.freeze([
  {
    chave: 'ancestralidade',
    rotulo: 'Ancestralidade',
    tipo: 'texto',
    ajuda: 'Texto livre — a lista curada chega com o catálogo.',
  },
  { chave: 'heranca', rotulo: 'Herança', tipo: 'texto' },
  { chave: 'antecedente', rotulo: 'Antecedente', tipo: 'texto' },
] as const satisfies readonly CampoFicha[]);

// ─────────────────────────────────────────────────────────────────────
// Modificadores de atributo
// ─────────────────────────────────────────────────────────────────────

/** Menor modificador aceito na ficha. */
export const MODIFICADOR_MINIMO = -5;
/** Maior modificador aceito na ficha. */
export const MODIFICADOR_MAXIMO = 8;

const ROTULO_ATRIBUTO: Record<NomeAtributo, string> = {
  forca: 'Força',
  destreza: 'Destreza',
  constituicao: 'Constituição',
  inteligencia: 'Inteligência',
  sabedoria: 'Sabedoria',
  carisma: 'Carisma',
};

/**
 * Onde o modificador de um atributo mora dentro de `dados`: `modificadorForca`.
 *
 * O nome é derivado, e não seis literais, para que os campos da seção, o schema
 * e a leitura do bônus usem sempre a mesma chave. As seis chaves resultantes
 * estão escritas à mão no teste: renomeá-las é migração de dados gravados, e a
 * suíte precisa dizer isso em voz alta.
 */
export function chaveDoModificador(atributo: NomeAtributo): string {
  return `modificador${atributo.charAt(0).toUpperCase()}${atributo.slice(1)}`;
}

function campoDeModificador(atributo: NomeAtributo): CampoFicha {
  return {
    chave: chaveDoModificador(atributo),
    rotulo: ROTULO_ATRIBUTO[atributo],
    tipo: 'numero',
    minimo: MODIFICADOR_MINIMO,
    maximo: MODIFICADOR_MAXIMO,
  };
}

function schemaDeModificador(atributo: NomeAtributo) {
  const rotulo = `Modificador de ${ROTULO_ATRIBUTO[atributo]}`;
  return z
    .number({ invalid_type_error: `${rotulo}: informe um número.` })
    .int(`${rotulo}: informe um número inteiro.`)
    .min(MODIFICADOR_MINIMO, `${rotulo}: o mínimo é ${MODIFICADOR_MINIMO}.`)
    .max(MODIFICADOR_MAXIMO, `${rotulo}: o máximo é ${MODIFICADOR_MAXIMO}.`)
    .default(0);
}

const CAMPOS_MODIFICADORES: readonly CampoFicha[] = Object.freeze(
  ATRIBUTOS.map(campoDeModificador),
);

// ─────────────────────────────────────────────────────────────────────
// Graus de treinamento
// ─────────────────────────────────────────────────────────────────────

/**
 * O que pode ter grau de treinamento de chave **fixa** nesta ficha.
 *
 * São as 16 perícias de `pericias.ts` (RV-153). O Saber não está aqui: ele é
 * uma família, e as suas instâncias vêm da própria ficha (`dados.saberes`) —
 * ver `FAMILIA_SABER`. As defesas (CA, salvaguardas, Percepção, CD de classe)
 * chegam no RV-155 e entram por acréscimo, sem lógica nova.
 */
const TREINAVEIS: readonly PericiaPathfinder[] = PERICIAS_PF2E;

/** Onde os graus de treinamento moram dentro de `dados`. */
const CHAVE_TREINAMENTOS = 'treinamentos';

/**
 * A perícia daquela chave **nesta ficha**: da tabela fixa ou uma instância de
 * Saber que a ficha tenha. `undefined` para chave que não é perícia aqui —
 * `percepcao`, por exemplo, que no PF2e é defesa e não perícia.
 */
function acharPericia(ficha: FichaCalculavel, chave: string): PericiaPathfinder | undefined {
  return periciaFixa(chave) ?? periciaDeSaberDaFicha(ficha.dados, chave);
}

/**
 * Mapa de graus dentro de `dados`, sem confiar no que está gravado — a ficha
 * pode ter sido escrita por uma versão anterior da tabela.
 */
function mapaDeTreinamentos(dados: DadosFicha): Record<string, string> {
  const bruto = dados[CHAVE_TREINAMENTOS];
  if (typeof bruto !== 'object' || bruto === null) return {};
  const saida: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(bruto as Record<string, unknown>)) {
    if (typeof valor === 'string') saida[chave] = valor;
  }
  return saida;
}

const treinamentosSchema = z
  .object(
    Object.fromEntries(
      TREINAVEIS.map((t) => [t.chave, grauTreinamentoSchema.default('destreinado')]),
    ) as Record<string, z.ZodDefault<typeof grauTreinamentoSchema>>,
  )
  .strict()
  .default({});

// ─────────────────────────────────────────────────────────────────────
// Schema da ficha
// ─────────────────────────────────────────────────────────────────────

const schemaFichaPathfinder2e = z
  .object({
    ancestralidade: texto('Ancestralidade'),
    heranca: texto('Herança'),
    antecedente: texto('Antecedente'),
    ...(Object.fromEntries(
      ATRIBUTOS.map((atributo) => [chaveDoModificador(atributo), schemaDeModificador(atributo)]),
    ) as Record<string, ReturnType<typeof schemaDeModificador>>),
    [CHAVE_TREINAMENTOS]: treinamentosSchema,
    // As especializações de Saber são lista, e não chaves de `treinamentos`: a
    // família é do personagem, não do sistema (RV-153).
    [CHAVE_SABERES]: saberesSchema,
  })
  .strict();

// ─────────────────────────────────────────────────────────────────────
// Leitura da ficha
// ─────────────────────────────────────────────────────────────────────

/**
 * O modificador de um atributo **desta** ficha.
 *
 * Repare no que a função não faz: ela não olha `ficha.atributos` e não chama
 * `modificadorAtributo()`. No PF2e o número gravado já é o modificador; derivá-lo
 * do valor 1..30 daria +0 para todo personagem que nunca tocou nas colunas
 * comuns, e +0 é um número que parece certo.
 */
export function modificadorDeAtributo(ficha: FichaCalculavel, atributo: NomeAtributo): number {
  const valor = ficha.dados[chaveDoModificador(atributo)];
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : 0;
}

/**
 * Grau de treinamento gravado. `null` quando a chave não é treinável nesta
 * ficha — a ausência é resposta legítima, não erro. Chave conhecida com valor
 * estranho vale como `destreinado`, que é o piso da regra.
 *
 * Instância de Saber responde pela lista `dados.saberes`; perícia de chave fixa,
 * pelo mapa `dados.treinamentos`.
 */
export function grauDeTreinamento(ficha: FichaCalculavel, chave: string): GrauTreinamento | null {
  const doSaber = grauDeSaber(ficha.dados, chave);
  if (doSaber !== null) return doSaber;
  if (!periciaFixa(chave)) return null;
  const gravado = mapaDeTreinamentos(ficha.dados)[chave];
  const conhecido = GRAUS_TREINAMENTO.find((grau) => grau === gravado);
  return conhecido ?? GRAU_PADRAO;
}

/**
 * O bônus de uma checagem de d20 no PF2e: modificador do atributo + bônus de
 * proficiência (que já inclui o nível, exceto destreinado).
 *
 * É o ponto de encontro entre a ficha (RV-152) e o motor de regras (RV-151), e
 * é o que perícias (RV-153), defesas (RV-155) e ataques (RV-156) vão chamar. A
 * conta em si é de `bonusProficiencia` — aqui só se busca o modificador certo.
 */
export function bonusDeChecagem(
  ficha: FichaCalculavel,
  atributo: NomeAtributo,
  grau: GrauTreinamento,
): number {
  return modificadorDeAtributo(ficha, atributo) + bonusProficiencia(ficha.nivel, grau);
}

/**
 * O bônus da perícia: o cenário do card é nível 5, treinado em Furtividade e
 * Destreza +4 → **+11**; destreinado em Arcanismo com Inteligência +1 → **+1**,
 * porque destreinado não soma o nível.
 */
function bonusPericia(ficha: FichaCalculavel, periciaChave: string): number | null {
  const pericia = acharPericia(ficha, periciaChave);
  if (!pericia) return null;
  return bonusDeChecagem(
    ficha,
    pericia.atributo,
    grauDeTreinamento(ficha, periciaChave) ?? GRAU_PADRAO,
  );
}

function definirGrauDePericia(dados: DadosFicha, periciaChave: string, grau: string): DadosFicha {
  if (!periciaFixa(periciaChave)) return definirGrauDeSaber(dados, periciaChave, grau);
  if (!GRAUS_TREINAMENTO.some((conhecido) => conhecido === grau)) return dados;
  return {
    ...dados,
    [CHAVE_TREINAMENTOS]: { ...mapaDeTreinamentos(dados), [periciaChave]: grau },
  };
}

function acoesDePericia(ficha: FichaCalculavel, periciaChave: string): readonly AcaoDePericia[] {
  const pericia = acharPericia(ficha, periciaChave);
  if (!pericia) return [];
  return acoesDaPericia(pericia, grauDeTreinamento(ficha, periciaChave) ?? GRAU_PADRAO);
}

// ─────────────────────────────────────────────────────────────────────
// A definição
// ─────────────────────────────────────────────────────────────────────

export const SISTEMA_PATHFINDER2E: DefinicaoSistema = {
  chave: 'pathfinder2e',
  nome: 'Pathfinder 2e',
  schemaFicha: schemaFichaPathfinder2e,
  secoes: [
    { chave: 'identidade', titulo: 'Identidade', campos: CAMPOS_IDENTIDADE },
    {
      chave: 'atributos',
      titulo: `Atributos (modificador direto, de ${MODIFICADOR_MINIMO} a +${MODIFICADOR_MAXIMO})`,
      campos: CAMPOS_MODIFICADORES,
    },
  ],
  pericias: TREINAVEIS,
  // Saber é família: as instâncias saem de `dados.saberes`, não desta lista.
  familiasPericia: [FAMILIA_SABER],
  grausPericia: GRAUS_TREINAMENTO_PF2E,
  dadoDeTeste: '1d20',
  // Vazio até o RV-158: a iniciativa do PF2e rola por Percepção, que só existe
  // com as defesas (RV-155). Nenhuma rolagem deste sistema pode sair de
  // `ficha.atributos` — há teste exigindo isso.
  rolagensPadrao: [],
  usaAtributosComuns: false,
  atribuicao: ATRIBUICAO_PF2E,
  bonusPericia,
  grauDePericia: grauDeTreinamento,
  definirGrauDePericia,
  acoesDePericia,
};
