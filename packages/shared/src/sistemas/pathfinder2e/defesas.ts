import { z } from 'zod';
import { ATRIBUTOS, ROTULOS_ATRIBUTO, type NomeAtributo } from '../../schemas/personagens';
import { formatarBonus } from '../generico';
import type { CampoFicha, DadosFicha, DefesaFicha, FichaCalculavel, OpcaoCampo } from '../tipos';
import { GRAUS_TREINAMENTO_PF2E, GRAU_PADRAO, grauTreinamentoSchema } from './pericias';
import { bonusProficiencia, GRAUS_TREINAMENTO, type GrauTreinamento } from './regras';

/**
 * Defesas de Pathfinder Segunda Edição (RV-155): CA, as três salvaguardas,
 * Percepção e CD de classe.
 *
 * **Atribuição.** O que está aqui é *mecânica* (fórmulas e faixas numéricas),
 * Open Game Content sob a OGL 1.0a, implementável com atribuição — o texto que
 * acompanha a exibição vem de `ATRIBUICAO_PF2E` (RV-150), carregado por
 * `DefinicaoSistema.atribuicao`. Nenhum conteúdo entra neste arquivo: catálogo de
 * armaduras, classes e ancestralidades é o RV-157, atrás de port.
 *
 * ## As quatro defesas são a mesma proficiência das perícias
 *
 * CA, salvaguardas, Percepção e CD de classe usam **exatamente** a fórmula de
 * proficiência das perícias — nível + 2/4/6/8, e **+0 quando destreinado**. Por
 * isso não existe nenhum `+ nivel` escrito aqui: a conta é de
 * `bonusProficiencia` (`regras.ts`, RV-151). Uma segunda soma para a mesma regra
 * daria duas respostas, e a errata seria aplicada em uma só.
 *
 * ## O que a CA tem e uma perícia não tem
 *
 * Dois componentes, e o segundo é a armadilha nº 1 do card — **F9, limite
 * validado isoladamente**: a Destreza entra na CA **limitada pelo limite de
 * Destreza da armadura**. Destreza +4 com meia-armadura (limite +1) contribui
 * **+1**, não +4. Errar isso infla a CA de todo personagem de armadura pesada, e
 * o número continua parecendo um número. Por isso `destrezaNaCa` é função
 * própria, coberta por tabela cruzada (Destreza +0..+5 × limite +0..+5).
 *
 * Limite **não informado** é caso legítimo, e não zero: sem armadura não há teto,
 * e a Destreza entra inteira. `null` é a ausência; `0` é um teto de verdade (é o
 * da armadura completa). Confundir os dois tiraria a Destreza de quem não veste
 * armadura.
 *
 * ## CD de classe não é CD simples
 *
 * `CDS_SIMPLES` (10 · 15 · 20 · 30 · 40, em `regras.ts`) é outra coisa: são as
 * CDs que o mestre usa quando a tarefa não tem nível. A **CD de classe** deriva
 * da ficha — 10 + proficiência + modificador do atributo-chave da classe — e é o
 * número que o alvo de uma habilidade de classe tenta superar. As duas têm teste
 * separado de propósito, porque trocá-las dá um número plausível e errado.
 *
 * ## Percepção
 *
 * Percepção **não é perícia** no PF2e (por isso não está em `pericias.ts`) e é
 * ela que rola iniciativa. O RV-158 consome esta conta pela chave
 * `CHAVE_PERCEPCAO` na lista de `defesas(ficha)` — com `valor`, `expressao` e
 * `motivo` já prontos por `defesasDoPersonagem` (`calculo.ts`) — em vez de
 * reimplementar a soma no caso de uso do combate.
 *
 * ## PV: o valor continua tendo uma casa só
 *
 * `pvSugerido` é **derivado** e nunca gravado. Os pontos de vida do personagem
 * são as colunas comuns `pvAtual`/`pvMax` (`PersonagemDTO`), que alimentam a
 * barra sobre o token (RV-042) — a ficha não ganha um segundo campo de PV, que
 * seria o defeito de duas verdades que o RV-098 fechou para o atributo. O que
 * esta ficha guarda são as **entradas da regra**: quantos PV a ancestralidade dá
 * uma vez e quantos a classe dá por nível. São constantes da ancestralidade e da
 * classe, informadas à mão até o catálogo (RV-157), e não os PV de ninguém.
 */

