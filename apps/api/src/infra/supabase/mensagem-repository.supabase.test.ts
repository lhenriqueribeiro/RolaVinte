import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { TIPOS_MENSAGEM_RESTRITOS } from '@rolavinte/shared';

import { SupabaseMensagemRepository } from './mensagem-repository.supabase';
import type { RowMensagem } from './mensagem.mapper';

/**
 * Privacidade de sussurro e rolagem oculta **no adapter** (RV-070/RV-071).
 *
 * O `FakeMensagemRepository` filtra com `mensagemVisivelPara`, o mesmo predicado
 * que o domínio usa — ele é fiel, mas prova a regra, não a *consulta*. Em
 * produção quem decide o que sai do banco é a string de `or()` montada aqui: um
 * `eq` que vira `neq`, um `or` que troca de lugar com o `limit`, ou um tipo
 * restrito que escorrega para a lista de públicos entregam segredo alheio sem
 * que nenhum teste de caso de uso pisque (F3 da taxonomia de falhas).
 *
 * Por isso as asserções abaixo nomeiam `sussurro` e `rolagem-oculta` **como
 * literais**: derivá-las do mesmo `Record` que o código usa faria o teste
 * concordar com qualquer erro cometido lá. Aqui o teste é um segundo oráculo.
 */

const MESA_ID = '33333333-3333-4333-8333-333333333333';
const SOLICITANTE_ID = '22222222-2222-4222-8222-222222222222';
const TERCEIRO_ID = '11111111-1111-4111-8111-111111111111';

interface ConsultaRegistrada {
  tabela: string;
  colunas: string;
  /** Passos na ordem exata em que o adapter os encadeou. */
  passos: string[];
  filtroOr: string | null;
  limite: number | null;
}

/** Construtor de consulta mínimo: encadeia como o supabase-js e é `await`-ável. */
class ConsultaFalsa implements PromiseLike<{ data: RowMensagem[]; error: null }> {
  constructor(
    private readonly consulta: ConsultaRegistrada,
    private readonly linhas: RowMensagem[],
  ) {}

  eq(coluna: string, valor: string): this {
    this.consulta.passos.push(`eq:${coluna}=${valor}`);
    return this;
  }

  or(filtro: string): this {
    this.consulta.passos.push('or');
    this.consulta.filtroOr = filtro;
    return this;
  }

  order(coluna: string, opcoes: { ascending: boolean }): this {
    this.consulta.passos.push(`order:${coluna}:${opcoes.ascending ? 'asc' : 'desc'}`);
    return this;
  }

  limit(valor: number): this {
    this.consulta.passos.push('limit');
    this.consulta.limite = valor;
    return this;
  }

  then<R1 = { data: RowMensagem[]; error: null }, R2 = never>(
    aoResolver?: ((valor: { data: RowMensagem[]; error: null }) => R1 | PromiseLike<R1>) | null,
    aoRejeitar?: ((motivo: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve({ data: this.linhas, error: null }).then(aoResolver, aoRejeitar);
  }
}

class ClienteFalso {
  readonly consultas: ConsultaRegistrada[] = [];

  constructor(private readonly linhas: RowMensagem[] = []) {}

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

    await repositorio.listarDaMesa(MESA_ID, SOLICITANTE_ID, 100);

    const consulta = cliente.consultas[0]!;
    expect(consulta.tabela).toBe('mensagens');
    expect(consulta.passos).toContain(`eq:mesa_id=${MESA_ID}`);
    expect(consulta.filtroOr).toContain(`autor_id.eq.${SOLICITANTE_ID}`);
    expect(consulta.filtroOr).toContain(`destinatario_id.eq.${SOLICITANTE_ID}`);
  });

  it('nenhum tipo restrito entra na lista de públicos da consulta', async () => {
    const { cliente, repositorio } = montar();

    await repositorio.listarDaMesa(MESA_ID, SOLICITANTE_ID, 100);

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

    await repositorio.listarDaMesa(MESA_ID, SOLICITANTE_ID, 100);

    const passos = cliente.consultas[0]!.passos;
    expect(passos.indexOf('or')).toBeGreaterThanOrEqual(0);
    expect(passos.indexOf('or')).toBeLessThan(passos.indexOf('limit'));
    expect(cliente.consultas[0]!.limite).toBe(100);
  });

  it('lista as colunas em vez de select(*) e traz o destinatário do sussurro', async () => {
    const { cliente, repositorio } = montar();

    await repositorio.listarDaMesa(MESA_ID, SOLICITANTE_ID, 100);

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
      repositorio.listarDaMesa(MESA_ID, `${SOLICITANTE_ID},tipo.in.(sussurro)`, 100),
    ).rejects.toThrow(/UUID/);
    expect(cliente.consultas).toEqual([]);
  });

  it('devolve o histórico em ordem cronológica, invertendo o desc da consulta', async () => {
    const { cliente, repositorio } = montar([
      linha({ id: 'nova', criado_em: '2026-08-09T12:00:02.000Z' }),
      linha({ id: 'antiga', criado_em: '2026-08-09T12:00:01.000Z' }),
    ]);

    const historico = await repositorio.listarDaMesa(MESA_ID, SOLICITANTE_ID, 100);

    expect(cliente.consultas[0]!.passos).toContain('order:criado_em:desc');
    expect(historico.map((m) => m.id)).toEqual(['antiga', 'nova']);
  });
});
