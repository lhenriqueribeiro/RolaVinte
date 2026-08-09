import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { TIPOS_MENSAGEM_RESTRITOS, type CursorMensagens } from '@rolavinte/shared';

import { SupabaseMensagemRepository } from './mensagem-repository.supabase';
import type { RowMensagem } from './mensagem.mapper';

/**
 * Privacidade (RV-070/RV-071) e paginação por cursor (RV-073) **no adapter**.
 *
 * O `FakeMensagemRepository` filtra com `mensagemVisivelPara` e ordena por
 * `(criadoEm, id)` em memória — ele é fiel, mas prova a *regra*, não a
 * *consulta*. Em produção quem decide o que sai do banco é a string de `or()`
 * montada aqui: um `eq` que vira `neq`, um `lt` que vira `lte`, um `or` que
 * troca de lugar com o `limit` ou um desempate que falta no `ORDER BY` entregam
 * segredo alheio, ou repetem uma mensagem em duas páginas, sem que nenhum teste
 * de caso de uso pisque (F3 da taxonomia de falhas).
 *
 * Por isso este arquivo faz duas coisas diferentes:
 *
 * 1. **Inspeciona** a consulta registrada (colunas, ordem dos passos, literais
 *    de tipo restrito). As asserções nomeiam `sussurro` e `rolagem-oculta` como
 *    literais de propósito: derivá-las do mesmo `Record` que o código usa faria
 *    o teste concordar com qualquer erro cometido lá.
 * 2. **Executa** a consulta registrada. O `AvaliadorPostgrest` abaixo é um
 *    segundo oráculo, independente do adapter: ele interpreta a árvore
 *    `and`/`or` que foi para o PostgREST e aplica ordem e limite sobre linhas
 *    de verdade. É o que permite provar que uma mensagem que chega entre a
 *    página 1 e a página 2 não duplica nem esconde registro — asserção que a
 *    inspeção de string sozinha não alcança.
 */

const MESA_ID = '33333333-3333-4333-8333-333333333333';
const SOLICITANTE_ID = '22222222-2222-4222-8222-222222222222';
const TERCEIRO_ID = '11111111-1111-4111-8111-111111111111';

const T1 = '2026-08-09T12:00:00.000Z';
const T2 = '2026-08-09T12:00:01.000Z';
const T3 = '2026-08-09T12:00:02.000Z';

/**
 * Ids de mensagem são UUID v4 — o adapter recusa qualquer outra coisa dentro do
 * cursor, então as fixturas não podem usar apelidos legíveis. A sequência
 * espelha o `GeradorIdSequencial`: ordem lexicográfica = ordem de criação, que
 * é justamente o desempate exercitado aqui. As asserções olham `conteudo`,
 * porque `00000000-0000-4000-8000-000000000003` não diz nada a quem lê.
 */
function uuid(sequencia: number): string {
  return `00000000-0000-4000-8000-${sequencia.toString().padStart(12, '0')}`;
}

/** Primeira página: limite dado, sem cursor. */
function primeira(limite: number) {
  return { limite, antesDe: null };
}

function anterioresA(mensagem: { criadoEm: string; id: string }, limite: number) {
  return { limite, antesDe: { antesDe: mensagem.criadoEm, antesDeId: mensagem.id } };
}

// ---------------------------------------------------------------------------
// Avaliador do filtro PostgREST — oráculo independente do adapter
// ---------------------------------------------------------------------------

type No =
  | { tipo: 'logico'; op: 'and' | 'or'; filhos: No[] }
  | { tipo: 'condicao'; coluna: string; op: string; valor: string }
  | { tipo: 'pertence'; coluna: string; valores: string[] };

/**
 * Analisa a gramática que o adapter emite: `and(...)`, `or(...)`,
 * `coluna.op.valor` e `coluna.in.(a,b,c)`. Estoura em qualquer coisa fora
 * disso — filtro que o avaliador não entende é filtro que ninguém revisou.
 */