// ─────────────────────────────────────────────────────────────────────
// A base 10
// ─────────────────────────────────────────────────────────────────────

/**
 * O 10 do qual partem a CA e toda CD derivada de um bônus no PF2e ("a sua CD é
 * 10 + o seu modificador total").
 *
 * Mora aqui, e não em `regras.ts`, porque este arquivo **é** o dono das regras de
 * defesa — `regras.ts` guarda o que atravessa o sistema (proficiência, graus de
 * sucesso, empilhamento). O número está escrito **uma vez**: CA e CD de classe o
 * leem daqui, e nenhum `10` de regra fica solto no repositório.
 */
export const BASE_DEFESA = 10;

// ─────────────────────────────────────────────────────────────────────
// A tabela de defesas
// ─────────────────────────────────────────────────────────────────────

/** Chave da CA dentro da lista de defesas. */
export const CHAVE_CA = 'ca';
/** Chave da Percepção — é por ela que o RV-158 acha a iniciativa. */
export const CHAVE_PERCEPCAO = 'percepcao';
/** Chave da CD de classe. */
export const CHAVE_CD_CLASSE = 'cdClasse';
/**
 * Chave da sugestão de PV máximo.
 *
 * Ela aparece na lista de defesas porque no PF2e os pontos de vida **são** um
 * capítulo de defesa, ao lado de CA e salvaguardas — e porque é assim que a
 * sugestão chega à tela sem que a ficha genérica precise perguntar qual é o
 * sistema. Não é campo, não é gravada, e o próprio texto dela diz que o valor que
 * vale é o `pvMax` editável.
 */
export const CHAVE_PV_SUGERIDO = 'pvSugerido';

/** Uma defesa do sistema, do ponto de vista da tabela. */
export interface DefesaPathfinder {
  readonly chave: string;
  readonly rotulo: string;
  /** Rótulo do campo editável de grau, em PT-BR. */
  readonly rotuloGrau: string;
  /**
   * Atributo do qual a defesa deriva. `null` na CD de classe, cujo atributo-chave
   * é escolhido pela **classe do personagem** e por isso vem da ficha.
   */
  readonly atributo: NomeAtributo | null;
  /** `true` nas checagens de d20 (salvaguardas e Percepção). */
  readonly rolavel: boolean;
}

const DEFESA_CA: DefesaPathfinder = Object.freeze({
  chave: CHAVE_CA,
  rotulo: 'CA',
  // O grau é o da **categoria de armadura** que o personagem veste (leve, média,
  // pesada, sem armadura), e não um "grau em CA": é assim que a regra fala.
  rotuloGrau: 'Grau em armadura',
  atributo: 'destreza',
  rolavel: false,
});

/**
 * As três salvaguardas e o atributo de cada uma. Fortitude sai de Constituição,
 * Reflexos de Destreza, Vontade de Sabedoria.
 */
export const SALVAGUARDAS_PF2E: readonly DefesaPathfinder[] = Object.freeze([
  {
    chave: 'fortitude',
    rotulo: 'Fortitude',
    rotuloGrau: 'Grau em Fortitude',
    atributo: 'constituicao',
    rolavel: true,
  },
  {
    chave: 'reflexos',
    rotulo: 'Reflexos',
    rotuloGrau: 'Grau em Reflexos',
    atributo: 'destreza',
    rolavel: true,
  },
  {
    chave: 'vontade',
    rotulo: 'Vontade',
    rotuloGrau: 'Grau em Vontade',
    atributo: 'sabedoria',
    rolavel: true,
  },
] as const satisfies readonly DefesaPathfinder[]);

const DEFESA_PERCEPCAO: DefesaPathfinder = Object.freeze({
  chave: CHAVE_PERCEPCAO,
  rotulo: 'Percepção',
  rotuloGrau: 'Grau em Percepção',
  atributo: 'sabedoria',
  rolavel: true,
});

