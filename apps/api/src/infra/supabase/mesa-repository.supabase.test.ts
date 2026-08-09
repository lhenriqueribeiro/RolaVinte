import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { Mesa } from '../../dominio/mesas/mesa';
import { SupabaseMesaRepository } from './mesa-repository.supabase';

/**
 * O fake de `MesaRepository` regrava o agregado inteiro a cada `salvar`, então
 * remoção de participante "funciona" nele por construção. Em produção quem
 * decide é este adapter: se `salvar` só fizesse upsert, a linha de
 * `mesa_jogadores` do removido sobreviveria e ele voltaria na próxima leitura.
 * Estes testes olham as operações que saem para o PostgREST.
 */

interface OperacaoRegistrada {
  tabela: string;
  verbo: 'upsert' | 'delete';
  linhas: unknown[];
  filtros: string[];
}

/**
 * Construtor de consulta mínimo: encadeia como o supabase-js e é `await`-ável,
 * resolvendo sempre sem erro. Só registra o que foi pedido.
 */
class ConsultaFalsa implements PromiseLike<{ error: null }> {
  constructor(private readonly operacao: OperacaoRegistrada) {}

  eq(coluna: string, valor: string): this {
    this.operacao.filtros.push(`${coluna}=eq.${valor}`);
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

  /** Operações de uma tabela, na ordem em que foram emitidas. */
  daTabela(tabela: string): OperacaoRegistrada[] {
    return this.operacoes.filter((o) => o.tabela === tabela);
  }
}

const MESTRE_ID = '11111111-1111-4111-8111-111111111111';
const JOGADOR_ID = '22222222-2222-4222-8222-222222222222';
const MESA_ID = '33333333-3333-4333-8333-333333333333';
const AGORA = new Date('2026-08-09T12:00:00.000Z');

function mesaComJogador(): Mesa {
  const criada = Mesa.criar({
    id: MESA_ID,
    nome: 'A Maldição de Strahd',
    descricao: '',
    sistema: 'dnd5e',
    mestreId: MESTRE_ID,
    agora: AGORA,
  });
  if (!criada.ok) throw new Error('mesa de teste inválida');
  const mesa = criada.valor;

  const convite = mesa.convidar({
    solicitanteId: MESTRE_ID,
    nomeSolicitante: 'Mestre',
    emailConvidado: 'bruno@teste.local',
    conviteId: '44444444-4444-4444-8444-444444444444',
    tokenConvite: 'token-de-convite-1',
    agora: AGORA,
  });
  if (!convite.ok) throw new Error('convite de teste inválido');

  const aceite = mesa.aceitarConvite({
    token: 'token-de-convite-1',
    usuarioId: JOGADOR_ID,
    emailUsuario: 'bruno@teste.local',
    agora: AGORA,
  });
  if (!aceite.ok) throw new Error('aceite de teste inválido');
  return mesa;
}

function montar(): { cliente: ClienteFalso; repositorio: SupabaseMesaRepository } {
  const cliente = new ClienteFalso();
  return {
    cliente,
    repositorio: new SupabaseMesaRepository(cliente as unknown as SupabaseClient),
  };
}

describe('SupabaseMesaRepository.salvar — sincronização de participantes', () => {
  it('apaga as participações ausentes do agregado depois de remover o jogador', async () => {
    const { cliente, repositorio } = montar();
    const mesa = mesaComJogador();
    const removido = mesa.removerJogador(MESTRE_ID, JOGADOR_ID);
    expect(removido.ok).toBe(true);

    await repositorio.salvar(mesa);

    const exclusoes = cliente.daTabela('mesa_jogadores').filter((o) => o.verbo === 'delete');
    expect(exclusoes).toHaveLength(1);
    expect(exclusoes[0]?.filtros).toEqual([
      `mesa_id=eq.${MESA_ID}`,
      `usuario_id=not.in.("${MESTRE_ID}")`,
    ]);
  });

  it('mesma sincronização acontece na saída voluntária do jogador', async () => {
    const { cliente, repositorio } = montar();
    const mesa = mesaComJogador();
    const saiu = mesa.sair(JOGADOR_ID);
    expect(saiu.ok).toBe(true);

    await repositorio.salvar(mesa);

    const exclusoes = cliente.daTabela('mesa_jogadores').filter((o) => o.verbo === 'delete');
    expect(exclusoes).toHaveLength(1);
    expect(exclusoes[0]?.filtros[1]).toBe(`usuario_id=not.in.("${MESTRE_ID}")`);
  });

  it('preserva quem continua na mesa: o upsert vem antes da exclusão', async () => {
    const { cliente, repositorio } = montar();

    await repositorio.salvar(mesaComJogador());

    const operacoes = cliente.daTabela('mesa_jogadores');
    expect(operacoes.map((o) => o.verbo)).toEqual(['upsert', 'delete']);
    expect(operacoes[0]?.linhas).toHaveLength(2);
    // A exclusão poupa exatamente os dois participantes que acabaram de subir.
    expect(operacoes[1]?.filtros[1]).toBe(`usuario_id=not.in.("${MESTRE_ID}","${JOGADOR_ID}")`);
  });

  it('convite revogado é atualizado, nunca apagado (histórico preservado)', async () => {
    const { cliente, repositorio } = montar();
    const mesa = mesaComJogador();
    const outro = mesa.convidar({
      solicitanteId: MESTRE_ID,
      nomeSolicitante: 'Mestre',
      emailConvidado: 'ana@teste.local',
      conviteId: '55555555-5555-4555-8555-555555555555',
      tokenConvite: 'token-de-convite-2',
      agora: AGORA,
    });
    if (!outro.ok) throw new Error('convite de teste inválido');
    const revogado = mesa.revogarConvite(MESTRE_ID, outro.valor.id);
    expect(revogado.ok).toBe(true);

    await repositorio.salvar(mesa);

    const operacoes = cliente.daTabela('convites');
    expect(operacoes.map((o) => o.verbo)).toEqual(['upsert']);
    const linhas = operacoes[0]?.linhas as { id: string; status: string }[];
    expect(linhas).toHaveLength(2);
    expect(linhas.find((l) => l.id === outro.valor.id)?.status).toBe('revogado');
  });

  it('grava encerrada_em ao arquivar a mesa', async () => {
    const { cliente, repositorio } = montar();
    const mesa = mesaComJogador();
    const encerrada = mesa.encerrar(MESTRE_ID, AGORA);
    expect(encerrada.ok).toBe(true);

    await repositorio.salvar(mesa);

    const linhas = cliente.daTabela('mesas')[0]?.linhas as { encerrada_em: string | null }[];
    expect(linhas[0]?.encerrada_em).toBe(AGORA.toISOString());
  });
});