function analisarOperando(texto: string, inicio: number): [No, number] {
  for (const op of ['and', 'or'] as const) {
    if (texto.startsWith(`${op}(`, inicio)) {
      const filhos: No[] = [];
      let i = inicio + op.length + 1;
      for (;;) {
        const [filho, proximo] = analisarOperando(texto, i);
        filhos.push(filho);
        if (texto[proximo] === ',') {
          i = proximo + 1;
          continue;
        }
        if (texto[proximo] === ')') return [{ tipo: 'logico', op, filhos }, proximo + 1];
        throw new Error(`filtro malformado na posição ${proximo}: ${texto}`);
      }
    }
  }

  const pontoColuna = texto.indexOf('.', inicio);
  const pontoOperador = texto.indexOf('.', pontoColuna + 1);
  if (pontoColuna < 0 || pontoOperador < 0) {
    throw new Error(`condição malformada na posição ${inicio}: ${texto}`);
  }
  const coluna = texto.slice(inicio, pontoColuna);
  const op = texto.slice(pontoColuna + 1, pontoOperador);
  const inicioValor = pontoOperador + 1;

  if (op === 'in') {
    const fim = texto.indexOf(')', inicioValor);
    const valores = texto
      .slice(inicioValor + 1, fim)
      .split(',')
      .filter((v) => v !== '');
    return [{ tipo: 'pertence', coluna, valores }, fim + 1];
  }

  let fim = inicioValor;
  while (fim < texto.length && texto[fim] !== ',' && texto[fim] !== ')') fim += 1;
  return [{ tipo: 'condicao', coluna, op, valor: texto.slice(inicioValor, fim) }, fim];
}

/** O conteúdo de `.or(X)` é a lista de operandos de um `or` — é assim que o PostgREST o lê. */
function analisarFiltroOr(filtro: string): No {
  const [no, fim] = analisarOperando(`or(${filtro})`, 0);
  if (fim !== filtro.length + 4) throw new Error(`sobrou texto no filtro: ${filtro}`);
  return no;
}

/** `criado_em` é timestamptz: comparação temporal, não lexicográfica. */
function comparar(coluna: string, esquerda: unknown, direita: string): number {
  if (coluna === 'criado_em') return Date.parse(String(esquerda)) - Date.parse(direita);
  return String(esquerda).localeCompare(direita);
}

function avaliar(no: No, linha: Record<string, unknown>): boolean {
  if (no.tipo === 'logico') {
    return no.op === 'and'
      ? no.filhos.every((f) => avaliar(f, linha))
      : no.filhos.some((f) => avaliar(f, linha));
  }
  if (no.tipo === 'pertence') return no.valores.includes(String(linha[no.coluna]));
  // Coluna nula nunca casa — `null = x` em SQL não é verdadeiro.
  if (linha[no.coluna] === null || linha[no.coluna] === undefined) return false;
  switch (no.op) {
    case 'eq':
      return comparar(no.coluna, linha[no.coluna], no.valor) === 0;
    case 'lt':
      return comparar(no.coluna, linha[no.coluna], no.valor) < 0;
    default:
      throw new Error(`operador não suportado pelo avaliador: ${no.op}`);
  }
}

// ---------------------------------------------------------------------------
// Cliente falso: registra a consulta e a executa sobre as linhas
// ---------------------------------------------------------------------------

interface ConsultaRegistrada {
  tabela: string;
  colunas: string;
  /** Passos na ordem exata em que o adapter os encadeou. */
  passos: string[];
  filtroOr: string | null;
  limite: number | null;
}

class ConsultaFalsa implements PromiseLike<{ data: RowMensagem[]; error: null }> {
  private readonly igualdades: [string, string][] = [];
  private readonly ordens: { coluna: string; ascendente: boolean }[] = [];

  constructor(
    private readonly consulta: ConsultaRegistrada,
    private readonly linhas: readonly RowMensagem[],
  ) {}

  eq(coluna: string, valor: string): this {
    this.consulta.passos.push(`eq:${coluna}=${valor}`);
    this.igualdades.push([coluna, valor]);
    return this;
  }

  or(filtro: string): this {
    this.consulta.passos.push('or');
    // Um `or` que sobrescreve outro seria privacidade perdida em silêncio: o
    // supabase-js faz `append`, então dois filtros são dois parâmetros — e o
    // adapter é escrito para emitir um só.
    if (this.consulta.filtroOr !== null) {
      throw new Error('o adapter emitiu dois filtros `or`; o avaliador só lê um.');
    }
    this.consulta.filtroOr = filtro;
    return this;
  }

