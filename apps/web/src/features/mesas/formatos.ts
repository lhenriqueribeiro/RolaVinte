import { definicaoDoSistema, type SistemaRpg, type StatusConvite } from '@rolavinte/shared';

/**
 * Nome exibível do sistema — **derivado** do registro de `@rolavinte/shared`.
 *
 * Aqui havia um `Record<SistemaRpg, string>` escrito à mão, anterior ao RV-091.
 * Depois que a `DefinicaoSistema` passou a carregar `nome`, essa cópia virou uma
 * segunda verdade — e já tinha divergido: o painel de mesas dizia "Tormenta20" e
 * o cabeçalho da ficha, "Tormenta 20"; "Sistema genérico" contra "Genérico". O
 * mesmo sistema com dois nomes em duas telas é o defeito que o registro existe
 * para impedir, e um `Record` total não protege contra ele: acrescentar um
 * sistema quebrava a compilação, mas escrever o rótulo errado, não.
 */
export function nomeDoSistema(sistema: SistemaRpg): string {
  return definicaoDoSistema(sistema).nome;
}

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
