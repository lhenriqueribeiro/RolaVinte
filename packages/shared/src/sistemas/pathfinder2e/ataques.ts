import { z } from 'zod';
import { validarExpressao } from '../../dados/motor-dados';
import { formatarBonus } from '../generico';
import type {
  AtaqueDaFicha,
  CampoFicha,
  DadosFicha,
  ModeloDeAtaques,
  RolagemDeAtaque,
} from '../tipos';
import { ORDENS_DE_ATAQUE, penalidadeAtaquesMultiplos, type OrdemDeAtaque } from './regras';

/**
 * Ataques de Pathfinder Segunda Edição, com a penalidade de ataques múltiplos
 * (RV-156).
 *
 * **Atribuição.** O que está aqui é *mecânica* (a tabela do MAP, o traço ágil, a
 * regra de dobrar o dano), Open Game Content sob a OGL 1.0a, implementável com
 * atribuição — o texto que acompanha a exibição vem de `ATRIBUICAO_PF2E` (RV-150),
 * carregado por `DefinicaoSistema.atribuicao`. **Nenhum conteúdo entra neste
 * arquivo**: não há catálogo de armas, e não haverá — nome, bônus de acerto, dano e
 * o traço ágil são **informados à mão** até o RV-157, exatamente como o bônus de
 * item da armadura no RV-155. Uma lista "Espada longa 1d8, Adaga 1d4 ágil" seria
 * distribuir a tabela de armas da Paizo.
 *
 * ## A decisão que este card teve de tomar: onde mora o contador
 *
 * Em nenhum lugar — **não existe contador de MAP nesta plataforma**, nem no
 * servidor, nem no banco, nem em memória.
 *
 * A regra é "por turno e por personagem", e a plataforma **não tem turno**: o
 * agregado de Combate (RV-060) e o controle de turno (RV-062) são da Sprint 4.
 * Contar ataques sem saber de quem é o turno significaria inventar um estado que
 * ninguém sabe zerar: dois jogadores atacando na mesma sala, um F5 no meio do
 * turno, uma reação fora do turno (que a regra **isenta** do MAP) — cada um desses
 * deixaria o contador mentindo, e um contador que mente é pior que nenhum, porque
 * o jogador confia nele. Então a ordem é **escolha explícita do jogador**: três
 * botões rotulados, e a interface diz que a escolha é dele.
 *
 * É feio e é honesto. Quando o RV-062 existir, ele pode **pré-selecionar** o botão
 * certo; nem esta tabela nem a ficha mudam — o que muda é quem aponta para a
 * ordem. É por isso que `penalidadeAtaquesMultiplos` recebe a ordem como
 * argumento em vez de lê-la de algum lugar.
 *
 * ## Duas rolagens, nunca uma
 *
 * Acerto e dano são rolagens **separadas** no chat, cada uma com o nome do ataque
 * no motivo — o mesmo que o RV-092 diz para D&D 5e. Juntá-las numa mensagem só
 * daria um total que não é nem um nem outro.
 *
 * E o dano **não tem grau de sucesso**: grau é o resultado de uma checagem contra
 * uma CD, e dano não é checado contra nada. Por isso as variantes de dano vivem em
 * `danos`, separadas das de `acertos`, e a interface só passa CD nas de acerto —
 * a separação é estrutural, e não um `if` que alguém pode esquecer. Exibir "Falha"
 * numa rolagem de dano seria a mentira que o RV-154 já evita ao não inventar CD
 * padrão.
 */

// ─────────────────────────────────────────────────────────────────────
// Onde os ataques moram na ficha
// ─────────────────────────────────────────────────────────────────────

/** Onde a lista de ataques mora dentro de `dados`. */
export const CHAVE_ATAQUES = 'ataques';

