import { useState } from 'react';
import type { JogadorDaMesaDTO } from '@rolavinte/shared';
import { Botao } from '@/components/ui/Botao';
import { DialogoConfirmacao } from '@/components/ui/Dialogo';
import { useRemoverJogador } from './api';

interface Props {
  mesaId: string;
  jogadores: JogadorDaMesaDTO[];
  /** A ação de remover só existe para o mestre (RV-021). */
  souMestre: boolean;
  /** Texto do bloqueio (mesa encerrada). `null` quando a mesa aceita escrita. */
  motivoBloqueio: string | null;
}

/**
 * Lista de participantes com remoção pelo mestre (RV-021). O mestre não aparece
 * com ação de remover: a saída dele é encerrar ou transferir a mesa.
 */
export function PainelParticipantes({ mesaId, jogadores, souMestre, motivoBloqueio }: Props) {
  const remover = useRemoverJogador(mesaId);
  const [aRemover, setARemover] = useState<JogadorDaMesaDTO | null>(null);

  const bloqueado = motivoBloqueio !== null;

  function confirmarRemocao() {
    if (!aRemover) return;
    remover.mutate(aRemover.usuarioId, { onSuccess: () => setARemover(null) });
  }

  return (
    <section className="rounded-xl border border-borda bg-painel-2 p-3">
      <h3 className="mb-2 font-titulo text-sm text-ouro">👥 Participantes ({jogadores.length})</h3>
      <ul className="flex flex-col gap-2">
        {jogadores.map((jogador) => (
          <li
            key={jogador.usuarioId}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-borda bg-painel p-2"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-texto">{jogador.nome}</p>
              <p className="text-[11px] text-texto-2">
                {jogador.papel === 'mestre' ? '👑 Mestre da mesa' : 'Jogador'}
              </p>
            </div>
            {souMestre && jogador.papel === 'jogador' && (
              <Botao
                variante="perigo"
                className="!px-2 !py-1 text-xs"
                disabled={bloqueado}
                title={motivoBloqueio ?? undefined}
                onClick={() => setARemover(jogador)}
              >
                Remover
              </Botao>
            )}
          </li>
        ))}
      </ul>
      {motivoBloqueio && <p className="mt-2 text-[11px] text-texto-2">{motivoBloqueio}</p>}

      <DialogoConfirmacao
        aberto={aRemover !== null}
        titulo="Remover participante"
        descricao={
          <>
            <strong className="text-texto">{aRemover?.nome}</strong> perde o acesso à mesa
            imediatamente, inclusive à sessão que estiver aberta agora. Os personagens dele
            continuam na mesa, para o histórico da campanha. Você pode convidá-lo de novo depois.
          </>
        }
        rotuloConfirmar="Remover da mesa"
        processando={remover.isPending}
        erro={remover.isError ? remover.error.message : null}
        aoConfirmar={confirmarRemocao}
        aoCancelar={() => {
          remover.reset();
          setARemover(null);
        }}
      />
    </section>
  );
}