  order(coluna: string, opcoes: { ascending: boolean }): this {
    this.consulta.passos.push(`order:${coluna}:${opcoes.ascending ? 'asc' : 'desc'}`);
    this.ordens.push({ coluna, ascendente: opcoes.ascending });
    return this;
  }

  limit(valor: number): this {
    this.consulta.passos.push('limit');
    this.consulta.limite = valor;
    return this;
  }

  /** Executa o que foi registrado: filtros → ordem → limite, como o Postgres. */
  private executar(): RowMensagem[] {
    const arvore =
      this.consulta.filtroOr === null ? null : analisarFiltroOr(this.consulta.filtroOr);
    const selecionadas = this.linhas.filter((linha) => {
      const registro = linha as unknown as Record<string, unknown>;
      const casaIgualdades = this.igualdades.every(([coluna, valor]) => registro[coluna] === valor);
      return casaIgualdades && (arvore === null || avaliar(arvore, registro));
    });

    const ordenadas = [...selecionadas].sort((a, b) => {
      for (const { coluna, ascendente } of this.ordens) {
        const registroA = a as unknown as Record<string, unknown>;
        const registroB = b as unknown as Record<string, unknown>;
        const diferenca = comparar(coluna, registroA[coluna], String(registroB[coluna]));
        if (diferenca !== 0) return ascendente ? diferenca : -diferenca;
      }
      return 0;
    });

    return this.consulta.limite === null ? ordenadas : ordenadas.slice(0, this.consulta.limite);
  }