const DEFESA_CD_CLASSE: DefesaPathfinder = Object.freeze({
  chave: CHAVE_CD_CLASSE,
  rotulo: 'CD de classe',
  rotuloGrau: 'Grau na CD de classe',
  atributo: null,
  rolavel: false,
});

/**
 * As seis defesas, na ordem em que a ficha as mostra: CA primeiro (é a pergunta
 * do combate), as três salvaguardas, Percepção e a CD de classe.
 */
export const DEFESAS_PF2E: readonly DefesaPathfinder[] = Object.freeze([
  DEFESA_CA,
  ...SALVAGUARDAS_PF2E,
  DEFESA_PERCEPCAO,
  DEFESA_CD_CLASSE,
]);

/**
 * Onde o grau daquela defesa mora dentro de `dados`: `grauArmadura`,
 * `grauFortitude`, … `grauCdClasse`.
 *
 * Derivado da chave em vez de escrito seis vezes — uma chave com erro de digitação
 * viraria um grau que a ficha nunca lê, e o personagem apareceria destreinado sem
 * que ninguém entendesse por quê.
 */
export function chaveDoGrauDaDefesa(chave: string): string {
  const nome = chave === CHAVE_CA ? 'armadura' : chave;
  return `grau${nome.charAt(0).toUpperCase()}${nome.slice(1)}`;
}

// ─────────────────────────────────────────────────────────────────────
// Os campos manuais e as suas faixas
// ─────────────────────────────────────────────────────────────────────

/** Onde o bônus de item da armadura mora dentro de `dados`. */
export const CHAVE_BONUS_ITEM_ARMADURA = 'bonusItemArmadura';
/** Onde o limite de Destreza da armadura mora dentro de `dados`. */
export const CHAVE_LIMITE_DESTREZA = 'limiteDestrezaArmadura';
/** Onde o atributo-chave da classe mora dentro de `dados`. */
export const CHAVE_ATRIBUTO_DA_CLASSE = 'atributoChaveClasse';
/** Onde o PV que a ancestralidade concede uma vez mora dentro de `dados`. */
export const CHAVE_PV_ANCESTRALIDADE = 'pvDaAncestralidade';
/** Onde o PV que a classe concede por nível mora dentro de `dados`. */
export const CHAVE_PV_CLASSE = 'pvDaClassePorNivel';

/** Menor bônus de item de armadura: quem não veste armadura tem +0. */
export const BONUS_ITEM_MINIMO = 0;
/** Maior: a armadura completa dá +6, e as runas de potência somam até +3. */
export const BONUS_ITEM_MAXIMO = 9;

/** Menor limite de Destreza: a armadura completa anula a Destreza. */
export const LIMITE_DESTREZA_MINIMO = 0;
/** Maior: as roupas de explorador têm o teto mais folgado da tabela. */
export const LIMITE_DESTREZA_MAXIMO = 5;

/** Menor PV por fonte. Zero é resposta legítima: "ainda não informei". */
export const PV_POR_FONTE_MINIMO = 0;
/** Maior PV que uma ancestralidade ou uma classe concede de uma vez. */
export const PV_POR_FONTE_MAXIMO = 12;

/** O valor de "atributo-chave da classe não informado". */
export const SEM_ATRIBUTO_CHAVE = '';

function inteiro(rotulo: string, minimo: number, maximo: number) {
  return z
    .number({ invalid_type_error: `${rotulo}: informe um número.` })
    .int(`${rotulo}: informe um número inteiro.`)
    .min(minimo, `${rotulo}: o mínimo é ${minimo}.`)
    .max(maximo, `${rotulo}: o máximo é ${maximo}.`);
}

/**
 * Limite de Destreza: número na faixa **ou** ausente.
 *
 * O `preprocess` traduz o campo esvaziado na interface (`''`) para `null`, que é a
 * ausência do contrato. Sem ele, limpar o campo devolveria 400 "informe um número"
 * para o caso que a regra considera normal: armadura que não limita a Destreza.
 */
const limiteDestrezaSchema = z.preprocess(
  (valor) => (valor === '' ? null : valor),
  inteiro('Limite de Destreza da armadura', LIMITE_DESTREZA_MINIMO, LIMITE_DESTREZA_MAXIMO)
    .nullable()
    .default(null),
);