/**
 * Prefixo da chave de um ataque: `ataque:0`.
 *
 * A chave é **posicional**, e é a diferença em relação ao Saber (`saber:Guerra`,
 * derivado do conteúdo): o nome de um ataque muda enquanto o jogador o digita, e
 * uma chave derivada do nome mudaria a cada tecla — a linha inteira remontaria e o
 * campo perderia o foco no meio da palavra. A posição também permite dois ataques
 * de nome igual, que é legítimo (duas adagas com bônus diferentes).
 *
 * Ela não é gravada em lugar nenhum: existe só entre a montagem da lista e o
 * clique que a consome.
 */
export const PREFIXO_ATAQUE = 'ataque:';

/** Chave do nome do ataque dentro do objeto gravado. */
export const CAMPO_NOME = 'nome';
/** Chave do bônus de acerto informado. */
export const CAMPO_BONUS_ACERTO = 'bonusAcerto';
/** Chave da expressão de dano informada. */
export const CAMPO_DANO = 'dano';
/** Chave do traço ágil. */
export const CAMPO_AGIL = 'agil';

/**
 * Teto de ataques por ficha.
 *
 * Existe pelo mesmo motivo do teto de Saberes: a lista mora num `jsonb` que a
 * interface renderiza inteiro, e sem teto ela é uma caixa sem fundo. Oito cobre
 * arma principal, secundária, arremesso, desarmado e magia de ataque com folga;
 * mudar o número é decisão consciente e o motivo vai no diff.
 */
export const LIMITE_ATAQUES = 8;

/** Teto de caracteres do nome — nome de arma, não descrição. */
export const TAMANHO_MAXIMO_NOME = 40;

/**
 * Teto da expressão de dano.
 *
 * Metade folgada do teto do motor de dados (200 caracteres), e não por acaso: a
 * variante dobrada é a expressão **somada a si mesma**, então 60 aqui garante que
 * a dobrada caiba nos 200 do motor. O que 60 não garante é o limite de *termos*
 * — ver `rolagemDeDanoDobrado`.
 */
export const TAMANHO_MAXIMO_DANO = 60;

/**
 * Faixa do bônus de acerto informado.
 *
 * É limite de **entrada**, não regra de PF2e (por isso não está em `regras.ts`):
 * existe para barrar digitação torta. O teto é folgado — no nível 20, lendário com
 * atributo e runa de potência, o bônus passa de +35 — e o piso negativo existe
 * porque penalidades de condição podem levar um ataque abaixo de zero.
 */
export const BONUS_ACERTO_MINIMO = -10;
export const BONUS_ACERTO_MAXIMO = 40;

/** O valor de "bônus de acerto não informado". */
export const SEM_BONUS_ACERTO = null;

// ─────────────────────────────────────────────────────────────────────
// Schema do que é gravado
// ─────────────────────────────────────────────────────────────────────

/**
 * O bônus de acerto: inteiro na faixa **ou** ausente.
 *
 * O `preprocess` traduz o campo esvaziado da interface (`''`) em `null`, que é a
 * ausência do contrato — mesmo tratamento do limite de Destreza no RV-155. Sem
 * ele, apagar o campo devolveria 400 para o estado normal de um ataque recém-criado
 * ("ainda não informei o bônus").
 */
const bonusAcertoSchema = z.preprocess(
  (valor) => (valor === '' ? null : valor),
  z
    .number({ invalid_type_error: 'Bônus de acerto: informe um número.' })
    .int('Bônus de acerto: informe um número inteiro.')
    .min(BONUS_ACERTO_MINIMO, `Bônus de acerto: o mínimo é ${BONUS_ACERTO_MINIMO}.`)
    .max(BONUS_ACERTO_MAXIMO, `Bônus de acerto: o máximo é ${BONUS_ACERTO_MAXIMO}.`)
    .nullable()
    .default(SEM_BONUS_ACERTO),
);

