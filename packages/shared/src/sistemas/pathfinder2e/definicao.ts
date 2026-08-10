import { z } from 'zod';
import { ATRIBUTOS, type NomeAtributo } from '../../schemas/personagens';
import type {
  AcaoDePericia,
  CampoFicha,
  DadosFicha,
  DefinicaoSistema,
  EscalaDeAtributo,
  FichaCalculavel,
} from '../tipos';
import { ATRIBUICAO_PF2E } from './atribuicao';
import { ATAQUES_PF2E, SCHEMA_ATAQUES } from './ataques';
import { CAMPOS_DEFESAS, montarDefesas, SCHEMA_DEFESAS } from './defesas';
import { avaliarRolagemPathfinder2e } from './avaliar-rolagem';
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
 * d20 clássico. A fórmula `(valor − 10) / 2` **não existe** neste sistema.
 *
 * O RV-152 respondeu a isso guardando os seis modificadores em `dados`
 * (`modificadorForca`, …) e declarando `usaAtributosComuns: false` para a coluna
 * comum `personagens.atributos` ser ignorada. Custou o defeito que o **RV-098**
 * consertou: a coluna continuava sendo exigida na criação e gravada, e a ficha
 * lia outro lugar — quem informava Força 18 na criação via o valor desaparecer, e
 * a perícia calculava como se fosse 0. Duas verdades para o mesmo conceito.
 *
 * Desde o RV-098 o atributo do PF2e mora **na coluna comum**, como em todo
 * sistema, e o que é deste sistema é a **escala** (`ESCALA_ATRIBUTO_PF2E`:
 * modificador direto, de −5 a +8). Consequências:
 *
 * - `dados` **não** guarda mais modificador nenhum — as seis chaves antigas foram
 *   consolidadas na coluna pela migration `0009` (ver `CHAVES_MODIFICADOR_LEGADAS`);
 * - `modificadorDeAtributo` lê `ficha.atributos`, e não `ficha.dados`;
 * - a interface oferece o teste de atributo em **todo** sistema, porque agora ele
 *   rola o número certo: a expressão sai de `definicao.atributos.modificador`,
 *   que aqui é a identidade. Era isto que o `usaAtributosComuns` existia para
 *   evitar quando o número certo não estava na coluna.
 *
 * ## O que ainda não está aqui, e por quê
 *
 * - **Perícias** chegaram no RV-153: a tabela mora em `pericias.ts` e este
 *   arquivo só a pluga no registro. Saber é família (`dados.saberes`), não
 *   chave de `treinamentos`.
 * - **Defesas** (CA, salvaguardas, Percepção, CD de classe) chegaram no RV-155:
 *   a tabela e a aritmética moram em `defesas.ts`, e este arquivo pluga a seção
 *   dos campos informados e o método `defesas` da definição.
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

/**
 * O dado de toda checagem do sistema.
 *
 * Escrito uma vez e lido em dois lugares (o campo `dadoDeTeste` da definição e o
 * modelo de ataques, que monta `1d20+4` com a penalidade já aplicada): duas
 * ocorrências do literal seriam duas chances de um sistema rolar dois dados
 * diferentes para a mesma coisa.
 */
const DADO_DE_TESTE = '1d20';

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
// A escala de atributo do sistema (RV-098)
// ─────────────────────────────────────────────────────────────────────

/** Menor modificador de atributo aceito na ficha. */
export const MODIFICADOR_MINIMO = -5;
/** Maior modificador de atributo aceito na ficha. */
export const MODIFICADOR_MAXIMO = 8;

/**
 * A escala de atributo do PF2e: o número gravado **é** o modificador.
 *
 * `modificador` é a identidade de propósito, e não um `(valor − 10) / 2`
 * disfarçado: no PF2e pós-remaster o personagem não tem valor de atributo, tem
 * modificador. A faixa −5..+8 cobre do nível 1 (nenhum modificador abaixo de −1
 * nem acima de +4) ao topo da progressão, com folga para item.
 *
 * A frase de `descricao` é a única redação da faixa no repositório: legenda da
 * ficha e mensagem de 400 saem daqui.
 */
