import type { FastifyServerOptions } from 'fastify';

/**
 * Redação de segredos no log (guardrail 05-backend: "nunca logar senha, hash,
 * token ou corpo de email").
 *
 * A função é pura e recursiva de propósito: `redact` do pino casa caminhos
 * fixos (`req.headers.authorization`) e no máximo um nível de curinga, o que
 * não cobre um objeto arbitrário passado a `log.info({ ... })`. Aqui a varredura
 * é por *nome de chave*, em qualquer profundidade.
 */

/** Valor que substitui um segredo no log. */
export const CENSURA = '[redigido]';

/** Marca o ponto em que a varredura parou (protege contra ciclos). */
export const TRUNCADO = '[truncado]';

/** Profundidade máxima percorrida antes de truncar. */
const PROFUNDIDADE_MAXIMA = 8;

/**
 * Chaves cujo valor nunca pode aparecer no log, já normalizadas
 * (minúsculas, sem `_` e sem `-`): `senha_hash` e `senhaHash` casam com
 * `senhahash`.
 */
const CHAVES_SENSIVEIS = new Set([
  'authorization',
  'senha',
  'senhaatual',
  'senhahash',
  'novasenha',
  'confirmacaosenha',
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'jwt',
  'apikey',
  'secret',
  'segredo',
  'cookie',
  'setcookie',
]);

function normalizar(chave: string): string {
  return chave.toLowerCase().replace(/[_-]/g, '');
}

/** `true` quando o valor associado à chave é segredo e deve ser censurado. */
export function chaveSensivel(chave: string): boolean {
  return CHAVES_SENSIVEIS.has(normalizar(chave));
}

/**
 * Só objetos literais são percorridos. Instâncias (Error, Date, Buffer, o
 * `Request` do Fastify) passam intactas para não quebrar os serializers do pino.
 */
function ehObjetoSimples(valor: unknown): valor is Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null) return false;
  const prototipo: unknown = Object.getPrototypeOf(valor);
  return prototipo === Object.prototype || prototipo === null;
}

function redigirValor(valor: unknown, profundidade: number): unknown {
  if (profundidade > PROFUNDIDADE_MAXIMA) return TRUNCADO;
  if (Array.isArray(valor)) {
    return valor.map((item: unknown) => redigirValor(item, profundidade + 1));
  }
  if (!ehObjetoSimples(valor)) return valor;
  return percorrer(valor, profundidade);
}

function percorrer(objeto: Record<string, unknown>, profundidade: number): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(objeto)) {
    saida[chave] = chaveSensivel(chave) ? CENSURA : redigirValor(valor, profundidade + 1);
  }
  return saida;
}

/**
 * Devolve uma cópia do valor com todo segredo substituído por {@link CENSURA}.
 * Não muta a entrada — o objeto logado continua íntegro para a aplicação.
 */
export function redigirSegredos(valor: unknown): unknown {
  return redigirValor(valor, 0);
}

/** Formato exigido pelo `formatters.log` do pino. */
export function redigirObjetoDeLog(objeto: Record<string, unknown>): Record<string, unknown> {
  return percorrer(objeto, 0);
}

/**
 * Endurecimento aplicado a qualquer logger do servidor: o `redact` cobre os
 * caminhos que o pino monta sozinho (serializer de request) e o `formatters.log`
 * cobre tudo o que a aplicação passa como objeto de merge.
 */
export const OPCOES_LOG_SEGURO = {
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'headers.authorization',
      'headers.cookie',
    ],
    censor: CENSURA,
  },
  formatters: { log: redigirObjetoDeLog },
} satisfies Partial<NonNullable<Exclude<FastifyServerOptions['logger'], boolean>>>;

/**
 * Aplica {@link OPCOES_LOG_SEGURO} à configuração recebida pelo composition
 * root. `false`/ausente continua silenciando o logger (padrão dos testes).
 */
export function endurecerLogger(
  configuracao: FastifyServerOptions['logger'],
): FastifyServerOptions['logger'] {
  if (!configuracao) return false;
  if (configuracao === true) return OPCOES_LOG_SEGURO;
  return { ...configuracao, ...OPCOES_LOG_SEGURO };
}