const atributoChaveSchema = z.enum([SEM_ATRIBUTO_CHAVE, ...ATRIBUTOS] as [string, ...string[]], {
  errorMap: () => ({
    message: 'Atributo-chave da classe inválido. Escolha um dos seis atributos, ou deixe vazio.',
  }),
});

/**
 * As chaves que a seção Defesas acrescenta a `dados`, com os padrões de uma ficha
 * nova: tudo destreinado, sem armadura, sem atributo-chave e sem PV informado.
 *
 * Nenhuma delas guarda um número **derivado**: CA, salvaguardas, Percepção, CD de
 * classe e PV sugerido são calculados a cada leitura. Gravar um derivado criaria a
 * segunda verdade que o RV-098 fechou — o personagem subiria de nível e a CA
 * gravada continuaria a de antes.
 */
export const SCHEMA_DEFESAS = {
  ...(Object.fromEntries(
    DEFESAS_PF2E.map((defesa) => [
      chaveDoGrauDaDefesa(defesa.chave),
      grauTreinamentoSchema.default(GRAU_PADRAO),
    ]),
  ) as Record<string, z.ZodDefault<typeof grauTreinamentoSchema>>),
  [CHAVE_BONUS_ITEM_ARMADURA]: inteiro(
    'Bônus de item da armadura',
    BONUS_ITEM_MINIMO,
    BONUS_ITEM_MAXIMO,
  ).default(0),
  [CHAVE_LIMITE_DESTREZA]: limiteDestrezaSchema,
  [CHAVE_ATRIBUTO_DA_CLASSE]: atributoChaveSchema.default(SEM_ATRIBUTO_CHAVE),
  [CHAVE_PV_ANCESTRALIDADE]: inteiro(
    'PV da ancestralidade',
    PV_POR_FONTE_MINIMO,
    PV_POR_FONTE_MAXIMO,
  ).default(0),
  [CHAVE_PV_CLASSE]: inteiro(
    'PV da classe por nível',
    PV_POR_FONTE_MINIMO,
    PV_POR_FONTE_MAXIMO,
  ).default(0),
};

/** As cinco opções de grau, como a interface as oferece. */
const OPCOES_GRAU: readonly OpcaoCampo[] = Object.freeze(
  GRAUS_TREINAMENTO_PF2E.map((grau) => ({ valor: grau.chave, rotulo: grau.rotulo })),
);

/** As opções de atributo-chave, com a ausência primeiro e nomeada. */
const OPCOES_ATRIBUTO_CHAVE: readonly OpcaoCampo[] = Object.freeze([
  { valor: SEM_ATRIBUTO_CHAVE, rotulo: 'Não informado' },
  ...ATRIBUTOS.map((atributo) => ({ valor: atributo, rotulo: ROTULOS_ATRIBUTO[atributo] })),
]);

function campoDeGrau(defesa: DefesaPathfinder): CampoFicha {
  return {
    chave: chaveDoGrauDaDefesa(defesa.chave),
    rotulo: defesa.rotuloGrau,
    tipo: 'selecao',
    opcoes: OPCOES_GRAU,
  };
}

/**
 * Os campos **editáveis** das defesas: os seis graus, os dois da armadura, o
 * atributo-chave e as duas entradas de PV.
 *
 * O que **não** está aqui é o ponto do card: nenhum número derivado é campo.
 * "Somente leitura" significa não editável — e não "sem botão de dado", que é
 * outra coisa e vive em `defesas(ficha)`.
 */