export const ESCALA_ATRIBUTO_PF2E: EscalaDeAtributo = Object.freeze({
  descricao: `modificador direto, de ${MODIFICADOR_MINIMO} a +${MODIFICADOR_MAXIMO}`,
  minimo: MODIFICADOR_MINIMO,
  maximo: MODIFICADOR_MAXIMO,
  padrao: 0,
  modificador: (valor: number) => valor,
});

/**
 * Onde o modificador **morava** dentro de `dados` antes do RV-098.
 *
 * Não é campo vivo de ficha nenhuma: as seis chaves foram consolidadas na coluna
 * comum `personagens.atributos` pela migration
 * `0009_consolidar_atributos_pathfinder2e.sql`. A lista continua exportada por
 * dois motivos, os dois verificados por teste:
 *
 * - a guarda offline da `0009` (`apps/api/src/testes/consolidacao-atributos.test.ts`)
 *   confere que o SQL nomeia **todas** as seis — copiar cinco e esquecer uma
 *   apagaria um atributo em silêncio;
 * - o `schemaFicha` deste sistema é estrito, então uma ficha que ainda traga
 *   qualquer uma delas é recusada com o nome do campo na mensagem, em vez de
 *   gravar um valor que ninguém mais lê.
 */
export const CHAVES_MODIFICADOR_LEGADAS: readonly string[] = Object.freeze(
  ATRIBUTOS.map((atributo) => `modificador${atributo.charAt(0).toUpperCase()}${atributo.slice(1)}`),
);

// ─────────────────────────────────────────────────────────────────────
// Graus de treinamento
// ─────────────────────────────────────────────────────────────────────

/**
 * O que pode ter grau de treinamento de chave **fixa** nesta ficha.
 *
 * São as 16 perícias de `pericias.ts` (RV-153). O Saber não está aqui: ele é
 * uma família, e as suas instâncias vêm da própria ficha (`dados.saberes`) —
 * ver `FAMILIA_SABER`.
 *
 * **As defesas do RV-155 não entraram nesta lista, ao contrário do que o RV-153
 * previa aqui.** Elas têm grau de treinamento pela mesma fórmula, mas esta lista é
 * também o `pericias` da definição — a lista que a interface desenha na seção de
 * perícias. Percepção dentro dela apareceria entre as perícias, que é exatamente o
 * que o DoD dos dois cards proíbe (no PF2e ela é defesa). Os graus das defesas são
 * chaves de topo de `dados` (`grauArmadura`, `grauFortitude`, …), porque
 * `CampoFicha.chave` endereça uma chave de topo e é assim que a seção Defesas
 * renderiza — ver `CAMPOS_DEFESAS` em `defesas.ts`.
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
    // Os seis modificadores **não** entram aqui: eles são o atributo do
    // personagem e moram na coluna comum, validados pela escala do sistema
    // (RV-098). Antes do RV-098 estavam nos dois lugares.
    [CHAVE_TREINAMENTOS]: treinamentosSchema,
    // As especializações de Saber são lista, e não chaves de `treinamentos`: a
    // família é do personagem, não do sistema (RV-153).
    [CHAVE_SABERES]: saberesSchema,
    // As entradas **manuais** das defesas (RV-155): os seis graus, os dois campos
    // da armadura, o atributo-chave da classe e as duas entradas de PV. Nenhum
    // número derivado entra aqui — CA, salvaguardas, Percepção, CD de classe e PV
    // sugerido são calculados a cada leitura, senão a ficha subiria de nível e a
    // CA gravada continuaria a de antes.
    ...SCHEMA_DEFESAS,
    // Os ataques (RV-156): lista do personagem, com nome, bônus de acerto, dano e o
    // traço ágil **informados**. A penalidade de ataques múltiplos não entra aqui —
    // ela é derivada da ordem que o jogador escolhe no momento do golpe, e gravá-la
    // congelaria o `-5` de um ataque que virou ágil.
    ...SCHEMA_ATAQUES,
  })
  .strict();

// ─────────────────────────────────────────────────────────────────────
// Leitura da ficha
// ─────────────────────────────────────────────────────────────────────

/**
 * O modificador de um atributo **desta** ficha.
 *
 * Lê a coluna comum e a interpreta pela escala do sistema — que aqui é a
 * identidade, porque o número gravado já é o modificador (RV-098). Repare no que
 * a função não faz: ela não chama `modificadorAtributo()`, a fórmula
 * `(valor − 10) / 2` do d20 clássico. Derivar por ali daria +0 para todo
 * personagem de PF2e, e +0 é um número que parece certo.
 *
 * Valor ausente ou estragado vale 0 em vez de derrubar a ficha: uma linha gravada
 * fora do formato não pode tornar a ficha ilegível para o dono dela.
 */
