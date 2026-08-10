import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { Combate } from '../../dominio/jogo/combate';
import { SupabaseCombateRepository } from './combate-repository.supabase';

/**
 * O `FakeCombateRepository` regrava o agregado inteiro a cada `salvar`, então
 * remover um participante "funciona" nele por construção — é a F3 da taxonomia,
 * a mesma que deixou `mesa_jogadores` dessincronizada na v0.3.0 com a suíte
 * verde. Em produção quem decide é este adapter, e o que estes testes olham são
 * as operações que saem para o PostgREST.
 */

interface OperacaoRegistrada {
  tabela: string;
  verbo: 'upsert' | 'delete';
  linhas: unknown[];
  filtros: string[];
}

/** Construtor de consulta mínimo: encadeia como o supabase-js e é `await`-ável. */
class ConsultaFalsa implements PromiseLike<{ error: null }> {
  constructor(private readonly operacao: OperacaoRegistrada) {}

  eq(coluna: string, valor: unknown): this {
    this.operacao.filtros.push(`${coluna}=eq.${String(valor)}`);
    return this;
  }

  not(coluna: string, operador: string, valor: string): this {
    this.operacao.filtros.push(`${coluna}=not.${operador}.${valor}`);
    return this;
  }

  then<R1 = { error: null }, R2 = never>(
    aoResolver?: ((valor: { error: null }) => R1 | PromiseLike<R1>) | null,
    aoRejeitar?: ((motivo: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve({ error: null }).then(aoResolver, aoRejeitar);
  }
}

class ClienteFalso {
  readonly operacoes: OperacaoRegistrada[] = [];

  from(tabela: string) {
    const registrar = (verbo: 'upsert' | 'delete', linhas: unknown[]) => {
      const operacao: OperacaoRegistrada = { tabela, verbo, linhas, filtros: [] };
      this.operacoes.push(operacao);
      return new ConsultaFalsa(operacao);
    };
    return {
      upsert: (linhas: unknown) => registrar('upsert', Array.isArray(linhas) ? linhas : [linhas]),
      delete: () => registrar('delete', []),
    };
  }

  daTabela(tabela: string): OperacaoRegistrada[] {
    return this.operacoes.filter((o) => o.tabela === tabela);
  }
}

const MESA_ID = '11111111-1111-4111-8111-111111111111';
const CENA_ID = '22222222-2222-4222-8222-222222222222';
const COMBATE_ID = '33333333-3333-4333-8333-333333333333';
const TOKEN_A = '44444444-4444-4444-8444-444444444444';
const TOKEN_B = '55555555-5555-4555-8555-555555555555';

function combateComDois(): Combate {
  const criado = Combate.criar({
    id: COMBATE_ID,
    mesaId: MESA_ID,
    cenaId: CENA_ID,
    participantes: [
      { tokenId: TOKEN_A, nome: 'Valeros' },
      { tokenId: TOKEN_B, nome: 'Goblin' },
    ],
  });
  if (!criado.ok) throw new Error(`combate de teste inválido: ${criado.erro.mensagem}`);
  return criado.valor;
}

function montar(): { cliente: ClienteFalso; repositorio: SupabaseCombateRepository } {
  const cliente = new ClienteFalso();
  return {
    cliente,
    repositorio: new SupabaseCombateRepository(cliente as unknown as SupabaseClient),
  };
}

describe('SupabaseCombateRepository.salvar — sincronização de participantes', () => {
  it('apaga do banco o participante que saiu do agregado', async () => {
    const { cliente, repositorio } = montar();
    const combate = combateComDois();
    expect(combate.remover(TOKEN_B).ok).toBe(true);

    await repositorio.salvar(combate);

    const exclusoes = cliente.daTabela('combate_participantes').filter((o) => o.verbo === 'delete');
    expect(exclusoes).toHaveLength(1);
    // A asserção é o filtro EXATO. Um `delete` que só filtrasse por `combate_id`
    // apagaria os dois e o upsert seguinte recriaria ambos — parecendo certo até
    // alguém olhar o banco no meio da operação.
    expect(exclusoes[0]?.filtros).toEqual([
      `combate_id=eq.${COMBATE_ID}`,
      `token_id=not.in.("${TOKEN_A}")`,
    ]);
  });

  it('poupa exatamente quem continua no combate, e o delete vem antes do upsert', async () => {
    const { cliente, repositorio } = montar();

    await repositorio.salvar(combateComDois());

    const operacoes = cliente.daTabela('combate_participantes');
    // Delete primeiro: um token removido e readicionado na mesma sessão não pode
    // disputar o índice único (combate_id, ordem_desempate) com a linha antiga.
    expect(operacoes.map((o) => o.verbo)).toEqual(['delete', 'upsert']);
    expect(operacoes[0]?.filtros[1]).toBe(`token_id=not.in.("${TOKEN_A}","${TOKEN_B}")`);
    expect(operacoes[1]?.linhas).toHaveLength(2);
  });

  it('combate que ficou sem ninguém apaga todas as linhas, sem filtro de token', async () => {
    const { cliente, repositorio } = montar();
    const combate = combateComDois();
    expect(combate.remover(TOKEN_A).ok).toBe(true);
    expect(combate.remover(TOKEN_B).ok).toBe(true);

    await repositorio.salvar(combate);

    const operacoes = cliente.daTabela('combate_participantes');
    expect(operacoes.map((o) => o.verbo)).toEqual(['delete']);
    expect(operacoes[0]?.filtros).toEqual([`combate_id=eq.${COMBATE_ID}`]);
  });

  it('a linha do combate sobe antes dos filhos e leva rodada, turno e ativo', async () => {
    const { cliente, repositorio } = montar();
    const combate = combateComDois();
    expect(combate.definirIniciativa(TOKEN_A, 21).ok).toBe(true);
    expect(combate.definirIniciativa(TOKEN_B, 21).ok).toBe(true);
    expect(combate.proximoTurno().ok).toBe(true);
    expect(combate.proximoTurno()).toMatchObject({ ok: true, valor: { rodada: 2 } });

    await repositorio.salvar(combate);

    expect(cliente.operacoes[0]?.tabela).toBe('combates');
    const linha = cliente.daTabela('combates')[0]?.linhas[0] as Record<string, unknown>;
    expect(linha).toEqual({
      id: COMBATE_ID,
      mesa_id: MESA_ID,
      cena_id: CENA_ID,
      rodada: 2,
      indice_turno: 0,
      ativo: true,
    });
    // `criado_em` não sai do agregado: o `default now()` do banco é a verdade.
    expect(Object.keys(linha)).not.toContain('criado_em');
  });

  it('encerrar grava ativo=false, e não apaga o combate (histórico da luta)', async () => {
    const { cliente, repositorio } = montar();
    const combate = combateComDois();
    expect(combate.encerrar().ok).toBe(true);

    await repositorio.salvar(combate);

    expect(cliente.daTabela('combates').map((o) => o.verbo)).toEqual(['upsert']);
    const linha = cliente.daTabela('combates')[0]?.linhas[0] as { ativo: boolean };
    expect(linha.ativo).toBe(false);
  });

  it('a iniciativa vai como null quando ninguém rolou, e o desempate acompanha cada linha', async () => {
    const { cliente, repositorio } = montar();
    const combate = combateComDois();
    expect(combate.definirIniciativa(TOKEN_B, 14).ok).toBe(true);

    await repositorio.salvar(combate);

    const linhas = cliente.daTabela('combate_participantes').find((o) => o.verbo === 'upsert')
      ?.linhas as RegistroParticipante[];
    const porToken = new Map(linhas.map((l) => [l.token_id, l]));
    expect(porToken.get(TOKEN_A)?.iniciativa).toBeNull();
    expect(porToken.get(TOKEN_B)?.iniciativa).toBe(14);
    // Desempates distintos: é o que sustenta a ordem estável na leitura.
    expect(porToken.get(TOKEN_A)?.ordem_desempate).toBe(1);
    expect(porToken.get(TOKEN_B)?.ordem_desempate).toBe(2);
  });
});

interface RegistroParticipante {
  token_id: string;
  iniciativa: number | null;
  ordem_desempate: number;
}