export const CAMPOS_DEFESAS: readonly CampoFicha[] = Object.freeze([
  campoDeGrau(DEFESA_CA),
  {
    chave: CHAVE_BONUS_ITEM_ARMADURA,
    rotulo: 'Bônus de item da armadura',
    tipo: 'numero',
    minimo: BONUS_ITEM_MINIMO,
    maximo: BONUS_ITEM_MAXIMO,
    ajuda: 'Informado à mão até o catálogo de armaduras.',
  },
  {
    chave: CHAVE_LIMITE_DESTREZA,
    rotulo: 'Limite de Destreza da armadura',
    tipo: 'numero',
    minimo: LIMITE_DESTREZA_MINIMO,
    maximo: LIMITE_DESTREZA_MAXIMO,
    ajuda: 'Vazio significa que a armadura não limita a Destreza — ela entra inteira na CA.',
  },
  ...SALVAGUARDAS_PF2E.map(campoDeGrau),
  campoDeGrau(DEFESA_PERCEPCAO),
  campoDeGrau(DEFESA_CD_CLASSE),
  {
    chave: CHAVE_ATRIBUTO_DA_CLASSE,
    rotulo: 'Atributo-chave da classe',
    tipo: 'selecao',
    opcoes: OPCOES_ATRIBUTO_CHAVE,
    ajuda: 'Sem ele a CD de classe não é calculada — o sistema não escolhe por você.',
  },
  {
    chave: CHAVE_PV_ANCESTRALIDADE,
    rotulo: 'PV da ancestralidade',
    tipo: 'numero',
    minimo: PV_POR_FONTE_MINIMO,
    maximo: PV_POR_FONTE_MAXIMO,
    ajuda: 'Entra uma vez. Alimenta a sugestão de PV; o PV que vale é o do topo da ficha.',
  },
  {
    chave: CHAVE_PV_CLASSE,
    rotulo: 'PV da classe por nível',
    tipo: 'numero',
    minimo: PV_POR_FONTE_MINIMO,
    maximo: PV_POR_FONTE_MAXIMO,
    ajuda: 'Soma-se à Constituição a cada nível.',
  },
] as const satisfies readonly CampoFicha[]);

// ─────────────────────────────────────────────────────────────────────
// A aritmética — pura, e sem um `+ nivel` escrito
// ─────────────────────────────────────────────────────────────────────

/**
 * Quanto da Destreza entra na CA: o modificador, **limitado** pelo teto da
 * armadura quando ele existe.
 *
 * Teto maior que a Destreza não a aumenta (é teto, não bônus), e teto ausente
 * (`null`) deixa a Destreza inteira. Destreza negativa atravessa: ela penaliza a
 * CA, e o teto não a resgata.
 */
export function destrezaNaCa(modificadorDestreza: number, limiteDes: number | null): number {
  return limiteDes === null ? modificadorDestreza : Math.min(modificadorDestreza, limiteDes);
}

export interface EntradaCa {
  readonly nivel: number;
  /** Grau de treinamento na **categoria de armadura** que o personagem veste. */
  readonly grau: GrauTreinamento;
  readonly modificadorDestreza: number;
  readonly bonusItemArmadura: number;
  /** Teto de Destreza da armadura; `null` quando não há. */
  readonly limiteDes: number | null;
}

/**
 * CA = 10 + proficiência + Destreza (limitada pela armadura) + bônus de item.
 *
 * Cenário do card: nível 3, perito em armadura média (3 + 4 = 7), Destreza +4 com
 * meia-armadura de limite +1 (entra +1) e bônus de item +4 → **22**.
 */
export function calcularCa({
  nivel,
  grau,
  modificadorDestreza,
  bonusItemArmadura,
  limiteDes,
}: EntradaCa): number {
  return (
    BASE_DEFESA +
    bonusProficiencia(nivel, grau) +
    destrezaNaCa(modificadorDestreza, limiteDes) +
    bonusItemArmadura
  );
}

export interface EntradaChecagemDefesa {
  readonly nivel: number;
  readonly grau: GrauTreinamento;
  /** Modificador do atributo daquela defesa, já na escala do sistema. */
  readonly modificador: number;
}

/**
 * Salvaguarda = proficiência + modificador do atributo.
 *
 * Cenário do card: nível 3, perito em Fortitude com Constituição +3 → **+10**;
 * treinado em Reflexos com Destreza +1 → **+6**; treinado em Vontade com
 * Sabedoria +0 → **+5**.
 */
export function calcularSalvaguarda({ nivel, grau, modificador }: EntradaChecagemDefesa): number {
  return bonusProficiencia(nivel, grau) + modificador;
}

/**
 * Percepção = proficiência + Sabedoria. Mesma forma da salvaguarda, e função
 * própria: é ela que o RV-158 chama para a iniciativa, e um nome próprio é o que
 * permite achá-la sem reescrevê-la.
 */
