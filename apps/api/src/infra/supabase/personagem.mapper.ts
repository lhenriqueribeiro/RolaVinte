import type { Atributos, DadosFicha } from '@rolavinte/shared';
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
  /**
   * `personagens.atributos` — os seis atributos na escala do sistema da mesa
   * (RV-098).
   *
   * O mapper **não** converte escala, e não poderia: quem sabe qual é o sistema é
   * a `Mesa`, e o `Personagem` de propósito não a guarda. A consolidação dos
   * modificadores que o PF2e mantinha em `dados` é da migration `0009`, que faz o
   * `join` com `mesas` e por isso sabe o que está lendo. Aqui a linha atravessa
   * como está: `reconstituir` não revalida, então uma ficha gravada antes da
   * `0009` continua **legível** — e é na próxima escrita que a escala é cobrada.
   */
  atributos: Atributos;
  anotacoes: string;
  /**
   * `personagens.dados` (migration 0007). Chega `null`/`undefined` numa linha
   * gravada antes da migration — e num banco onde ela ainda não rodou —, por
   * isso a leitura tolera a ausência em vez de estourar: a ficha genérica é
   * `{}`, e é isso que uma ficha antiga significa.
   */
  dados?: DadosFicha | null;
}

/**
 * Normaliza o que veio do jsonb. O CHECK da 0007 já barra array e escalar, mas
 * a defesa fica aqui também porque linhas gravadas antes dele existem — e
 * `Object.entries(null)` derrubaria a listagem inteira da mesa por causa de uma
 * ficha.
 */
function dadosDaRow(bruto: DadosFicha | null | undefined): DadosFicha {
  if (bruto === null || bruto === undefined) return {};
  if (typeof bruto !== 'object' || Array.isArray(bruto)) return {};
  return bruto;
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
    dados: dadosDaRow(row.dados),
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
    dados: p.dados,
  };
}
