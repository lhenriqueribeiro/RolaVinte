import type { SistemaRpg, StatusConvite } from '@rolavinte/shared';

export const NOME_SISTEMA: Record<SistemaRpg, string> = {
  dnd5e: 'D&D 5e',
  tormenta20: 'Tormenta20',
  'ordem-paranormal': 'Ordem Paranormal',
  generico: 'Sistema genérico',
};

export const ROTULO_STATUS_CONVITE: Record<StatusConvite, string> = {
  pendente: 'Pendente',
  aceito: 'Aceito',
  revogado: 'Revogado',
};

export function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
