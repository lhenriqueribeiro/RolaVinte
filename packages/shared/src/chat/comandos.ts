import { z } from 'zod';
import { cdValida, MENSAGEM_CD_INVALIDA } from './avaliacao';

/**
 * Registry de comandos de chat (RV-074).
 *
 * O parser vive aqui, em `@rolavinte/shared`, porque as duas pontas precisam
 * interpretar `/r`, `/sussurro` e `/oculto` **exatamente igual**: o front para
 * avisar antes de enviar, o servidor para decidir o que executar. Antes disto
 * havia um regex solto dentro de `Chat.tsx` — uma segunda gramática, invisível,
 * pronta para divergir.
 *
 * Ponto de extensão: acrescentar um comando é acrescentar uma `DefinicaoComando`
 * a `COMANDOS_CHAT` e um manipulador no composition root. Não existe `switch`
 * central: `interpretarComando` consulta o índice montado a partir da lista, e o
 * despacho do servidor é um `Map<tipo, manipulador>` cujo `Record` de montagem
 * recusa tipo sem manipulador (ver `aplicacao/jogo/comandos-chat.ts` na api).
 *
 * O servidor **nunca** confia no que o cliente diz ter digitado: ele reinterpreta
 * o texto cru com esta mesma função. Autorização (`/oculto` é do mestre) e
 * privacidade (sussurro) são decididas depois, no caso de uso — o parser só
 * classifica.
 */

/** Tipos de comando que a mesa sabe executar — as chaves do mapa de manipuladores. */
export type TipoComandoExecutavel = 'fala' | 'rolagem' | 'rolagem-oculta' | 'sussurro';

/** Comandos que se escrevem com barra (todos, menos a fala, que é o padrão). */
export type TipoComandoComBarra = Exclude<TipoComandoExecutavel, 'fala'>;

/**
 * Resultado da interpretação.
 *
 * `desconhecido` e `incompleto` carregam `aviso` em PT-BR e **não** viram
 * mensagem: o front mostra o aviso sem chamar a API, e a API responde 400 com o
 * mesmo texto se alguém chamar a rota direto.
 */
export type ComandoChat =
  | { tipo: 'fala'; conteudo: string }
  | { tipo: 'rolagem'; expressao: string; motivo: string; cd: number | null }
  | { tipo: 'rolagem-oculta'; expressao: string; motivo: string; cd: number | null }
  | { tipo: 'sussurro'; destinatario: string; conteudo: string }
  | { tipo: 'desconhecido'; nome: string; aviso: string }
  | { tipo: 'incompleto'; nome: string; aviso: string };

/** Comando interpretado que pode ser executado (tem manipulador). */
export type ComandoExecutavel = Extract<ComandoChat, { tipo: TipoComandoExecutavel }>;

export interface DefinicaoComando {
  readonly tipo: TipoComandoComBarra;
  /** Nome canônico, sem a barra. */
  readonly nome: string;
  /** Outras formas de escrever o mesmo comando, sem a barra. */
  readonly aliases: readonly string[];
  /** Como se usa, já com a barra — entra nas mensagens de ajuda e de erro. */
  readonly uso: string;
  readonly descricao: string;
  /** Interpreta o que veio depois do nome do comando (já trimado). */
  readonly analisar: (argumento: string) => ComandoChat;
}

function separarExpressaoEMotivo(argumento: string): { expressao: string; motivo: string } {
  // Só o PRIMEIRO `#` separa: "2d6 # dano # crítico" tem motivo "dano # crítico".
  const corte = argumento.indexOf('#');
  if (corte < 0) return { expressao: argumento.trim(), motivo: '' };
  return {
    expressao: argumento.slice(0, corte).trim(),
    motivo: argumento.slice(corte + 1).trim(),
  };
}

/**
 * O sufixo `cd N` de uma checagem (RV-154), separado da expressão de dados.
 *
 * **Como a CD chega, e por que assim.** Uma pessoa digitando no chat escreve
 * `/r 1d20+11 cd 18`, então o sufixo é gramática do comando e é aqui que ele é
 * lido — junto do `#` do motivo, no único lugar do repositório que interpreta a
 * linha do chat. Quem **não** é pessoa (a ficha, ao clicar numa salvaguarda)
 * manda a CD como número no corpo de `POST /mesas/:id/rolagens`: montar
 * `"1d20+6 cd 18"` só para o servidor desmontar de novo seria uma segunda
 * gramática, e é exatamente o defeito que o RV-074 veio apagar do `Chat.tsx`.
 * As duas pontas convergem no mesmo `cd: number | null` antes de chegar ao caso
 * de uso, que por isso não faz *parsing* nenhum.
 *
 * A âncora é o fim da expressão porque nenhuma expressão de dados válida termina
 * em `cd <algo>` — o motor só conhece dígitos, `d`, sinais e `kh`/`kl`. Sem
 * âncora, `cd` no meio de um motivo viraria CD.
 *
 * O `(?:^|\s+)` cobre `/r cd 18`, em que a pessoa digitou só a CD: o sufixo é
 * separado, a expressão fica vazia e o aviso cobra a expressão. Sem ele a linha
 * viraria uma rolagem da "expressão" `cd 18`, e o erro que voltaria seria
 * "expressão inválida" — verdadeiro e inútil. Exigir espaço **ou** início mantém
 * `1d20cd18` fora do casamento, que é o que garante que nenhuma expressão real
 * perca um pedaço.
 */
