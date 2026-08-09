import type { Atributos } from '@rolavinte/shared';
import { Personagem } from '../../dominio/personagens/personagem';

export interface RowPersonagem {
  id: string;
  mesa_id: string;
  dono_id: string;
  nome: string;
  classe: string;
  nivel: number;
  pv_atual: number;
  pv_max: number;
  atributos: Atributos;
  anotacoes: string;
}

export function rowParaPersonagem(row: RowPersonagem): Personagem {
  return Personagem.reconstituir({
    id: row.id,
    mesaId: row.mesa_id,
    donoId: row.dono_id,
    nome: row.nome,
    classe: row.classe,
    nivel: row.nivel,
    pvAtual: row.pv_atual,
    pvMax: row.pv_max,
    atributos: row.atributos,
    anotacoes: row.anotacoes,
  });
}

export function personagemParaRow(p: Personagem): RowPersonagem {
  return {
    id: p.id,
    mesa_id: p.mesaId,
    dono_id: p.donoId,
    nome: p.nome,
    classe: p.classe,
    nivel: p.nivel,
    pv_atual: p.pvAtual,
    pv_max: p.pvMax,
    atributos: p.atributos,
    anotacoes: p.anotacoes,
  };
}