export function calcularPercepcao({ nivel, grau, modificador }: EntradaChecagemDefesa): number {
  return bonusProficiencia(nivel, grau) + modificador;
}

/**
 * CD de classe = 10 + proficiência + modificador do atributo-chave.
 *
 * Cenário do card: nível 1, treinado (1 + 2 = 3) e atributo-chave +4 → **17**.
 * Não confunda com `CDS_SIMPLES`: aquilo é a tabela de CDs sem nível, e esta sai
 * da ficha.
 */
export function calcularCdClasse({ nivel, grau, modificador }: EntradaChecagemDefesa): number {
  return BASE_DEFESA + bonusProficiencia(nivel, grau) + modificador;
}

export interface EntradaPvSugerido {
  readonly nivel: number;
  /** PV que a ancestralidade concede uma vez. */
  readonly pvDaAncestralidade: number;
  /** PV que a classe concede por nível. */
  readonly pvDaClassePorNivel: number;
  readonly modificadorConstituicao: number;
}

/**
 * PV máximo **sugerido**: ancestralidade + nível × (classe + Constituição).
 *
 * É sugestão, nunca fonte: o PV do personagem continua em `pvMax`, editável, e é
 * de lá que a barra sobre o token sai (RV-042). O valor não é gravado em lugar
 * nenhum — é recalculado a cada leitura, e é por isso que subir de nível o
 * atualiza sozinho.
 *
 * Nunca desce abaixo de zero: uma Constituição muito negativa não tira PV de quem
 * já os tem, e um número negativo na tela seria pior que um piso explícito.
 */
export function pvSugerido({
  nivel,
  pvDaAncestralidade,
  pvDaClassePorNivel,
  modificadorConstituicao,
}: EntradaPvSugerido): number {
  const porNivel = pvDaClassePorNivel + modificadorConstituicao;
  return Math.max(pvDaAncestralidade + nivel * porNivel, 0);
}

// ─────────────────────────────────────────────────────────────────────
// Leitura da ficha
// ─────────────────────────────────────────────────────────────────────

/**
 * O grau gravado daquela defesa. Valor estranho ou ausente vale `destreinado`,
 * que é o piso da regra — e não o grau mais alto, que inflaria a defesa em
 * silêncio.
 */
export function grauDaDefesa(dados: DadosFicha, chave: string): GrauTreinamento {
  const gravado = dados[chaveDoGrauDaDefesa(chave)];
  return GRAUS_TREINAMENTO.find((grau) => grau === gravado) ?? GRAU_PADRAO;
}

/** Inteiro gravado naquela chave; `0` quando ausente ou estragado. */
function inteiroDe(dados: DadosFicha, chave: string): number {
  const valor = dados[chave];
  return typeof valor === 'number' && Number.isInteger(valor) ? valor : 0;
}

/** O bônus de item da armadura informado; `0` quando não há. */
export function bonusItemArmaduraDe(dados: DadosFicha): number {
  return inteiroDe(dados, CHAVE_BONUS_ITEM_ARMADURA);
}

/**
 * O limite de Destreza informado, ou `null` quando não foi informado.
 *
 * `null` é resposta, não erro: é a armadura que não limita a Destreza. Devolver
 * `0` aqui apagaria a Destreza de quem não veste armadura.
 */
export function limiteDestrezaDe(dados: DadosFicha): number | null {
  const valor = dados[CHAVE_LIMITE_DESTREZA];
  return typeof valor === 'number' && Number.isInteger(valor) ? valor : null;
}

/** O atributo-chave da classe informado, ou `null` quando não foi. */
export function atributoChaveDaClasse(dados: DadosFicha): NomeAtributo | null {
  const valor = dados[CHAVE_ATRIBUTO_DA_CLASSE];
  return ATRIBUTOS.find((atributo) => atributo === valor) ?? null;
}

