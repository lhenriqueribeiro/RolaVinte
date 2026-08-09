import { useState, type FormEvent } from 'react';
import type { CenaDTO, MesaDetalheDTO, PersonagemDTO } from '@rolavinte/shared';
import { Botao } from '@/components/ui/Botao';
import { Campo } from '@/components/ui/Campo';
import { Erro } from '@/components/ui/Estado';
import { AcaoEncerrarMesa } from '@/features/mesas/AcaoEncerrarMesa';
import { FormularioEditarMesa } from '@/features/mesas/FormularioEditarMesa';
import { PainelConvites } from '@/features/mesas/PainelConvites';
import { PainelParticipantes } from '@/features/mesas/PainelParticipantes';
import { useCriarToken } from './api';
import { GerenciadorCenas } from './GerenciadorCenas';
import { PropriedadesCena } from './PropriedadesCena';

interface Props {
  mesa: MesaDetalheDTO;
  cena: CenaDTO | null;
  personagens: PersonagemDTO[];
  /** Explica por que as ações de escrita estão travadas; `null` = mesa aberta. */
  motivoBloqueio: string | null;
}

/** Ferramentas exclusivas do mestre: dados da mesa, participação, cenas e tokens. */
export function PainelMestre({ mesa, cena, personagens, motivoBloqueio }: Props) {
  const mesaId = mesa.id;
  const criarToken = useCriarToken(mesaId);

  const [nomeToken, setNomeToken] = useState('');
  const [corToken, setCorToken] = useState('#e74c3c');
  const [personagemToken, setPersonagemToken] = useState<string>('');

  const bloqueado = motivoBloqueio !== null;

  function submeterToken(e: FormEvent) {
    e.preventDefault();
    if (!cena) return;
    criarToken.mutate(
      {
        cenaId: cena.id,
        nome: nomeToken,
        cor: corToken,
        x: Math.floor(cena.larguraGrid / 2),
        y: Math.floor(cena.alturaGrid / 2),
        personagemId: personagemToken || null,
      },
      { onSuccess: () => setNomeToken('') },
    );
  }

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-3">
      <FormularioEditarMesa mesa={mesa} motivoBloqueio={motivoBloqueio} />

      <PainelParticipantes
        mesaId={mesaId}
        jogadores={mesa.jogadores}
        souMestre
        motivoBloqueio={motivoBloqueio}
      />

      <PainelConvites mesaId={mesaId} motivoBloqueio={motivoBloqueio} />

      <GerenciadorCenas mesaId={mesaId} motivoBloqueio={motivoBloqueio} />

      {cena && (
        <PropriedadesCena
          key={cena.id}
          mesaId={mesaId}
          cena={cena}
          motivoBloqueio={motivoBloqueio}
        />
      )}

      <section className="rounded-xl border border-borda bg-painel-2 p-3">
        <h3 className="mb-2 font-titulo text-sm text-ouro">♟️ Novo token</h3>
        {!cena ? (
          <p className="text-xs text-texto-2">Crie uma cena primeiro para adicionar tokens.</p>
        ) : (
          <form onSubmit={submeterToken} className="flex flex-col gap-2">
            <Campo
              rotulo="Nome"
              required
              disabled={bloqueado}
              value={nomeToken}
              onChange={(e) => setNomeToken(e.target.value)}
            />
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="cor-token" className="text-sm text-texto-2">
                  Cor
                </label>
                <input
                  id="cor-token"
                  type="color"
                  className="h-9 w-14 cursor-pointer rounded border border-borda bg-fundo disabled:opacity-50"
                  disabled={bloqueado}
                  value={corToken}
                  onChange={(e) => setCorToken(e.target.value)}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <label htmlFor="personagem-token" className="text-sm text-texto-2">
                  Vincular a personagem
                </label>
                <select
                  id="personagem-token"
                  className="rounded-lg border border-borda bg-fundo px-2 py-2 text-sm disabled:opacity-50"
                  disabled={bloqueado}
                  value={personagemToken}
                  onChange={(e) => setPersonagemToken(e.target.value)}
                >
                  <option value="">Nenhum (NPC/objeto)</option>
                  {personagens.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome} ({p.donoNome})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-[11px] text-texto-2">
              Token vinculado pode ser movido pelo dono do personagem; sem vínculo, só pelo mestre.
            </p>
            {criarToken.isError && <Erro erro={criarToken.error} compacto />}
            <Botao type="submit" disabled={bloqueado || criarToken.isPending}>
              Adicionar à cena
            </Botao>
            {motivoBloqueio && <p className="text-[11px] text-texto-2">{motivoBloqueio}</p>}
          </form>
        )}
      </section>

      <AcaoEncerrarMesa mesa={mesa} />
    </div>
  );
}
