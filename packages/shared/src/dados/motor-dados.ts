/**
 * Motor de dados do RolaVinte.
 *
 * Gramática suportada (case-insensitive, espaços ignorados):
 *   expressao := termo (('+'|'-') termo)*
 *   termo     := dados | inteiro
 *   dados     := [N]'d'F [('kh'|'kl') K]
 *
 * Exemplos: "d20", "2d6+3", "4d6kh3", "2d20kl1+5", "1d8+1d6-2"
 *
 * Função pura com RNG injetável — determinística em testes.
 */

export type Rng = () => number;

export const LIMITES_DADOS = {
  maxDadosPorTermo: 100,
  maxFaces: 1000,
  minFaces: 2,
  maxTermos: 20,
} as const;

export interface DadoRolado {
  valor: number;
  descartado: boolean;
}

export type TermoAvaliado =
  | {
      tipo: 'dados';
      sinal: 1 | -1;
      quantidade: number;
      faces: number;
      manter?: { modo: 'kh' | 'kl'; quantidade: number };
      dados: DadoRolado[];
      subtotal: number;
    }
  | { tipo: 'constante'; sinal: 1 | -1; valor: number; subtotal: number };

export interface ResultadoRolagem {
  expressao: string;
  termos: TermoAvaliado[];
  total: number;
}

export type SaidaRolagem = { ok: true; resultado: ResultadoRolagem } | { ok: false; erro: string };

const REGEX_DADOS = /^(\d*)d(\d+)(?:(kh|kl)(\d+))?$/i;
const REGEX_CONSTANTE = /^\d+$/;

interface TermoBruto {
  sinal: 1 | -1;
  corpo: string;
}

function tokenizar(expressao: string): TermoBruto[] | string {
  const limpa = expressao.replace(/\s+/g, '').toLowerCase();
  if (limpa.length === 0) return 'Expressão vazia.';
  if (limpa.length > 200) return 'Expressão longa demais.';
  const termos: TermoBruto[] = [];
  let sinal: 1 | -1 = 1;
  let corpo = '';
  for (const ch of limpa) {
    if (ch === '+' || ch === '-') {
      if (corpo === '') {
        if (termos.length === 0 && ch === '-') {
          sinal = -1;
          continue;
        }
        return `Operador "${ch}" sem termo antes.`;
      }
      termos.push({ sinal, corpo });
      sinal = ch === '+' ? 1 : -1;
      corpo = '';
    } else {
      corpo += ch;
    }
  }
  if (corpo === '') return 'Expressão termina em operador.';
  termos.push({ sinal, corpo });
  if (termos.length > LIMITES_DADOS.maxTermos) return 'Termos demais na expressão.';
  return termos;
}

function rolarDado(faces: number, rng: Rng): number {
  return Math.floor(rng() * faces) + 1;
}

export function rolarExpressao(expressao: string, rng: Rng = Math.random): SaidaRolagem {
  const tokens = tokenizar(expressao);
  if (typeof tokens === 'string') return { ok: false, erro: tokens };

  const termos: TermoAvaliado[] = [];
  for (const { sinal, corpo } of tokens) {
    if (REGEX_CONSTANTE.test(corpo)) {
      const valor = Number(corpo);
      if (!Number.isSafeInteger(valor)) return { ok: false, erro: `Constante inválida: ${corpo}` };
      termos.push({ tipo: 'constante', sinal, valor, subtotal: sinal * valor });
      continue;
    }

    const m = REGEX_DADOS.exec(corpo);
    if (!m) return { ok: false, erro: `Termo inválido: "${corpo}"` };
    const quantidade = m[1] === '' ? 1 : Number(m[1]);
    const faces = Number(m[2]);
    if (quantidade < 1 || quantidade > LIMITES_DADOS.maxDadosPorTermo) {
      return {
        ok: false,
        erro: `Quantidade de dados deve ser 1..${LIMITES_DADOS.maxDadosPorTermo}.`,
      };
    }
    if (faces < LIMITES_DADOS.minFaces || faces > LIMITES_DADOS.maxFaces) {
      return {
        ok: false,
        erro: `Faces devem ser ${LIMITES_DADOS.minFaces}..${LIMITES_DADOS.maxFaces}.`,
      };
    }

    let manter: { modo: 'kh' | 'kl'; quantidade: number } | undefined;
    if (m[3] !== undefined && m[4] !== undefined) {
      const modo = m[3].toLowerCase() as 'kh' | 'kl';
      const qtdManter = Number(m[4]);
      if (qtdManter < 1 || qtdManter > quantidade) {
        return {
          ok: false,
          erro: `"${m[3]}${m[4]}" precisa manter entre 1 e ${quantidade} dados.`,
        };
      }
      manter = { modo, quantidade: qtdManter };
    }

    const valores = Array.from({ length: quantidade }, () => rolarDado(faces, rng));
    const dados: DadoRolado[] = valores.map((valor) => ({ valor, descartado: false }));

    if (manter) {
      const indicesOrdenados = dados
        .map((d, i) => ({ i, valor: d.valor }))
        .sort((a, b) => (manter.modo === 'kh' ? b.valor - a.valor : a.valor - b.valor))
        .map((x) => x.i);
      const mantidos = new Set(indicesOrdenados.slice(0, manter.quantidade));
      dados.forEach((d, i) => {
        d.descartado = !mantidos.has(i);
      });
    }

    const subtotalDados = dados.filter((d) => !d.descartado).reduce((s, d) => s + d.valor, 0);
    termos.push({
      tipo: 'dados',
      sinal,
      quantidade,
      faces,
      ...(manter ? { manter } : {}),
      dados,
      subtotal: sinal * subtotalDados,
    });
  }

  const total = termos.reduce((s, t) => s + t.subtotal, 0);
  return {
    ok: true,
    resultado: { expressao: expressao.replace(/\s+/g, '').toLowerCase(), termos, total },
  };
}

/** Valida sem rolar (usado pelo VO ExpressaoDados no domínio). */
export function validarExpressao(expressao: string): { ok: true } | { ok: false; erro: string } {
  const saida = rolarExpressao(expressao, () => 0.5);
  return saida.ok ? { ok: true } : saida;
}