/** O PV sugerido desta ficha, com as entradas que ela guarda. */
export function pvSugeridoDaFicha(ficha: FichaCalculavel, modificadorConstituicao: number): number {
  return pvSugerido({
    nivel: ficha.nivel,
    pvDaAncestralidade: inteiroDe(ficha.dados, CHAVE_PV_ANCESTRALIDADE),
    pvDaClassePorNivel: inteiroDe(ficha.dados, CHAVE_PV_CLASSE),
    modificadorConstituicao,
  });
}

/**
 * `true` quando a ficha ainda não tem as duas entradas da regra de PV.
 *
 * Sem elas a sugestão seria `0`, e "PV máximo sugerido: 0" numa ficha nova é pior
 * que nenhuma sugestão: parece resultado.
 */
function faltamEntradasDePv(dados: DadosFicha): boolean {
  return inteiroDe(dados, CHAVE_PV_ANCESTRALIDADE) === 0 && inteiroDe(dados, CHAVE_PV_CLASSE) === 0;
}

// ─────────────────────────────────────────────────────────────────────
// As defesas prontas para a ficha
// ─────────────────────────────────────────────────────────────────────

/** Como o número aparece: alvo (`22`) ou bônus de checagem (`+10`). */
function formatar(valor: number | null, rolavel: boolean): string {
  if (valor === null) return '—';
  return rolavel ? formatarBonus(valor) : String(valor);
}

/** `proficiência +7` — o pedaço que toda defesa tem. */
function trechoProficiencia(nivel: number, grau: GrauTreinamento): string {
  return `proficiência ${formatarBonus(bonusProficiencia(nivel, grau))}`;
}

/** `Constituição +3` — o pedaço do atributo. */
function trechoAtributo(atributo: NomeAtributo, modificador: number): string {
  return `${ROTULOS_ATRIBUTO[atributo]} ${formatarBonus(modificador)}`;
}

/** Modificador de um atributo desta ficha, já na escala do sistema. */
type ModificadorDe = (atributo: NomeAtributo) => number;

function defesaDaCa(ficha: FichaCalculavel, modificadorDe: ModificadorDe): DefesaFicha {
  const grau = grauDaDefesa(ficha.dados, CHAVE_CA);
  const destreza = modificadorDe('destreza');
  const limiteDes = limiteDestrezaDe(ficha.dados);
  const bonusItemArmadura = bonusItemArmaduraDe(ficha.dados);
  const valor = calcularCa({
    nivel: ficha.nivel,
    grau,
    modificadorDestreza: destreza,
    bonusItemArmadura,
    limiteDes,
  });
  // O texto diz o que aconteceu com a Destreza, porque é aí que a conta surpreende
  // quem soma à mão: com meia-armadura, +4 de Destreza vale +1.
  const sobreDestreza =
    limiteDes === null
      ? `${trechoAtributo('destreza', destreza)} (armadura sem limite informado)`
      : `${trechoAtributo('destreza', destrezaNaCa(destreza, limiteDes))} ` +
        `(teto ${formatarBonus(limiteDes)} da armadura)`;
  return {
    chave: CHAVE_CA,
    rotulo: DEFESA_CA.rotulo,
    valor,
    valorFormatado: formatar(valor, false),
    detalhe:
      `${BASE_DEFESA} + ${trechoProficiencia(ficha.nivel, grau)} + ${sobreDestreza} ` +
      `+ item ${formatarBonus(bonusItemArmadura)}`,
    rolavel: false,
  };
}

function defesaDeChecagem(
  defesa: DefesaPathfinder,
  atributo: NomeAtributo,
  ficha: FichaCalculavel,
  modificadorDe: ModificadorDe,
): DefesaFicha {
  const grau = grauDaDefesa(ficha.dados, defesa.chave);
  const modificador = modificadorDe(atributo);
  const entrada = { nivel: ficha.nivel, grau, modificador };
  // Percepção e salvaguarda têm a mesma forma, e chamadas separadas de propósito:
  // é a chamada que amarra a iniciativa do RV-158 a `calcularPercepcao`.
  const valor =
    defesa.chave === CHAVE_PERCEPCAO ? calcularPercepcao(entrada) : calcularSalvaguarda(entrada);
  return {
    chave: defesa.chave,
    rotulo: defesa.rotulo,
    valor,
    valorFormatado: formatar(valor, true),
    detalhe: `${trechoProficiencia(ficha.nivel, grau)} + ${trechoAtributo(atributo, modificador)}`,
    rolavel: true,
  };
}

