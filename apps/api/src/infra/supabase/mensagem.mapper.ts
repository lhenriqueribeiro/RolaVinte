import type {
  AvaliacaoRolagem,
  MensagemDTO,
  ResultadoRolagem,
  TipoMensagem,
} from '@rolavinte/shared';
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
  /**
   * Grau de sucesso (RV-154); coluna `jsonb` **nullable** da migration `0010`.
   *
   * Toda mensagem gravada antes daquela migration volta daqui com `null`, e isso
   * não é erro: é "sem CD informada". Por isso a coluna nasceu sem `not null` e
   * sem valor padrão — um padrão aqui inventaria uma CD para o passado.
   */
  avaliacao: AvaliacaoRolagem | null;
  /** Sussurro (RV-070); `null` nos demais tipos. Migration `0005_chat.sql`. */
  destinatario_id: string | null;
  destinatario_nome: string | null;
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
    avaliacao: m.avaliacao,
    destinatario_id: m.destinatarioId,
    destinatario_nome: m.destinatarioNome,
    criado_em: m.criadoEm.toISOString(),
  };
}

export function rowParaMensagemDTO(row: RowMensagem): MensagemDTO {
  return {
    id: row.id,
    mesaId: row.mesa_id,
    autorId: row.autor_id,
    autorNome: row.autor_nome,
    tipo: row.tipo as TipoMensagem,
    conteudo: row.conteudo,
    rolagem: row.rolagem,
    motivo: row.motivo,
    // `?? null` porque uma linha lida antes da `0010` chega sem a chave: o
    // histórico antigo tem de renderizar, não de quebrar.
    avaliacao: row.avaliacao ?? null,
    destinatarioId: row.destinatario_id,
    destinatarioNome: row.destinatario_nome,
    criadoEm: row.criado_em,
  };
}
