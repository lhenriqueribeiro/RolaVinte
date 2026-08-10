import { useState } from 'react';
import { REGRA_DESEMPATE_INICIATIVA, type PersonagemDTO, type TokenDTO } from '@rolavinte/shared';
import { Botao } from '@/components/ui/Botao';
import { Carregando, Erro, Vazio } from '@/components/ui/Estado';
import { DialogoConfirmacao } from '@/components/ui/Dialogo';
import { useCombate, useEncerrarCombate, useIniciarCombate, usePassarTurno } from './api';
import { ehMinhaVez, linhaDoTurno, linhasDeCombate } from './painel-iniciativa';
import { ParticipanteNaOrdem } from './ParticipanteNaOrdem';

interface Props {
  mesaId: string;
  souMestre: boolean;
  /** Tokens da cena em jogo — a lista de onde o combate nasce. */
  tokens: readonly TokenDTO[];
  /** Fichas da mesa; é delas que sai o PV mostrado em cada linha (RV-042). */
  personagens: readonly PersonagemDTO[];
  /** Meus personagens: quem pode rolar a própria iniciativa. */
  meusPersonagens: readonly PersonagemDTO[];
  /** Mesa encerrada ou tempo real fora do ar (RV-023 / RV-112). */
  motivoBloqueio: string | null;
}

/**
 * Painel de iniciativa (RV-063) — a aba de combate, visível a **todos** os
 * participantes.
 *
 * ## O que o painel não faz
 *
 * **Não ordena e não calcula o turno.** `combate.participantes` chega ordenado e
 * `combate.tokenIdDoTurno` chega pronto. Reordenar aqui seria uma segunda
 * implementação da regra de desempate do agregado `Combate`, e a frase que o
 * painel mostra ao usuário (`REGRA_DESEMPATE_INICIATIVA`, importada de
 * `@rolavinte/shared` e não redigida aqui) passaria a descrever o que a tela faz
 * em vez do que o servidor faz — a classe F6 da taxonomia.
 *
 * ## Autorização
 *
 * Iniciar, passar turno, encerrar e aplicar PV são do mestre, e quem garante isso
 * são os casos de uso (403 na chamada direta). Aqui os controles simplesmente não
 * aparecem para o jogador: esconder o botão nunca é a proteção (F4), é a cortesia
 * de não oferecer um caminho que vai falhar.
 */