const RE_SUFIXO_CD = /(?:^|\s+)cd\s*(\S*)\s*$/i;

interface ExpressaoComCd {
  expressao: string;
  /** `null` = sem CD, e portanto sem grau de sucesso. Nunca uma CD padrão. */
  cd: number | null;
  /** Preenchido quando havia sufixo de CD e ele não é um número aceitável. */
  problema: string | null;
}

function separarCd(expressao: string): ExpressaoComCd {
  const achado = RE_SUFIXO_CD.exec(expressao);
  if (!achado) return { expressao, cd: null, problema: null };

  const bruto = achado[1] ?? '';
  const semSufixo = expressao.slice(0, achado.index).trim();
  if (!/^-?\d+$/.test(bruto)) {
    return {
      expressao: semSufixo,
      cd: null,
      problema: bruto === '' ? MENSAGEM_CD_AUSENTE : MENSAGEM_CD_INVALIDA,
    };
  }
  const cd = Number(bruto);
  if (!cdValida(cd)) return { expressao: semSufixo, cd: null, problema: MENSAGEM_CD_INVALIDA };
  return { expressao: semSufixo, cd, problema: null };
}

function analisarRolagem(definicao: DefinicaoComando, argumento: string): ComandoChat {
  const { expressao: comSufixo, motivo } = separarExpressaoEMotivo(argumento);
  const { expressao, cd, problema } = separarCd(comSufixo);
  if (!expressao) {
    return {
      tipo: 'incompleto',
      nome: definicao.nome,
      aviso: `Informe a expressão de dados. Exemplo: ${definicao.uso}`,
    };
  }
  // CD estragada não vira rolagem sem grau: quem digitou a CD quer o grau, e
  // rolar em silêncio esconderia o erro de digitação (F8 — pulo silencioso).
  if (problema) return { tipo: 'incompleto', nome: definicao.nome, aviso: problema };
  return definicao.tipo === 'rolagem-oculta'
    ? { tipo: 'rolagem-oculta', expressao, motivo, cd }
    : { tipo: 'rolagem', expressao, motivo, cd };
}

/**
 * Destinatário do sussurro. Aceita `@Nome` e `"Nome Com Espaço"`, porque nome de
 * usuário com espaço é o caso comum ("Ana Maria") e um parser de token único
 * sussurraria para "Ana" — que pode nem existir na mesa.
 */
function separarDestinatario(argumento: string): { destinatario: string; conteudo: string } | null {
  const semArroba = argumento.startsWith('@') ? argumento.slice(1).trimStart() : argumento;
  if (semArroba.startsWith('"')) {
    const fim = semArroba.indexOf('"', 1);
    if (fim < 0) return null;
    return {
      destinatario: semArroba.slice(1, fim).trim(),
      conteudo: semArroba.slice(fim + 1).trim(),
    };
  }
  const espaco = /\s/.exec(semArroba);
  if (!espaco) return { destinatario: semArroba.trim(), conteudo: '' };
  return {
    destinatario: semArroba.slice(0, espaco.index).trim(),
    conteudo: semArroba.slice(espaco.index).trim(),
  };
}

function analisarSussurro(definicao: DefinicaoComando, argumento: string): ComandoChat {
  const incompleto = (aviso: string): ComandoChat => ({
    tipo: 'incompleto',
    nome: definicao.nome,
    aviso,
  });
  const partes = separarDestinatario(argumento);
  if (!partes) return incompleto(`Feche as aspas do nome. Exemplo: ${definicao.uso}`);
  if (!partes.destinatario)
    return incompleto(`Diga para quem sussurrar. Exemplo: ${definicao.uso}`);
  if (!partes.conteudo) {
    return incompleto(
      `Escreva o que sussurrar para ${partes.destinatario}. Exemplo: ${definicao.uso}`,
    );
  }
  return { tipo: 'sussurro', destinatario: partes.destinatario, conteudo: partes.conteudo };
}

