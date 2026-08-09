import { useState, type FormEvent } from 'react';
import type { ConviteDTO } from '@rolavinte/shared';
import { Botao } from '@/components/ui/Botao';
import { Campo } from '@/components/ui/Campo';
import { DialogoConfirmacao } from '@/components/ui/Dialogo';
import { Erro, Vazio } from '@/components/ui/Estado';
import { ListaEsqueleto } from '@/components/ui/Esqueleto';
import { useNotificar } from '@/components/ui/Notificacao';
import { useConvidarJogador, useConvites, useRevogarConvite } from './api';
import { formatarDataHora, ROTULO_STATUS_CONVITE } from './formatos';

const ESTILO_STATUS: Record<ConviteDTO['status'], string> = {
  pendente: 'border-ouro/40 text-ouro',
  aceito: 'border-sucesso/40 text-sucesso',
  revogado: 'border-borda text-texto-2',
};

function Selo({ status }: { status: ConviteDTO['status'] }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${ESTILO_STATUS[status]}`}
    >
      {ROTULO_STATUS_CONVITE[status]}
    </span>
  );
}

interface Props {
  mesaId: string;
  /** Texto do bloqueio (mesa encerrada). `null` quando a mesa aceita escrita. */
  motivoBloqueio: string | null;
}

/**
 * Convites da mesa (RV-020): envio, acompanhamento dos pendentes com a data de
 * envio e revogação com confirmação. O histórico de aceitos e revogados fica
 * visível — convite revogado não é apagado.
 */
export function PainelConvites({ mesaId, motivoBloqueio }: Props) {
  const convites = useConvites(mesaId);
  const convidar = useConvidarJogador(mesaId);
  const revogar = useRevogarConvite(mesaId);
  const [email, setEmail] = useState('');
  const [aRevogar, setARevogar] = useState<ConviteDTO | null>(null);
  const notificar = useNotificar();

  const bloqueado = motivoBloqueio !== null;

  function submeter(evento: FormEvent) {
    evento.preventDefault();
    convidar.mutate(email, {
      onSuccess: (convite) => {
        // Antes esta confirmação ficava para sempre embaixo do campo, e o
        // segundo convite a deixava desatualizada. Toast (RV-122): aparece,
        // é anunciado por `aria-live` e some.
        notificar.sucesso(`Convite enviado para ${convite.email}.`);
        setEmail('');
      },
    });
  }

  function confirmarRevogacao() {
    if (!aRevogar) return;
    revogar.mutate(aRevogar.id, { onSuccess: () => setARevogar(null) });
  }

  const pendentes = (convites.data ?? []).filter((c) => c.status === 'pendente');
  const historico = (convites.data ?? []).filter((c) => c.status !== 'pendente');

  return (
    <section className="rounded-xl border border-borda bg-painel-2 p-3">
      <h3 className="mb-2 font-titulo text-sm text-ouro">📨 Convites</h3>

      <form onSubmit={submeter} className="flex flex-col gap-2">
        <Campo
          rotulo="Email do jogador"
          type="email"
          required
          disabled={bloqueado}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {convidar.isError && <Erro erro={convidar.error} compacto />}
        <Botao type="submit" disabled={bloqueado || convidar.isPending}>
          {convidar.isPending ? 'Enviando…' : 'Enviar convite'}
        </Botao>
        {motivoBloqueio && <p className="text-[11px] text-texto-2">{motivoBloqueio}</p>}
      </form>

      <div className="mt-4">
        <h4 className="mb-1.5 text-xs font-semibold text-texto-2">
          Convites pendentes ({pendentes.length})
        </h4>
        {convites.isPending && (
          <ListaEsqueleto itens={2} altura="h-14" rotulo="Carregando os convites…" />
        )}
        {convites.isError && (
          <Erro
            erro={convites.error}
            compacto
            retentando={convites.isFetching}
            aoRetentar={() => void convites.refetch()}
          />
        )}
        {convites.isSuccess && pendentes.length === 0 && (
          <Vazio compacto icone="📨" titulo="Nenhum convite aguardando resposta." />
        )}
        <ul className="flex flex-col gap-2">
          {pendentes.map((convite) => (
            <li
              key={convite.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-borda bg-painel p-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-texto" title={convite.email}>
                  {convite.email}
                </p>
                <p className="text-[11px] text-texto-2">
                  Enviado em {formatarDataHora(convite.criadoEm)}
                </p>
              </div>
              <Selo status={convite.status} />
              <Botao
                variante="perigo"
                className="!px-2 !py-1 text-xs"
                disabled={bloqueado}
                title={motivoBloqueio ?? undefined}
                onClick={() => setARevogar(convite)}
              >
                Revogar
              </Botao>
            </li>
          ))}
        </ul>
      </div>

      {historico.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-texto-2">
            Histórico de convites ({historico.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {historico.map((convite) => (
              <li key={convite.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[11px] text-texto-2">
                  {convite.email} · {formatarDataHora(convite.criadoEm)}
                </span>
                <Selo status={convite.status} />
              </li>
            ))}
          </ul>
        </details>
      )}

      <DialogoConfirmacao
        aberto={aRevogar !== null}
        titulo="Revogar convite"
        descricao={
          <>
            O link enviado para <strong className="text-texto">{aRevogar?.email}</strong> deixa de
            funcionar imediatamente. O convite fica registrado no histórico como revogado e você
            pode convidar este email de novo depois.
          </>
        }
        rotuloConfirmar="Revogar convite"
        processando={revogar.isPending}
        erro={revogar.error}
        aoConfirmar={confirmarRevogacao}
        aoCancelar={() => {
          revogar.reset();
          setARevogar(null);
        }}
      />
    </section>
  );
}