/**
 * A expressão de dano: vazia (não informada) **ou** uma expressão que o motor de
 * dados aceita.
 *
 * A validação é do próprio motor (`validarExpressao`), e não de um regex escrito
 * aqui: uma segunda gramática de dados divergiria da primeira no primeiro `kh`, e
 * o jogador só descobriria no 400 da rota de rolagem, depois de clicar. A mensagem
 * carrega o erro do motor porque "expressão inválida" sozinho não diz o que
 * consertar.
 */
const danoSchema = z
  .string({ invalid_type_error: 'Dano: informe a expressão como texto.' })
  .trim()
  .max(TAMANHO_MAXIMO_DANO, `Dano: o máximo é ${TAMANHO_MAXIMO_DANO} caracteres.`)
  .default('')
  .superRefine((expressao, ctx) => {
    if (expressao === '') return;
    const saida = validarExpressao(expressao);
    if (!saida.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Dano: expressão inválida ("${expressao}"). ${saida.erro}`,
      });
    }
  });

const ataqueSchema = z
  .object({
    [CAMPO_NOME]: z
      .string({ invalid_type_error: 'Ataque: informe o nome como texto.' })
      .trim()
      .min(1, 'Ataque: informe o nome (por exemplo, Espada longa).')
      .max(TAMANHO_MAXIMO_NOME, `Ataque: o máximo do nome é ${TAMANHO_MAXIMO_NOME} caracteres.`),
    [CAMPO_BONUS_ACERTO]: bonusAcertoSchema,
    [CAMPO_DANO]: danoSchema,
    [CAMPO_AGIL]: z.boolean({ invalid_type_error: 'Ágil: informe sim ou não.' }).default(false),
  })
  .strict();

/** Um ataque já validado, como fica gravado em `dados.ataques`. */
export type AtaqueGravado = z.infer<typeof ataqueSchema>;

/**
 * A lista de ataques da ficha.
 *
 * Nenhum número **derivado** entra aqui: o bônus já com a penalidade do 2º ataque
 * não é campo, é conta feita a cada leitura. Gravá-lo repetiria o defeito das duas
 * verdades que o RV-098 fechou para o atributo — o jogador trocaria a arma por uma
 * ágil e o `-5` gravado continuaria lá. O schema é `.strict()`, então uma chave
 * inventada volta como 400 nomeando o campo.
 */
export const ataquesSchema = z
  .array(ataqueSchema)
  .max(LIMITE_ATAQUES, `Ataques: o máximo é ${LIMITE_ATAQUES} por ficha.`)
  .default([]);

/** As chaves que a seção de ataques acrescenta a `dados`. */
export const SCHEMA_ATAQUES = {
  [CHAVE_ATAQUES]: ataquesSchema,
};

// ─────────────────────────────────────────────────────────────────────
// Os campos editáveis de um ataque
// ─────────────────────────────────────────────────────────────────────

/**
 * Os quatro campos informados de um ataque, na ordem de exibição.
 *
 * São `CampoFicha` — o mesmo contrato das seções da ficha (RV-091) — de propósito:
 * a interface já sabe desenhar texto, número e booleano a partir dele, com o
 * `never` que impede um tipo novo de passar em silêncio. O que muda é só de onde o
 * valor vem: aqui ele mora dentro do objeto do ataque, e não no topo de `dados`.
 */
export const CAMPOS_DO_ATAQUE: readonly CampoFicha[] = Object.freeze([
  { chave: CAMPO_NOME, rotulo: 'Nome do ataque', tipo: 'texto' },
  {
    chave: CAMPO_BONUS_ACERTO,
    rotulo: 'Bônus de acerto',
    tipo: 'numero',
    minimo: BONUS_ACERTO_MINIMO,
    maximo: BONUS_ACERTO_MAXIMO,
    ajuda: 'Informado à mão até o catálogo de armas. Já inclui proficiência, atributo e item.',
  },
  {
    chave: CAMPO_DANO,
    rotulo: 'Dano',
    tipo: 'texto',
    ajuda: 'Expressão de dados, como 1d8+4.',
  },
  {
    chave: CAMPO_AGIL,
    rotulo: 'Arma ágil',
    tipo: 'booleano',
    ajuda: 'A arma ágil troca a penalidade de -5/-10 por -4/-8.',
  },
] as const satisfies readonly CampoFicha[]);

// ─────────────────────────────────────────────────────────────────────
// Leitura da ficha
// ─────────────────────────────────────────────────────────────────────

/**
 * A lista gravada, sem confiar no formato — a ficha pode ter sido escrita por uma
 * versão anterior, ou não ter a chave nenhuma (toda ficha de PF2e criada antes
 * deste card).
 *
 * Item sem nome utilizável é descartado da leitura em vez de derrubar a ficha:
 * uma linha estragada não pode tornar a ficha ilegível para o dono dela.
 */
export function ataquesDe(dados: DadosFicha): readonly AtaqueGravado[] {
  const bruto = dados[CHAVE_ATAQUES];
  if (!Array.isArray(bruto)) return [];
  return bruto.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const registro = item as Record<string, unknown>;
    const nome = registro[CAMPO_NOME];
    if (typeof nome !== 'string' || nome.trim() === '') return [];
    const bonus = registro[CAMPO_BONUS_ACERTO];
    const dano = registro[CAMPO_DANO];
    return [
      {
        [CAMPO_NOME]: nome.trim(),
        [CAMPO_BONUS_ACERTO]:
          typeof bonus === 'number' && Number.isInteger(bonus) ? bonus : SEM_BONUS_ACERTO,
        [CAMPO_DANO]: typeof dano === 'string' ? dano.trim() : '',
        [CAMPO_AGIL]: registro[CAMPO_AGIL] === true,
      },
    ];
  });
}

/** A chave posicional de um ataque: `ataque:0`. */
export function chaveDeAtaque(indice: number): string {
  return `${PREFIXO_ATAQUE}${indice}`;
}

/**
 * O índice de volta, a partir da chave. `null` quando a chave não é de ataque ou
 * não aponta para uma posição inteira e não negativa.
 */
export function indiceDaChave(ataqueChave: string): number | null {
  if (!ataqueChave.startsWith(PREFIXO_ATAQUE)) return null;
  const cru = ataqueChave.slice(PREFIXO_ATAQUE.length);
  if (!/^\d+$/.test(cru)) return null;
  return Number(cru);
}

function comAtaques(dados: DadosFicha, ataques: readonly AtaqueGravado[]): DadosFicha {
  return { ...dados, [CHAVE_ATAQUES]: ataques.map((ataque) => ({ ...ataque })) };
}

/**
 * Acrescenta um ataque com o nome informado, e o resto em branco.
 *
 * Nome vazio, longo demais ou lista cheia devolvem `dados` inalterado — o mesmo
 * contrato de `acrescentarSaber`. A interface impede os três antes de chegar aqui,
 * **com o motivo escrito** (o RV-159 nasceu justamente de um caso em que ela não
 * dizia), e quem tentar pela API recebe 400 em PT-BR do `schemaFicha`.
 */
export function acrescentarAtaque(dados: DadosFicha, nome: string): DadosFicha {
  const limpo = nome.trim();
  if (limpo === '' || limpo.length > TAMANHO_MAXIMO_NOME) return dados;
  const atuais = ataquesDe(dados);
  if (atuais.length >= LIMITE_ATAQUES) return dados;
  return comAtaques(dados, [
    ...atuais,
    {
      [CAMPO_NOME]: limpo,
      [CAMPO_BONUS_ACERTO]: SEM_BONUS_ACERTO,
      [CAMPO_DANO]: '',
      [CAMPO_AGIL]: false,
    },
  ]);
}

/** Remove aquele ataque. Chave desconhecida devolve `dados` inalterado. */
export function removerAtaque(dados: DadosFicha, ataqueChave: string): DadosFicha {
  const indice = indiceDaChave(ataqueChave);
  if (indice === null) return dados;
  const atuais = ataquesDe(dados);
  if (indice >= atuais.length) return dados;
  return comAtaques(
    dados,
    atuais.filter((_, posicao) => posicao !== indice),
  );
}

/**
 * Troca um campo de um ataque. Pura: não muta a entrada.
 *
 * Aceita o valor **como a interface o produz** — inclusive o `''` de um campo
 * numérico esvaziado, que atravessa até o `schemaFicha` virar `null`. Filtrar aqui
 * faria a tela e a API discordarem sobre o que "vazio" significa. Chave de ataque
 * ou de campo desconhecidas não mudam nada: quem decide o que é válido é o schema,
 * na hora de salvar.
 */
export function definirCampoDoAtaque(
  dados: DadosFicha,
  ataqueChave: string,
  campo: string,
  valor: unknown,
): DadosFicha {
  const indice = indiceDaChave(ataqueChave);
  if (indice === null) return dados;
  if (!CAMPOS_DO_ATAQUE.some((declarado) => declarado.chave === campo)) return dados;
  const atuais = ataquesDe(dados);
  if (indice >= atuais.length) return dados;
  return comAtaques(
    dados,
    atuais.map((ataque, posicao) =>
      posicao === indice ? ({ ...ataque, [campo]: valor } as AtaqueGravado) : ataque,
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────
// As rolagens de acerto
// ─────────────────────────────────────────────────────────────────────

/** Chave da rolagem de acerto daquela ordem: `acerto:2`. */
export function chaveDoAcerto(ordem: OrdemDeAtaque): string {
  return `acerto:${ordem}`;
}

/**
 * Chaves das duas variantes de dano.
 *
 * Elas levam prefixo (`dano:normal`, e não `dano`) porque a chave de uma **rolagem**
 * e a chave de um **campo gravado** vivem em espaços diferentes e não podem colidir:
 * o campo informado já se chama `dano`, e com o mesmo nome nos dois lados a guarda
 * do registro — "nenhuma rolagem de ataque é campo gravado da ficha" — acusava um
 * falso positivo e teria de ser afrouxada até não provar mais nada. Foi ela que pegou
 * a colisão antes de este arquivo existir por inteiro.
 */
export const CHAVE_DANO = 'dano:normal';
export const CHAVE_DANO_DOBRADO = 'dano:dobrado';

/**
 * Como cada ordem é chamada na tela.
 *
 * O terceiro diz **"ou mais"** porque a regra é "terceiro ou seguintes": rotulá-lo
 * "3º ataque" faria o jogador procurar um quarto botão que não existe — e que não
 * deve existir, porque o quarto ataque usa esta mesma penalidade.
 */
const NOME_DA_ORDEM: Record<OrdemDeAtaque, string> = {
  1: '1º ataque',
  2: '2º ataque',
  3: '3º ataque ou mais',
};

/** `2º ataque (-5)`; o primeiro não ganha sufixo porque não tem penalidade. */
function rotuloDoAcerto(ordem: OrdemDeAtaque, penalidade: number): string {
  const nome = NOME_DA_ORDEM[ordem];
  return penalidade === 0 ? nome : `${nome} (${penalidade})`;
}

function detalheDoAcerto(
  ordem: OrdemDeAtaque,
  bonusAcerto: number,
  penalidade: number,
  agil: boolean,
): string {
  if (penalidade === 0) {
    return `${formatarBonus(bonusAcerto)} informado. Primeiro ataque do turno: sem penalidade.`;
  }
  const origem = agil ? `${penalidade} (arma ágil)` : String(penalidade);
  return (
    `${formatarBonus(bonusAcerto)} informado, penalidade ${origem} do ${NOME_DA_ORDEM[ordem]} ` +
    `= ${formatarBonus(bonusAcerto + penalidade)}.`
  );
}

/**
 * A frase que aparece quando não há o que rolar.
 *
 * Ela existe porque o card manda o botão ficar **desabilitado com o motivo**, e
 * não sumir: controle escondido não ensina nada a quem está montando a ficha.
 */
const FALTA_BONUS = 'Informe o bônus de acerto deste ataque para poder rolá-lo.';
const FALTA_DANO = 'Informe a expressão de dano (por exemplo, 1d8+4) para poder rolá-la.';

function rolagemDeAcerto(
  ataque: AtaqueGravado,
  ordem: OrdemDeAtaque,
  dadoDeTeste: string,
): RolagemDeAtaque {
  // A penalidade sai da tabela de `regras.ts`, e é a arma **deste** ataque que
  // decide se ela é a ágil: a anterior não entra na conta.
  const penalidade = penalidadeAtaquesMultiplos(ordem, ataque[CAMPO_AGIL]) ?? 0;
  const rotulo = rotuloDoAcerto(ordem, penalidade);
  const bonusAcerto = ataque[CAMPO_BONUS_ACERTO];
  const descricao = `${ataque[CAMPO_NOME]} (${rotulo})`;
  if (bonusAcerto === null) {
    return {
      chave: chaveDoAcerto(ordem),
      rotulo,
      descricao,
      expressao: null,
      detalhe: FALTA_BONUS,
    };
  }
  return {
    chave: chaveDoAcerto(ordem),
    rotulo,
    descricao,
    expressao: `${dadoDeTeste}${formatarBonus(bonusAcerto + penalidade)}`,
    detalhe: detalheDoAcerto(ordem, bonusAcerto, penalidade, ataque[CAMPO_AGIL]),
  };
}

// ─────────────────────────────────────────────────────────────────────
// As rolagens de dano
// ─────────────────────────────────────────────────────────────────────

const SEM_GRAU_NO_DANO = 'Dano não é checado contra CD: esta rolagem não sai com grau de sucesso.';

function rolagemDeDano(ataque: AtaqueGravado): RolagemDeAtaque {
  const dano = ataque[CAMPO_DANO];
  const descricao = `Dano de ${ataque[CAMPO_NOME]}`;
  if (dano === '') {
    return { chave: CHAVE_DANO, rotulo: 'Dano', descricao, expressao: null, detalhe: FALTA_DANO };
  }
  return {
    chave: CHAVE_DANO,
    rotulo: `Dano ${dano}`,
    descricao,
    expressao: dano,
    detalhe: `Rola ${dano}. ${SEM_GRAU_NO_DANO}`,
  };
}

/**
 * A expressão dobrada: a de dano **somada a si mesma**.
 *
 * Aqui há uma escolha de regra que precisa estar escrita, porque as duas leituras
 * dão números com a mesma média e espalhamentos diferentes. O padrão do livro é
 * *rolar o dano e dobrar o total*; a regra também permite, com a concordância do
 * mestre, *rolar os dados duas vezes e dobrar os modificadores* — e é esta segunda
 * que a plataforma usa, porque o motor de dados (`motor-dados.ts`) soma e subtrai
 * termos e **não multiplica um total**. As alternativas eram piores: inventar uma
 * multiplicação na gramática do motor é card do E08 e mexeria no chat, na
 * validação e na api de uma vez; e "rolar o normal e pedir para a mesa dobrar" é
 * devolver ao jogador exatamente a conta que este épico existe para tirar dele.
 *
 * A escolha vai escrita no `detalhe`, em PT-BR, junto do que foi rolado: quem
 * conhece a regra precisa saber qual das duas leituras a mesa acabou de usar.
 */
function rolagemDeDanoDobrado(ataque: AtaqueGravado): RolagemDeAtaque {
  const dano = ataque[CAMPO_DANO];
  const rotulo = 'Dano dobrado (crítico)';
  const descricao = `Dano dobrado de ${ataque[CAMPO_NOME]} (sucesso crítico)`;
  if (dano === '') {
    return { chave: CHAVE_DANO_DOBRADO, rotulo, descricao, expressao: null, detalhe: FALTA_DANO };
  }
  const dobrada = `${dano}+${dano}`;
  const saida = validarExpressao(dobrada);
  if (!saida.ok) {
    // Acontece quando a expressão de dano tem termos demais para caber dobrada no
    // motor. Botão desabilitado dizendo isso é melhor que um clique que volta 400.
    return {
      chave: CHAVE_DANO_DOBRADO,
      rotulo,
      descricao,
      expressao: null,
      detalhe: `A expressão dobrada ("${dobrada}") não é aceita pelo motor de dados. ${saida.erro}`,
    };
  }
  return {
    chave: CHAVE_DANO_DOBRADO,
    rotulo,
    descricao,
    expressao: dobrada,
    detalhe:
      `Rola ${dobrada} — os dados duas vezes e os modificadores dobrados, a variante que a regra ` +
      `permite quando o mestre concorda (o padrão do livro é rolar ${dano} e dobrar o total). ` +
      SEM_GRAU_NO_DANO,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Os ataques prontos para a ficha
// ─────────────────────────────────────────────────────────────────────

/**
 * Os ataques desta ficha, cada um com as três variantes de acerto e as duas de
 * dano.
 *
 * O dado do teste chega como parâmetro (`1d20`) em vez de escrito aqui pelo mesmo
 * motivo de `montarDefesas` receber o modificador: quem declara o dado do sistema
 * é a definição, e este módulo não deve poder supô-lo.
 */
export function montarAtaques(dados: DadosFicha, dadoDeTeste: string): readonly AtaqueDaFicha[] {
  return ataquesDe(dados).map((ataque, indice) => ({
    chave: chaveDeAtaque(indice),
    nome: ataque[CAMPO_NOME],
    valores: { ...ataque },
    acertos: ORDENS_DE_ATAQUE.map((ordem) => rolagemDeAcerto(ataque, ordem, dadoDeTeste)),
    danos: [rolagemDeDano(ataque), rolagemDeDanoDobrado(ataque)],
  }));
}

/**
 * O modelo de ataques do PF2e, como o registro de sistemas o enxerga.
 *
 * Todo texto que a seção mostra sai daqui, e não do JSX: a frase do MAP e a do
 * crítico são **regra**, e regra escrita na tela é regra que divergirá da regra
 * escrita no cálculo. A da ordem é também o cumprimento do DoD deste card — em
 * lugar nenhum se diz "automático", porque não é: quem escolhe a ordem é o
 * jogador.
 */
export const ATAQUES_PF2E = (dadoDeTeste: string): ModeloDeAtaques => ({
  rotulo: 'Ataques',
  ajuda:
    'Você escolhe qual golpe do turno está rolando: a plataforma não conta os seus ataques, ' +
    'porque ela ainda não sabe de quem é o turno. A penalidade é a da arma deste ataque, e zera ' +
    'no fim do seu turno. Acertou com sucesso crítico? O dano dobra — use o botão de dano ' +
    'dobrado; nada é dobrado sem o seu clique.',
  rotuloNovo: 'Nome do ataque novo',
  rotuloCdAlvo: 'CA do alvo',
  ajudaCdAlvo:
    'Opcional, e não é gravada na ficha: é a CA de quem você está atacando. Informada, o chat ' +
    'diz o grau de sucesso do acerto; em branco, a rolagem sai como qualquer outra.',
  limite: LIMITE_ATAQUES,
  campos: CAMPOS_DO_ATAQUE,
  ataques: (ficha) => montarAtaques(ficha.dados, dadoDeTeste),
  acrescentar: acrescentarAtaque,
  remover: removerAtaque,
  definirCampo: definirCampoDoAtaque,
});