export function PainelIniciativa({
  mesaId,
  souMestre,
  tokens,
  personagens,
  meusPersonagens,
  motivoBloqueio,
}: Props) {
  const combate = useCombate(mesaId);
  const iniciar = useIniciarCombate(mesaId);
  const passarTurno = usePassarTurno(mesaId);
  const encerrar = useEncerrarCombate(mesaId);
  const [confirmandoEncerrar, setConfirmandoEncerrar] = useState(false);
  const [foraDaLuta, setForaDaLuta] = useState<ReadonlySet<string>>(new Set());

  const bloqueado = motivoBloqueio !== null;

  if (combate.isPending) {
    return (
      <div className="flex h-full items-center justify-center p-3">
        <Carregando rotulo="Carregando o combate…" compacto />
      </div>
    );
  }
  if (combate.isError) {
    return (
      <div className="p-3">
        <Erro
          erro={combate.error}
          retentando={combate.isFetching}
          aoRetentar={() => void combate.refetch()}
        />
      </div>
    );
  }

  const emCurso = combate.data.combate;

  if (!emCurso) {
    // Estado vazio: o jogador só lê, o mestre escolhe as peças e começa.
    const escolhidos = tokens.filter((t) => !foraDaLuta.has(t.id));
    return (
      <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
        <Vazio
          icone="⚔️"
          compacto
          titulo="Nenhum combate em andamento."
          descricao={
            souMestre
              ? 'Escolha as peças da cena e comece a luta: a ordem de iniciativa aparece aqui para toda a mesa.'
              : 'Quando o mestre iniciar o combate, a ordem de iniciativa aparece aqui.'
          }
        />
        {souMestre && (
          <section
            aria-label="Iniciar combate"
            className="rounded-xl border border-borda bg-painel-2 p-3"
          >
            <h3 className="mb-2 font-titulo text-sm text-ouro">⚔️ Iniciar combate</h3>
            {tokens.length === 0 ? (
              /* Redação que vale para os dois casos — cena sem peça e mesa ainda sem
                 cena nenhuma: o servidor recusa a abertura nas duas situações
                 (`SEM_CENA_ATIVA` e lista de participantes vazia), e prometer que só
                 falta um token seria promessa falsa (F6). */
              <p className="text-xs text-texto-2">
                Não há nenhuma peça na cena em jogo. Prepare a cena e adicione tokens na aba 👑
                Mestre para poder iniciar o combate.
              </p>
            ) : (
              <>
                <ul className="flex flex-col gap-0.5">
                  {tokens.map((token) => (
                    <li key={token.id}>
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-texto">
                        <input
                          type="checkbox"
                          className="cursor-pointer accent-ouro"
                          disabled={bloqueado || iniciar.isPending}
                          checked={!foraDaLuta.has(token.id)}
                          onChange={(e) =>
                            setForaDaLuta((atual) => {
                              const proximo = new Set(atual);
                              if (e.target.checked) proximo.delete(token.id);
                              else proximo.add(token.id);
                              return proximo;
                            })
                          }
                        />
                        <span
                          aria-hidden
                          className="inline-block size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: token.cor }}
                        />
                        <span className="truncate">{token.nome}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-texto-2">
                  {escolhidos.length === 1
                    ? '1 peça na luta.'
                    : `${escolhidos.length} peças na luta.`}{' '}
                  A ordem de entrada resolve empates de iniciativa.
                </p>
                {iniciar.isError && <Erro erro={iniciar.error} compacto className="mt-2" />}
                <Botao
                  className="mt-2 !py-1.5 text-xs"
                  disabled={bloqueado || iniciar.isPending || escolhidos.length === 0}
                  title={motivoBloqueio ?? undefined}
                  onClick={() => iniciar.mutate(escolhidos.map((t) => t.id))}
                >
                  {iniciar.isPending ? 'Iniciando…' : 'Iniciar combate'}
                </Botao>
                {motivoBloqueio && (
                  <p className="mt-1 text-[11px] text-texto-2">{motivoBloqueio}</p>
                )}
              </>
            )}
          </section>
        )}
      </div>
    );
  }

  const linhas = linhasDeCombate({
    combate: emCurso,
    tokens,
    personagens,
    meusPersonagemIds: new Set(meusPersonagens.map((p) => p.id)),
  });
  const daVez = linhaDoTurno(linhas);
  const minhaVez = ehMinhaVez(linhas);

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-titulo text-sm text-ouro">⚔️ Rodada {emCurso.rodada}</h3>
        <span className="text-[11px] text-texto-2">
          {emCurso.participantes.length === 1
            ? '1 participante'
            : `${emCurso.participantes.length} participantes`}
        </span>
      </div>

      {/* "É a sua vez" NÃO pode depender de cor: `role="status"` anuncia sem roubar
          o foco, o sino e a frase escrita cobrem quem está de olho no mapa, e a
          linha da ordem repete o aviso com `aria-current`. */}
      {minhaVez && (
        <p
          role="status"
          className="rounded-xl border border-ouro bg-ouro/15 px-2 py-1.5 text-sm font-semibold text-ouro"
        >
          🔔 É a sua vez{daVez ? `, ${daVez.nome}` : ''}!
        </p>
      )}
      {!minhaVez && daVez && (
        <p role="status" className="text-[11px] text-texto-2">
          Na vez: <strong className="text-texto">{daVez.nome}</strong>.
        </p>
      )}

      <ol className="flex flex-col gap-1" aria-label="Ordem de iniciativa">
        {linhas.map((linha) => (
          <ParticipanteNaOrdem
            key={linha.tokenId}
            mesaId={mesaId}
            combateId={emCurso.id}
            linha={linha}
            souMestre={souMestre}
            motivoBloqueio={motivoBloqueio}
          />
        ))}
      </ol>

      {/* A regra vem de `@rolavinte/shared`, escrita uma vez ao lado do DTO cuja
          ordem ela descreve (DoD do RV-158). Redigi-la aqui deixaria a tela livre
          para anunciar um desempate que o servidor não aplica. */}
      <p className="text-[11px] text-texto-2">{REGRA_DESEMPATE_INICIATIVA}</p>

      {souMestre && (
        <div className="flex flex-col gap-1 border-t border-borda pt-2">
          {passarTurno.isError && <Erro erro={passarTurno.error} compacto />}
          <Botao
            className="!py-1.5 text-xs"
            disabled={bloqueado || passarTurno.isPending}
            title={motivoBloqueio ?? undefined}
            onClick={() => passarTurno.mutate(emCurso.id)}
          >
            {passarTurno.isPending ? 'Passando…' : '⏭️ Passar turno'}
          </Botao>
          <Botao
            variante="perigo"
            className="!py-1.5 text-xs"
            disabled={bloqueado || encerrar.isPending}
            title={motivoBloqueio ?? undefined}
            onClick={() => setConfirmandoEncerrar(true)}
          >
            Encerrar combate
          </Botao>
          {motivoBloqueio && <p className="text-[11px] text-texto-2">{motivoBloqueio}</p>}
        </div>
      )}

      <DialogoConfirmacao
        aberto={confirmandoEncerrar}
        titulo="Encerrar o combate?"
        descricao="O painel de iniciativa esvazia para todos e a ordem desta luta não volta — para lutar de novo, é preciso iniciar um combate novo e rolar a iniciativa outra vez. As fichas, o PV e as condições das peças ficam como estão."
        rotuloConfirmar="Encerrar combate"
        processando={encerrar.isPending}
        erro={encerrar.error}
        aoCancelar={() => setConfirmandoEncerrar(false)}
        aoConfirmar={() =>
          encerrar.mutate(emCurso.id, { onSuccess: () => setConfirmandoEncerrar(false) })
        }
      />
    </div>
  );
}