function defesaDaCdClasse(ficha: FichaCalculavel, modificadorDe: ModificadorDe): DefesaFicha {
  const grau = grauDaDefesa(ficha.dados, CHAVE_CD_CLASSE);
  const atributo = atributoChaveDaClasse(ficha.dados);
  // Sem atributo-chave não se inventa um: quem o define é a classe, e escolher o
  // maior (ou a Força, por ser o primeiro da lista) daria número plausível e
  // errado — do tipo que a mesa só descobre quando o inimigo passa na CD.
  if (atributo === null) {
    return {
      chave: CHAVE_CD_CLASSE,
      rotulo: DEFESA_CD_CLASSE.rotulo,
      valor: null,
      valorFormatado: formatar(null, false),
      detalhe: 'Informe o atributo-chave da classe para calcular a CD.',
      rolavel: false,
    };
  }
  const modificador = modificadorDe(atributo);
  const valor = calcularCdClasse({ nivel: ficha.nivel, grau, modificador });
  return {
    chave: CHAVE_CD_CLASSE,
    rotulo: DEFESA_CD_CLASSE.rotulo,
    valor,
    valorFormatado: formatar(valor, false),
    detalhe:
      `${BASE_DEFESA} + ${trechoProficiencia(ficha.nivel, grau)} + ` +
      trechoAtributo(atributo, modificador),
    rolavel: false,
  };
}

function linhaDePvSugerido(ficha: FichaCalculavel, modificadorDe: ModificadorDe): DefesaFicha {
  const constituicao = modificadorDe('constituicao');
  const rotulo = 'PV máximo sugerido';
  if (faltamEntradasDePv(ficha.dados)) {
    return {
      chave: CHAVE_PV_SUGERIDO,
      rotulo,
      valor: null,
      valorFormatado: formatar(null, false),
      detalhe:
        'Informe o PV da ancestralidade e o da classe por nível para ver a sugestão. ' +
        'O PV que vale continua sendo o PV máx. da ficha.',
      rolavel: false,
    };
  }
  const daAncestralidade = inteiroDe(ficha.dados, CHAVE_PV_ANCESTRALIDADE);
  const daClasse = inteiroDe(ficha.dados, CHAVE_PV_CLASSE);
  const valor = pvSugeridoDaFicha(ficha, constituicao);
  return {
    chave: CHAVE_PV_SUGERIDO,
    rotulo,
    valor,
    valorFormatado: formatar(valor, false),
    // A frase diz, sem meio-tom, que este número não é o PV do personagem: o PV
    // tem uma casa só, e é editável no topo da ficha (F6 — a interface não pode
    // sugerir que salvou algo que não salvou).
    detalhe:
      `${daAncestralidade} da ancestralidade + ${ficha.nivel} × (${daClasse} da classe ` +
      `+ ${trechoAtributo('constituicao', constituicao)}). ` +
      `Sugestão da regra: o PV que vale é o PV máx. da ficha, que você ajusta à mão.`,
    rolavel: false,
  };
}

/**
 * As defesas desta ficha, prontas para a tela: as seis de proficiência e a
 * sugestão de PV máximo.
 *
 * O modificador de atributo chega como função de propósito: quem sabe interpretar
 * `personagens.atributos` é a **escala do sistema** (`definicao.ts`, RV-098), e
 * importá-la aqui faria dois arquivos se importarem em círculo. O efeito prático
 * é que este módulo não consegue supor a escala nem por acidente.
 */
export function montarDefesas(
  ficha: FichaCalculavel,
  modificadorDe: ModificadorDe,
): readonly DefesaFicha[] {
  return [
    ...DEFESAS_PF2E.map((defesa) => {
      if (defesa.chave === CHAVE_CA) return defesaDaCa(ficha, modificadorDe);
      if (defesa.atributo === null) return defesaDaCdClasse(ficha, modificadorDe);
      return defesaDeChecagem(defesa, defesa.atributo, ficha, modificadorDe);
    }),
    linhaDePvSugerido(ficha, modificadorDe),
  ];
}