/** Sufixo escrito sem o número: `/r 1d20+11 cd`. */
export const MENSAGEM_CD_AUSENTE = 'Informe a CD depois de "cd". Ex.: /r 1d20+11 cd 18';

const COMANDO_ROLAGEM: DefinicaoComando = {
  tipo: 'rolagem',
  nome: 'rolar',
  aliases: ['r'],
  uso: '/r <expressão> [cd N] [# motivo]',
  descricao:
    'Rola dados na mesa. Ex.: /r 2d20kh1+5 # ataque com vantagem. Com "cd N", a mesa vê o grau de sucesso.',
  analisar: (argumento) => analisarRolagem(COMANDO_ROLAGEM, argumento),
};

const COMANDO_SUSSURRO: DefinicaoComando = {
  tipo: 'sussurro',
  nome: 'sussurro',
  aliases: ['s'],
  uso: '/sussurro @Nome mensagem',
  descricao: 'Fala em particular com um participante da mesa.',
  analisar: (argumento) => analisarSussurro(COMANDO_SUSSURRO, argumento),
};

const COMANDO_ROLAGEM_OCULTA: DefinicaoComando = {
  tipo: 'rolagem-oculta',
  nome: 'oculto',
  aliases: ['go', 'gm'],
  uso: '/oculto <expressão> [cd N] [# motivo]',
  descricao: 'Rolagem secreta do mestre: o resultado não chega aos jogadores.',
  analisar: (argumento) => analisarRolagem(COMANDO_ROLAGEM_OCULTA, argumento),
};

/**
 * Os comandos existentes. **Esta lista é o ponto de extensão**: acrescentar uma
 * entrada aqui faz o parser, a ajuda do chat e a mensagem de comando
 * desconhecido se atualizarem sozinhos.
 */
export const COMANDOS_CHAT: readonly DefinicaoComando[] = Object.freeze([
  COMANDO_ROLAGEM,
  COMANDO_SUSSURRO,
  COMANDO_ROLAGEM_OCULTA,
]);

/** Índice nome/alias → definição, em minúsculas (o parser não diferencia caixa). */
const INDICE_POR_NOME: ReadonlyMap<string, DefinicaoComando> = new Map(
  COMANDOS_CHAT.flatMap((definicao) =>
    [definicao.nome, ...definicao.aliases].map((nome) => [nome.toLowerCase(), definicao] as const),
  ),
);

/** Ajuda curta, usada no aviso de comando desconhecido e na dica do chat. */
export function listarUsosDeComandos(): string {
  return COMANDOS_CHAT.map((c) => c.uso).join(', ');
}

export function avisoComandoDesconhecido(nome: string): string {
  const alvo = nome ? `"/${nome}"` : 'Isso';
  return `${alvo} não é um comando. Disponíveis: ${listarUsosDeComandos()}.`;
}

/**
 * Interpreta uma linha digitada no chat.
 *
 * Só é comando o texto que **começa** com barra depois de trimado: "e/ou tanto
 * faz" é fala, e continua saindo com o texto intacto.
 */
export function interpretarComando(texto: string): ComandoChat {
  const limpo = texto.trim();
  if (!limpo.startsWith('/')) return { tipo: 'fala', conteudo: limpo };

  const semBarra = limpo.slice(1);
  const espaco = /\s/.exec(semBarra);
  const nome = espaco ? semBarra.slice(0, espaco.index) : semBarra;
  const argumento = espaco ? semBarra.slice(espaco.index).trim() : '';

  const definicao = INDICE_POR_NOME.get(nome.toLowerCase());
  if (!definicao) return { tipo: 'desconhecido', nome, aviso: avisoComandoDesconhecido(nome) };
  return definicao.analisar(argumento);
}

/** `true` quando o comando não deve ser enviado à mesa — só avisado ao autor. */
export function comandoEhAviso(
  comando: ComandoChat,
): comando is Extract<ComandoChat, { aviso: string }> {
  return comando.tipo === 'desconhecido' || comando.tipo === 'incompleto';
}

/**
 * Contrato de `POST /mesas/:mesaId/chat` (RV-074): a linha crua, como digitada.
 *
 * O cliente manda texto, nunca um tipo já decidido — se mandasse
 * `{ tipo: 'rolagem-oculta' }` o servidor estaria confiando no cliente para
 * classificar uma ação privilegiada.
 */
export const comandoChatSchema = z.object({
  mesaId: z.string().uuid(),
  texto: z.string().trim().min(1, 'Mensagem vazia').max(2000),
});
export type ComandoChatEntrada = z.infer<typeof comandoChatSchema>;
