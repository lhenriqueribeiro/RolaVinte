import { create } from 'zustand';

/**
 * Estado da conexão de tempo real com a mesa (RV-112).
 *
 * É **estado de UI efêmero** (guardrail 06-frontend.md): vive no Zustand, nunca
 * no cache do TanStack Query e nunca no servidor. Quem o alimenta é
 * `use-socket-mesa`, a partir dos eventos do próprio socket.io; quem o lê é a
 * `PaginaMesa`, para mostrar a faixa de status e bloquear as ações de escrita.
 *
 * ## Por que três estados e não um booleano
 *
 * "Caiu e está voltando" e "caiu e não volta sozinho" pedem coisas diferentes do
 * usuário: no primeiro caso ele espera, no segundo precisa recarregar. Um
 * booleano `conectado` obrigaria a UI a mentir num dos dois — e texto de UI é
 * contrato (F6 da taxonomia de falhas).
 *
 * Quem sabe distinguir os dois é o próprio socket.io, por `socket.active`: ele
 * já leva em conta o motivo da queda (`io server disconnect` não reconecta) e o
 * esgotamento das tentativas. Por isso o `caiu(...)` recebe essa decisão pronta
 * em vez de reinterpretar a string de motivo aqui — duas leituras da mesma
 * verdade divergiriam.
 */
export type EstadoConexao = 'conectado' | 'reconectando' | 'offline';

/**
 * Otimista de propósito. Numa página recém-aberta o socket em geral já está
 * conectado, e abrir a mesa com "Reconectando…" piscando seria alarme falso a
 * cada carga. Os eventos do socket corrigem o estado em milissegundos.
 */
const ESTADO_INICIAL: EstadoConexao = 'conectado';

export interface StoreConexao {
  estado: EstadoConexao;
  /** O socket conectou (primeira vez ou depois de uma queda). */
  conectou(): void;
  /** O socket caiu. `vaiTentarDeNovo` é o `socket.active` do socket.io. */
  caiu(vaiTentarDeNovo: boolean): void;
}

export const useConexao = create<StoreConexao>()((set) => ({
  estado: ESTADO_INICIAL,
  conectou: () => set({ estado: 'conectado' }),
  caiu: (vaiTentarDeNovo) => set({ estado: vaiTentarDeNovo ? 'reconectando' : 'offline' }),
}));

/**
 * Texto do bloqueio de escrita enquanto a conexão não está de pé.
 *
 * Ele entra na `PaginaMesa` pela mesma prop `motivoBloqueio` que a mesa
 * encerrada já usava (RV-023), então chat, tabletop, fichas e painel do mestre
 * desabilitam os controles **com o motivo ao lado**, sem que nenhum deles
 * precise conhecer o socket.
 *
 * Repare no que o texto afirma e no que não afirma: o bloqueio é decisão desta
 * interface — as rotas HTTP continuariam aceitando a escrita —, e a razão é não
 * deixar o jogador agir às cegas sobre um estado que parou de chegar. Prometer
 * que "o servidor recusaria" seria a promessa falsa da classe F6.
 */
export function motivoDeConexao(estado: EstadoConexao): string | null {
  switch (estado) {
    case 'conectado':
      return null;
    case 'reconectando':
      return (
        'Conexão em tempo real perdida. Reconectando… O envio fica bloqueado até a conexão ' +
        'voltar, e o texto já digitado continua no campo.'
      );
    case 'offline':
      return (
        'Você foi desconectado da mesa e a reconexão automática não vai acontecer. ' +
        'Recarregue a página para voltar ao jogo.'
      );
  }
}

/** Rótulo curto da faixa de status, com ícone — nunca só cor (acessibilidade). */
export function rotuloDeConexao(estado: EstadoConexao): string | null {
  switch (estado) {
    case 'conectado':
      return null;
    case 'reconectando':
      return '🔄 Reconectando…';
    case 'offline':
      return '⚠️ Desconectado';
  }
}
