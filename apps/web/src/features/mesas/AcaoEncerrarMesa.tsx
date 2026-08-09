import { useState } from 'react';
import type { MesaDTO } from '@rolavinte/shared';
import { Botao } from '@/components/ui/Botao';
import { DialogoConfirmacao } from '@/components/ui/Dialogo';
import { useEncerrarMesa } from './api';
import { formatarData } from './formatos';

interface Props {
  mesa: MesaDTO;
  /** Estilo compacto para o card do dashboard. */
  compacto?: boolean;
}

/**
 * Encerramento (arquivamento) da campanha — RV-023. Nada é apagado: a mesa
 * passa a somente leitura e continua acessível na seção "Encerradas".
 */
export function AcaoEncerrarMesa({ mesa, compacto = false }: Props) {
  const encerrar = useEncerrarMesa();
  const [confirmando, setConfirmando] = useState(false);

  const jaEncerrada = mesa.encerradaEm !== null;
  const motivo = jaEncerrada
    ? `Esta mesa já foi encerrada em ${formatarData(mesa.encerradaEm ?? '')}.`
    : null;

  const botao = (
    <Botao
      variante="perigo"
      className={compacto ? '!px-2 !py-1 text-xs' : ''}
      disabled={jaEncerrada || encerrar.isPending}
      title={motivo ?? undefined}
      onClick={() => setConfirmando(true)}
    >
      Encerrar mesa
    </Botao>
  );

  const dialogo = (
    <DialogoConfirmacao
      aberto={confirmando}
      titulo="Encerrar a mesa"
      descricao={
        <>
          <strong className="text-texto">{mesa.nome}</strong> passa a somente leitura para todo o
          grupo: ninguém envia mensagens, rola dados nem move tokens. O histórico do chat, as fichas
          e os mapas continuam acessíveis, e a mesa aparece no painel na seção “Encerradas”. Não é
          possível reabrir a mesa.
        </>
      }
      rotuloConfirmar="Encerrar mesa"
      processando={encerrar.isPending}
      erro={encerrar.error}
      aoConfirmar={() => encerrar.mutate(mesa.id, { onSuccess: () => setConfirmando(false) })}
      aoCancelar={() => {
        encerrar.reset();
        setConfirmando(false);
      }}
    />
  );

  if (compacto) {
    return (
      <>
        {botao}
        {dialogo}
      </>
    );
  }

  return (
    <section className="rounded-xl border border-perigo/30 bg-painel-2 p-3">
      <h3 className="mb-1 font-titulo text-sm text-perigo">🔒 Encerrar campanha</h3>
      <p className="mb-2 text-[11px] text-texto-2">
        {motivo ??
          'A mesa vira somente leitura para todo mundo, mantendo chat, fichas e mapas. Não dá para reabrir.'}
      </p>
      {botao}
      {dialogo}
    </section>
  );
}
