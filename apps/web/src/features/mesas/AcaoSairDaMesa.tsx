import { useState } from 'react';
import type { MesaDTO } from '@rolavinte/shared';
import { Botao } from '@/components/ui/Botao';
import { DialogoConfirmacao } from '@/components/ui/Dialogo';
import { useSairDaMesa } from './api';

interface Props {
  mesa: MesaDTO;
}

/**
 * Saída voluntária do jogador (RV-022). Mesa encerrada é somente leitura,
 * inclusive para a participação — por isso a ação fica desabilitada com o
 * motivo à vista em vez de sumir da tela.
 */
export function AcaoSairDaMesa({ mesa }: Props) {
  const sair = useSairDaMesa();
  const [confirmando, setConfirmando] = useState(false);

  const motivoBloqueio =
    mesa.encerradaEm !== null
      ? 'Mesa encerrada: ela fica arquivada no seu painel para consulta e não é possível sair.'
      : null;

  return (
    <>
      <Botao
        variante="perigo"
        className="!px-2 !py-1 text-xs"
        disabled={motivoBloqueio !== null || sair.isPending}
        title={motivoBloqueio ?? undefined}
        onClick={() => setConfirmando(true)}
      >
        Sair da mesa
      </Botao>
      {motivoBloqueio && <span className="text-[11px] text-texto-2">{motivoBloqueio}</span>}

      <DialogoConfirmacao
        aberto={confirmando}
        titulo="Sair da mesa"
        descricao={
          <>
            Você deixa de participar de <strong className="text-texto">{mesa.nome}</strong>: ela
            some do seu painel e você não consegue mais abri-la. Seus personagens continuam na mesa,
            para o histórico do grupo. Só um novo convite do mestre traz você de volta.
          </>
        }
        rotuloConfirmar="Sair da mesa"
        processando={sair.isPending}
        erro={sair.error}
        aoConfirmar={() => sair.mutate(mesa.id, { onSuccess: () => setConfirmando(false) })}
        aoCancelar={() => {
          sair.reset();
          setConfirmando(false);
        }}
      />
    </>
  );
}