export function modificadorDeAtributo(ficha: FichaCalculavel, atributo: NomeAtributo): number {
  const valor = ficha.atributos[atributo];
  return typeof valor === 'number' && Number.isFinite(valor)
    ? ESCALA_ATRIBUTO_PF2E.modificador(valor)
    : 0;
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
  // Identidade e Defesas. Atributos saiu daqui no RV-098 e voltou para o bloco
  // comum da ficha, que agora desenha a escala declarada pelo sistema — uma seção
  // própria aqui significaria seis campos de modificador ao lado dos seis
  // atributos comuns, os dois editáveis e um só valendo. A seção Defesas tem
  // apenas o que é **informado**: o número derivado não é campo (RV-155).
  secoes: [
    { chave: 'identidade', titulo: 'Identidade', campos: CAMPOS_IDENTIDADE },
    {
      chave: 'defesas',
      titulo: 'Defesas (armadura, graus e entradas de PV)',
      campos: CAMPOS_DEFESAS,
    },
  ],
  pericias: TREINAVEIS,
  // Saber é família: as instâncias saem de `dados.saberes`, não desta lista.
  familiasPericia: [FAMILIA_SABER],
  grausPericia: GRAUS_TREINAMENTO_PF2E,
  dadoDeTeste: DADO_DE_TESTE,
  // Vazio até o RV-158: a iniciativa do PF2e rola por Percepção — que **já
  // existe** desde o RV-155, na lista de `defesas` sob a chave `CHAVE_PERCEPCAO`,
  // com valor, expressão e motivo prontos. O que falta é o consumidor (o caso de
  // uso de combate do RV-061), e é ele que decide entre Percepção e a perícia que
  // a cena pedir. Declarar aqui a iniciativa por Destreza da ficha genérica seria
  // a regra errada com cara de regra certa.
  rolagensPadrao: [],
  atributos: ESCALA_ATRIBUTO_PF2E,
  atribuicao: ATRIBUICAO_PF2E,
  bonusPericia,
  grauDePericia: grauDeTreinamento,
  definirGrauDePericia,
  acoesDePericia,
  // As defesas derivadas (RV-155). A conta é de `defesas.ts`; o que este arquivo
  // acrescenta é a **escala** — `montarDefesas` recebe o modificador já
  // interpretado, e por isso não tem como supor que 4 significa +4 ou +(-3).
  defesas: (ficha) => montarDefesas(ficha, (atributo) => modificadorDeAtributo(ficha, atributo)),
  // Os ataques com a penalidade de ataques múltiplos (RV-156). A tabela do MAP é de
  // `regras.ts` e as variantes são de `ataques.ts`; aqui só se pluga o modelo, com o
  // dado do sistema. **Não há contador de MAP em lugar nenhum** — a ordem do golpe é
  // escolha explícita do jogador, porque sem o RV-062 a plataforma não sabe de quem
  // é o turno nem quando zerar.
  ataques: ATAQUES_PF2E(DADO_DE_TESTE),
  // O grau de sucesso do PF2e (RV-154). A implementação mora em
  // `avaliar-rolagem.ts` e só chama `grauSucesso`/`d20NaturalDe` do RV-151 — é a
  // única aritmética do sistema, e é lá.
  avaliarRolagem: avaliarRolagemPathfinder2e,
};