  then<R1 = { data: RowMensagem[]; error: null }, R2 = never>(
    aoResolver?: ((valor: { data: RowMensagem[]; error: null }) => R1 | PromiseLike<R1>) | null,
    aoRejeitar?: ((motivo: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve({ data: this.executar(), error: null }).then(aoResolver, aoRejeitar);
  }
}

class ClienteFalso {
  readonly consultas: ConsultaRegistrada[] = [];
  /** Mutável de propósito: mensagem nova chega entre uma página e a seguinte. */
  readonly linhas: RowMensagem[];

  constructor(linhas: RowMensagem[] = []) {
    this.linhas = linhas;
  }

  from(tabela: string) {
    return {
      select: (colunas: string) => {
        const consulta: ConsultaRegistrada = {
          tabela,
          colunas,
          passos: [],
          filtroOr: null,
          limite: null,
        };
        this.consultas.push(consulta);
        return new ConsultaFalsa(consulta, this.linhas);
      },
    };
  }
}

function linha(parcial: Partial<RowMensagem> & Pick<RowMensagem, 'id' | 'criado_em'>): RowMensagem {
  return {
    mesa_id: MESA_ID,
    autor_id: TERCEIRO_ID,
    autor_nome: 'Aria',
    tipo: 'fala',
    conteudo: 'olá',
    rolagem: null,
    motivo: null,
    destinatario_id: null,
    destinatario_nome: null,
    ...parcial,
  };
}

function montar(linhas: RowMensagem[] = []) {
  const cliente = new ClienteFalso(linhas);
  return {
    cliente,
    repositorio: new SupabaseMensagemRepository(cliente as unknown as SupabaseClient),
  };
}

/** A lista de tipos de dentro de `tipo.in.(…)` do filtro que foi para o PostgREST. */
function tiposPublicosNaConsulta(filtroOr: string): string[] {
  const encontrado = /tipo\.in\.\(([^)]*)\)/.exec(filtroOr);
  if (!encontrado) throw new Error(`filtro sem "tipo.in.(…)": ${filtroOr}`);
  return encontrado[1]!.split(',').filter((t) => t !== '');
}

describe('SupabaseMensagemRepository.listarDaMesa — o filtro que sai para o PostgREST', () => {
  it('restringe à mesa e aos três eixos de visibilidade', async () => {
    const { cliente, repositorio } = montar();

    await repositorio.listarDaMesa(MESA_ID, SOLICITANTE_ID, primeira(100));

    const consulta = cliente.consultas[0]!;
    expect(consulta.tabela).toBe('mensagens');
    expect(consulta.passos).toContain(`eq:mesa_id=${MESA_ID}`);
    expect(consulta.filtroOr).toContain(`autor_id.eq.${SOLICITANTE_ID}`);
    expect(consulta.filtroOr).toContain(`destinatario_id.eq.${SOLICITANTE_ID}`);
  });

  it('nenhum tipo restrito entra na lista de públicos da consulta', async () => {
    const { cliente, repositorio } = montar();

    await repositorio.listarDaMesa(MESA_ID, SOLICITANTE_ID, primeira(100));

    const publicos = tiposPublicosNaConsulta(cliente.consultas[0]!.filtroOr!);
    // Literais de propósito — ver o cabeçalho deste arquivo.
    expect(publicos).not.toContain('sussurro');
    expect(publicos).not.toContain('rolagem-oculta');
    expect(publicos).toEqual(['fala', 'rolagem', 'sistema']);
    // E o contrato compartilhado concorda sobre quais são os restritos.
    expect([...TIPOS_MENSAGEM_RESTRITOS].sort()).toEqual(['rolagem-oculta', 'sussurro']);
  });

  it('o filtro de visibilidade é aplicado ANTES do limite', async () => {
    const { cliente, repositorio } = montar();

    await repositorio.listarDaMesa(MESA_ID, SOLICITANTE_ID, primeira(100));

    const passos = cliente.consultas[0]!.passos;
    expect(passos.indexOf('or')).toBeGreaterThanOrEqual(0);
    expect(passos.indexOf('or')).toBeLessThan(passos.indexOf('limit'));
    expect(cliente.consultas[0]!.limite).toBe(100);
  });

  it('lista as colunas em vez de select(*) e traz o destinatário do sussurro', async () => {
    const { cliente, repositorio } = montar();

    await repositorio.listarDaMesa(MESA_ID, SOLICITANTE_ID, primeira(100));

    const colunas = cliente.consultas[0]!.colunas;
    expect(colunas).not.toContain('*');
    expect(colunas).toContain('destinatario_id');
    expect(colunas).toContain('conteudo');
  });

  it('identificador fora do formato UUID não vira consulta nenhuma', async () => {
    // Um id com vírgula reescreveria a expressão do `or` e derrubaria o filtro
    // inteiro: melhor estourar do que consultar sem privacidade.
    const { cliente, repositorio } = montar();

    await expect(
      repositorio.listarDaMesa(MESA_ID, `${SOLICITANTE_ID},tipo.in.(sussurro)`, primeira(100)),
    ).rejects.toThrow(/UUID/);
    expect(cliente.consultas).toEqual([]);
  });

  it('cursor fora do formato não vira consulta nenhuma', async () => {
    const { cliente, repositorio } = montar();

    const cursorEnvenenado: CursorMensagens = {
      antesDe: T1,
      antesDeId: `${MESA_ID}),or(tipo.in.(sussurro`,
    };
    await expect(
      repositorio.listarDaMesa(MESA_ID, SOLICITANTE_ID, { limite: 10, antesDe: cursorEnvenenado }),
    ).rejects.toThrow(/cursor/);

    await expect(
      repositorio.listarDaMesa(MESA_ID, SOLICITANTE_ID, {
        limite: 10,
        antesDe: { antesDe: 'ontem', antesDeId: TERCEIRO_ID },
      }),
    ).rejects.toThrow(/cursor/);

    expect(cliente.consultas).toEqual([]);
  });

  it('devolve o histórico em ordem cronológica, invertendo o desc da consulta', async () => {
    const { cliente, repositorio } = montar([
      linha({ id: 'b-nova', criado_em: T2 }),
      linha({ id: 'a-antiga', criado_em: T1 }),
    ]);

    const historico = await repositorio.listarDaMesa(MESA_ID, SOLICITANTE_ID, primeira(100));

    expect(cliente.consultas[0]!.passos).toContain('order:criado_em:desc');
    expect(historico.map((m) => m.id)).toEqual(['a-antiga', 'b-nova']);
  });

  it('desempata pelo id no ORDER BY, e não só pelo instante', async () => {
    // Sem o segundo `order`, o Postgres pode devolver mensagens do mesmo
    // instante em qualquer ordem — e a mesma linha cai em duas páginas.
    const { cliente, repositorio } = montar();

    await repositorio.listarDaMesa(MESA_ID, SOLICITANTE_ID, primeira(100));

    const passos = cliente.consultas[0]!.passos;
    expect(passos.indexOf('order:criado_em:desc')).toBeGreaterThanOrEqual(0);
    expect(passos.indexOf('order:id:desc')).toBe(passos.indexOf('order:criado_em:desc') + 1);
  });

  it('a primeira página não carrega condição de cursor', async () => {
    const { cliente, repositorio } = montar();

    await repositorio.listarDaMesa(MESA_ID, SOLICITANTE_ID, primeira(50));

    expect(cliente.consultas[0]!.filtroOr).not.toContain('criado_em');
  });
});

describe('paginação por cursor (RV-073) — executando a consulta registrada', () => {
  /** Quatro mensagens no MESMO instante: o pior caso do desempate. */
  function mesaEmpatada() {
    return montar([
      linha({ id: uuid(1), criado_em: T1, conteudo: 'primeira' }),
      linha({ id: uuid(2), criado_em: T1, conteudo: 'segunda' }),
      linha({ id: uuid(3), criado_em: T1, conteudo: 'terceira' }),
      linha({ id: uuid(4), criado_em: T1, conteudo: 'quarta' }),
    ]);
  }

  it('mensagem nova entre a página 1 e a página 2 não duplica nem esconde registro', async () => {
    const { cliente, repositorio } = mesaEmpatada();

    const pagina1 = await repositorio.listarDaMesa(MESA_ID, SOLICITANTE_ID, primeira(2));
    expect(pagina1.map((m) => m.conteudo)).toEqual(['terceira', 'quarta']);

    // Chega gente falando enquanto o jogador lê o histórico — inclusive uma
    // mensagem no mesmíssimo instante das outras, que é onde o `offset` quebra.
    cliente.linhas.push(linha({ id: uuid(5), criado_em: T1, conteudo: 'quinta' }));
    cliente.linhas.push(linha({ id: uuid(6), criado_em: T2, conteudo: 'sexta' }));

    const pagina2 = await repositorio.listarDaMesa(
      MESA_ID,
      SOLICITANTE_ID,
      anterioresA(pagina1[0]!, 2),
    );

    expect(pagina2.map((m) => m.conteudo)).toEqual(['primeira', 'segunda']);
    // Nada repetido entre as páginas, e nada do histórico original perdido.
    const carregadas = [...pagina2, ...pagina1];
    expect(new Set(carregadas.map((m) => m.id)).size).toBe(carregadas.length);
    expect(carregadas.map((m) => m.conteudo)).toEqual([
      'primeira',
      'segunda',
      'terceira',
      'quarta',
    ]);
    // O que chegou depois não se infiltra numa página de histórico antigo.
    expect(carregadas.map((m) => m.conteudo)).not.toContain('quinta');
    expect(carregadas.map((m) => m.conteudo)).not.toContain('sexta');
  });

  it('o cursor exclui a própria mensagem apontada, mesmo com instantes iguais', async () => {
    const { repositorio } = mesaEmpatada();

    const pagina = await repositorio.listarDaMesa(MESA_ID, SOLICITANTE_ID, {
      limite: 10,
      antesDe: { antesDe: T1, antesDeId: uuid(3) },
    });

    expect(pagina.map((m) => m.conteudo)).toEqual(['primeira', 'segunda']);
  });

  it('esgotado o histórico, a página seguinte vem vazia', async () => {
    const { repositorio } = mesaEmpatada();

    const pagina = await repositorio.listarDaMesa(MESA_ID, SOLICITANTE_ID, {
      limite: 10,
      antesDe: { antesDe: T1, antesDeId: uuid(1) },
    });

    expect(pagina).toEqual([]);
  });

  it('o limite recorta a janela e é o número pedido', async () => {
    const { cliente, repositorio } = mesaEmpatada();

    const pagina = await repositorio.listarDaMesa(MESA_ID, SOLICITANTE_ID, primeira(3));

    expect(pagina).toHaveLength(3);
    expect(cliente.consultas[0]!.limite).toBe(3);
  });
});

describe('a paginação não afrouxa a privacidade (RV-070/RV-071 + RV-073)', () => {
  const DONO_DO_SEGREDO = SOLICITANTE_ID;

  /** Histórico intercalado: público, sussurro alheio, público, oculta alheia… */
  function mesaComSegredos() {
    return montar([
      linha({ id: uuid(1), criado_em: T1, conteudo: 'bom dia' }),
      linha({
        id: uuid(2),
        criado_em: T1,
        tipo: 'sussurro',
        conteudo: 'plano secreto',
        autor_id: DONO_DO_SEGREDO,
        destinatario_id: DONO_DO_SEGREDO,
        destinatario_nome: 'Aria',
      }),
      linha({ id: uuid(3), criado_em: T2, conteudo: 'abro a porta' }),
      linha({
        id: uuid(4),
        criado_em: T2,
        tipo: 'rolagem-oculta',
        conteudo: 'percepção',
        autor_id: DONO_DO_SEGREDO,
      }),
      linha({ id: uuid(5), criado_em: T3, conteudo: 'boa noite' }),
    ]);
  }

  it('o terceiro pagina o histórico inteiro sem tocar em mensagem privada', async () => {
    const { repositorio } = mesaComSegredos();

    const pagina1 = await repositorio.listarDaMesa(MESA_ID, TERCEIRO_ID, primeira(2));
    const pagina2 = await repositorio.listarDaMesa(
      MESA_ID,
      TERCEIRO_ID,
      anterioresA(pagina1[0]!, 2),
    );

    expect(pagina1.map((m) => m.conteudo)).toEqual(['abro a porta', 'boa noite']);
    expect(pagina2.map((m) => m.conteudo)).toEqual(['bom dia']);
    const tudo = [...pagina2, ...pagina1];
    expect(tudo.map((m) => m.tipo)).toEqual(['fala', 'fala', 'fala']);
    expect(JSON.stringify(tudo)).not.toContain('plano secreto');
    expect(JSON.stringify(tudo)).not.toContain('percepção');
  });

  it('a página do terceiro vem cheia: o segredo alheio não ocupa vaga na janela', async () => {
    // Se o limite fosse aplicado antes do filtro, `pub-2` e `pub-3` viriam
    // acompanhados de duas linhas descartadas depois — e a página chegaria com
    // metade do tamanho pedido, um buraco de onde se infere que há algo ali.
    const { repositorio } = mesaComSegredos();

    const pagina = await repositorio.listarDaMesa(MESA_ID, TERCEIRO_ID, primeira(3));

    expect(pagina.map((m) => m.conteudo)).toEqual(['bom dia', 'abro a porta', 'boa noite']);
  });

  it('o fim do histórico do terceiro é o fim do que ele vê, sem página fantasma', async () => {
    // É esta contagem que diz ao cliente se vale pedir mais uma página: ela
    // conta mensagens visíveis, então ninguém deduz privado de página curta.
    const { repositorio } = montar([
      linha({
        id: uuid(1),
        criado_em: T1,
        tipo: 'sussurro',
        conteudo: 'plano secreto',
        autor_id: DONO_DO_SEGREDO,
        destinatario_id: DONO_DO_SEGREDO,
      }),
      linha({
        id: uuid(2),
        criado_em: T2,
        tipo: 'rolagem-oculta',
        conteudo: 'percepção',
        autor_id: DONO_DO_SEGREDO,
      }),
      linha({ id: uuid(3), criado_em: T3, conteudo: 'boa noite' }),
    ]);

    const pagina1 = await repositorio.listarDaMesa(MESA_ID, TERCEIRO_ID, primeira(2));
    expect(pagina1.map((m) => m.conteudo)).toEqual(['boa noite']);
    // Página menor que o limite = acabou. E se o cliente insistir, vem vazia.
    expect(pagina1.length).toBeLessThan(2);
    expect(
      await repositorio.listarDaMesa(MESA_ID, TERCEIRO_ID, anterioresA(pagina1[0]!, 2)),
    ).toEqual([]);
  });

  it('autor e destinatário continuam vendo o que é deles nas páginas antigas', async () => {
    const { repositorio } = mesaComSegredos();

    const pagina1 = await repositorio.listarDaMesa(MESA_ID, DONO_DO_SEGREDO, primeira(2));
    const pagina2 = await repositorio.listarDaMesa(
      MESA_ID,
      DONO_DO_SEGREDO,
      anterioresA(pagina1[0]!, 3),
    );

    expect(pagina1.map((m) => m.conteudo)).toEqual(['percepção', 'boa noite']);
    expect(pagina2.map((m) => m.conteudo)).toEqual(['bom dia', 'plano secreto', 'abro a porta']);
  });
});
