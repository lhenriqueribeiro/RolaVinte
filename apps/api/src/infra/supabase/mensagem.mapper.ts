import type { ResultadoRolagem, TipoMensagem } from '@rolavinte/shared';
import type { Mensagem } from '../../dominio/jogo/mensagem';

export interface RowMensagem {
  id: string;
  mesa_id: string;
  autor_id: string | null;
  autor_nome: string;
  tipo: string;
  conteudo: string;
  rolagem: ResultadoRolagem | null;
  motivo: string | null;
  criado_em: string;
}

export function mensagemParaRow(m: Mensagem): RowMensagem {
  return {
    id: m.id,
    mesa_id: m.mesaId,
    autor_id: m.autorId,
    autor_nome: m.autorNome,
    tipo: m.tipo,
    conteudo: m.conteudo,
    rolagem: m.rolagem,
    motivo: m.motivo,
    criado_em: m.criadoEm.toISOString(),
  };
}

export function rowParaMensagemDTO(row: RowMensagem) {
  return {
    id: row.id,
    mesaId: row.mesa_id,
    autorId: row.autor_id,
    autorNome: row.autor_nome,
    tipo: row.tipo as TipoMensagem,
    conteudo: row.conteudo,
    rolagem: row.rolagem,
    motivo: row.motivo,
    criadoEm: row.criado_em,
  };
}
