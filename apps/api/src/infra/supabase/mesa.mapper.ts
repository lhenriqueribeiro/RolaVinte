import type { PapelNaMesa, SistemaRpg } from '@rolavinte/shared';
import { Mesa, type Convite, type Participante } from '../../dominio/mesas/mesa';

export interface RowMesa {
  id: string;
  nome: string;
  descricao: string;
  sistema: string;
  mestre_id: string;
  criado_em: string;
  encerrada_em: string | null;
}

export interface RowMesaJogador {
  mesa_id: string;
  usuario_id: string;
  papel: string;
  entrou_em: string;
}

export interface RowConvite {
  id: string;
  mesa_id: string;
  email: string;
  token: string;
  status: string;
  criado_em: string;
}

export function rowsParaMesa(
  mesa: RowMesa,
  jogadores: RowMesaJogador[],
  convites: RowConvite[],
): Mesa {
  const participantes: Participante[] = jogadores.map((j) => ({
    usuarioId: j.usuario_id,
    papel: j.papel as PapelNaMesa,
    entrouEm: new Date(j.entrou_em),
  }));
  const convitesDominio: Convite[] = convites.map((c) => ({
    id: c.id,
    email: c.email,
    token: c.token,
    status: c.status as Convite['status'],
    criadoEm: new Date(c.criado_em),
  }));
  return Mesa.reconstituir({
    id: mesa.id,
    nome: mesa.nome,
    descricao: mesa.descricao,
    sistema: mesa.sistema as SistemaRpg,
    mestreId: mesa.mestre_id,
    participantes,
    convites: convitesDominio,
    criadoEm: new Date(mesa.criado_em),
    encerradaEm: mesa.encerrada_em ? new Date(mesa.encerrada_em) : null,
  });
}

export function mesaParaRows(mesa: Mesa): {
  mesa: RowMesa;
  jogadores: RowMesaJogador[];
  convites: RowConvite[];
} {
  return {
    mesa: {
      id: mesa.id,
      nome: mesa.nome,
      descricao: mesa.descricao,
      sistema: mesa.sistema,
      mestre_id: mesa.mestreId,
      criado_em: mesa.criadoEm.toISOString(),
      encerrada_em: mesa.encerradaEm?.toISOString() ?? null,
    },
    jogadores: mesa.participantes.map((p) => ({
      mesa_id: mesa.id,
      usuario_id: p.usuarioId,
      papel: p.papel,
      entrou_em: p.entrouEm.toISOString(),
    })),
    convites: mesa.convites.map((c) => ({
      id: c.id,
      mesa_id: mesa.id,
      email: c.email,
      token: c.token,
      status: c.status,
      criado_em: c.criadoEm.toISOString(),
    })),
  };
}
