import type { SupabaseClient } from '@supabase/supabase-js';
import type { JogadorDaMesaDTO, MesaDTO, PapelNaMesa, SistemaRpg } from '@rolavinte/shared';
import type { MesaRepository } from '../../aplicacao/ports/repositorios';
import type { Mesa } from '../../dominio/mesas/mesa';
import { garantirSemErro } from './cliente';
import {
  mesaParaRows,
  rowsParaMesa,
  type RowConvite,
  type RowMesa,
  type RowMesaJogador,
} from './mesa.mapper';

export class SupabaseMesaRepository implements MesaRepository {
  constructor(private readonly sb: SupabaseClient) {}

  /**
   * Persiste o agregado inteiro. Upsert sozinho não bastaria: remover um
   * participante (RV-021/RV-022) só apaga a linha do agregado em memória, e sem
   * o `delete` de sincronização o jogador reapareceria na próxima leitura.
   */
  async salvar(mesa: Mesa): Promise<void> {
    const rows = mesaParaRows(mesa);
    const { error: erroMesa } = await this.sb.from('mesas').upsert(rows.mesa);
    garantirSemErro('salvar mesa', erroMesa);

    if (rows.jogadores.length > 0) {
      const { error } = await this.sb.from('mesa_jogadores').upsert(rows.jogadores);
      garantirSemErro('salvar participantes', error);
    }
    await this.removerParticipantesAusentes(
      mesa.id,
      rows.jogadores.map((j) => j.usuario_id),
    );

    // Convites nunca somem do agregado — revogar muda o status (histórico preservado).
    if (rows.convites.length > 0) {
      const { error } = await this.sb.from('convites').upsert(rows.convites);
      garantirSemErro('salvar convites', error);
    }
  }

  /** Apaga as participações que não existem mais no agregado. */
  private async removerParticipantesAusentes(mesaId: string, usuarioIds: string[]): Promise<void> {
    const exclusao = this.sb.from('mesa_jogadores').delete().eq('mesa_id', mesaId);
    // PostgREST não tem `notIn` no builder: a lista vai como filtro literal.
    const { error } =
      usuarioIds.length > 0
        ? await exclusao.not('usuario_id', 'in', `(${usuarioIds.map((id) => `"${id}"`).join(',')})`)
        : await exclusao;
    garantirSemErro('sincronizar participantes', error);
  }

  async buscarPorId(id: string): Promise<Mesa | null> {
    const { data: mesa, error } = await this.sb
      .from('mesas')
      .select('id, nome, descricao, sistema, mestre_id, criado_em, encerrada_em')
      .eq('id', id)
      .maybeSingle();
    garantirSemErro('buscar mesa', error);
    if (!mesa) return null;
    return this.montarAgregado(mesa as RowMesa);
  }

  async buscarPorTokenConvite(token: string): Promise<Mesa | null> {
    const { data: convite, error } = await this.sb
      .from('convites')
      .select('mesa_id')
      .eq('token', token)
      .maybeSingle();
    garantirSemErro('buscar convite por token', error);
    if (!convite) return null;
    return this.buscarPorId((convite as RowConvite).mesa_id);
  }

  async listarDoUsuario(usuarioId: string): Promise<MesaDTO[]> {
    const { data: participacoes, error: erroPart } = await this.sb
      .from('mesa_jogadores')
      .select('mesa_id, papel')
      .eq('usuario_id', usuarioId);
    garantirSemErro('listar participações', erroPart);
    const parts = (participacoes ?? []) as { mesa_id: string; papel: PapelNaMesa }[];
    if (parts.length === 0) return [];

    const mesaIds = parts.map((p) => p.mesa_id);
    const [mesasRes, jogadoresRes] = await Promise.all([
      this.sb
        .from('mesas')
        .select('id, nome, descricao, sistema, mestre_id, criado_em, encerrada_em')
        .in('id', mesaIds),
      this.sb.from('mesa_jogadores').select('mesa_id, usuario_id').in('mesa_id', mesaIds),
    ]);
    garantirSemErro('listar mesas', mesasRes.error);
    garantirSemErro('contar jogadores', jogadoresRes.error);

    const mesas = (mesasRes.data ?? []) as RowMesa[];
    const jogadores = (jogadoresRes.data ?? []) as { mesa_id: string; usuario_id: string }[];

    const mestreIds = [...new Set(mesas.map((m) => m.mestre_id))];
    const { data: mestres, error: erroMestres } = await this.sb
      .from('usuarios')
      .select('id, nome')
      .in('id', mestreIds);
    garantirSemErro('buscar mestres', erroMestres);
    const nomePorId = new Map(
      ((mestres ?? []) as { id: string; nome: string }[]).map((u) => [u.id, u.nome]),
    );
    const papelPorMesa = new Map(parts.map((p) => [p.mesa_id, p.papel]));

    return mesas
      .map((m) => ({
        id: m.id,
        nome: m.nome,
        descricao: m.descricao,
        sistema: m.sistema as SistemaRpg,
        mestreId: m.mestre_id,
        mestreNome: nomePorId.get(m.mestre_id) ?? 'Mestre',
        meuPapel: papelPorMesa.get(m.id) ?? 'jogador',
        totalJogadores: jogadores.filter((j) => j.mesa_id === m.id).length,
        criadoEm: m.criado_em,
        encerradaEm: m.encerrada_em,
      }))
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  }

  async listarJogadores(mesaId: string): Promise<JogadorDaMesaDTO[]> {
    const { data, error } = await this.sb
      .from('mesa_jogadores')
      .select('usuario_id, papel, usuarios(nome)')
      .eq('mesa_id', mesaId);
    garantirSemErro('listar jogadores da mesa', error);
    const rows = (data ?? []) as unknown as {
      usuario_id: string;
      papel: PapelNaMesa;
      usuarios: { nome: string } | null;
    }[];
    return rows.map((r) => ({
      usuarioId: r.usuario_id,
      nome: r.usuarios?.nome ?? 'Jogador',
      papel: r.papel,
    }));
  }

  private async montarAgregado(mesa: RowMesa): Promise<Mesa> {
    const [jogadoresRes, convitesRes] = await Promise.all([
      this.sb
        .from('mesa_jogadores')
        .select('mesa_id, usuario_id, papel, entrou_em')
        .eq('mesa_id', mesa.id),
      this.sb
        .from('convites')
        .select('id, mesa_id, email, token, status, criado_em')
        .eq('mesa_id', mesa.id),
    ]);
    garantirSemErro('carregar participantes', jogadoresRes.error);
    garantirSemErro('carregar convites', convitesRes.error);
    return rowsParaMesa(
      mesa,
      (jogadoresRes.data ?? []) as RowMesaJogador[],
      (convitesRes.data ?? []) as RowConvite[],
    );
  }
}
