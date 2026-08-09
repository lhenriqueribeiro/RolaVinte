import { useState, type FormEvent } from 'react';
import type { CenaDTO } from '@rolavinte/shared';
import { Botao } from '@/components/ui/Botao';
import { Campo } from '@/components/ui/Campo';
import { DialogoConfirmacao } from '@/components/ui/Dialogo';
import { useAtivarCena, useAtualizarCena, useCenas, useCriarCena, useRemoverCena } from './api';

interface Props {
  mesaId: string;
  /** Mesa encerrada: as ações travam e o motivo fica escrito ao lado (RV-023). */
  motivoBloqueio: string | null;
}

/** Motivo escrito de cada exclusão travada — a cor do botão não explica nada. */
function motivoExclusaoTravada(cena: CenaDTO, total: number): string | null {
  if (total <= 1) return 'É a única cena da mesa. Crie outra antes de excluir esta.';
  if (cena.ativa) return 'É a cena em jogo. Ative outra cena antes de excluí-la.';
  return null;
}

/**
 * Gerenciador de cenas do mestre (RV-030 / RV-031): listar, criar, renomear,
 * excluir e ativar em um clique.
 *
 * As duas guardas de exclusão são regra de domínio (a API devolve 409); aqui
 * elas aparecem como botão desabilitado **com o motivo por escrito**, para o
 * mestre não descobrir a regra tomando erro no meio da sessão.
 */
export function GerenciadorCenas({ mesaId, motivoBloqueio }: Props) {
  const cenas = useCenas(mesaId);
  const criar = useCriarCena(mesaId);
  const ativar = useAtivarCena(mesaId);
  const atualizar = useAtualizarCena(mesaId);
  const remover = useRemoverCena(mesaId);

  const [nomeNova, setNomeNova] = useState('');
  const [largura, setLargura] = useState(25);
  const [altura, setAltura] = useState(15);
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [nomeEditado, setNomeEditado] = useState('');
  const [cenaParaExcluir, setCenaParaExcluir] = useState<CenaDTO | null>(null);

  const bloqueado = motivoBloqueio !== null;
  const lista = cenas.data ?? [];

  function submeterCriacao(e: FormEvent) {
    e.preventDefault();
    criar.mutate(
      { nome: nomeNova, larguraGrid: largura, alturaGrid: altura },
      { onSuccess: () => setNomeNova('') },
    );
  }

  function submeterRenome(e: FormEvent, cena: CenaDTO) {
    e.preventDefault();
    atualizar.mutate(
      { cenaId: cena.id, campos: { nome: nomeEditado.trim() } },
      { onSuccess: () => setRenomeando(null) },
    );
  }

  function confirmarExclusao() {
    if (!cenaParaExcluir) return;
    remover.mutate(cenaParaExcluir.id, { onSuccess: () => setCenaParaExcluir(null) });
  }

  return (
    <section className="rounded-xl border border-borda bg-painel-2 p-3">
      <h3 className="mb-2 font-titulo text-sm text-ouro">🗺️ Cenas da mesa</h3>

      {cenas.isPending && <p className="text-xs text-texto-2">Carregando cenas…</p>}
      {cenas.isError && (
        <p role="alert" className="text-xs text-perigo">
          {cenas.error.message}
        </p>
      )}
      {cenas.data?.length === 0 && (
        <p className="text-xs text-texto-2">Nenhuma cena ainda. Crie a primeira abaixo.</p>
      )}

      <ul className="flex flex-col gap-2">
        {lista.map((cena) => {
          const motivoExclusao = motivoExclusaoTravada(cena, lista.length);
          return (
            <li key={cena.id} className="rounded-lg border border-borda bg-painel p-2">
              {renomeando === cena.id ? (
                <form onSubmit={(e) => submeterRenome(e, cena)} className="flex flex-col gap-2">
                  <Campo
                    rotulo="Novo nome da cena"
                    required
                    maxLength={80}
                    value={nomeEditado}
                    onChange={(e) => setNomeEditado(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Botao
                      type="submit"
                      className="!px-3 !py-1 text-xs"
                      disabled={atualizar.isPending}
                    >
                      Salvar nome
                    </Botao>
                    <Botao
                      variante="fantasma"
                      className="!px-3 !py-1 text-xs"
                      onClick={() => setRenomeando(null)}
                    >
                      Cancelar
                    </Botao>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm text-texto">{cena.nome}</span>
                    {/* Selo textual: "ativa" nunca é comunicado só por cor. */}
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${
                        cena.ativa ? 'border-ouro text-ouro' : 'border-borda text-texto-2'
                      }`}
                    >
                      {cena.ativa ? 'Em jogo' : 'Inativa'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-texto-2">
                    {cena.larguraGrid}×{cena.alturaGrid} células de {cena.tamanhoCelula} px
                    {cena.imagemFundoUrl ? ' · com mapa' : ' · sem mapa'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Botao
                      className="!px-3 !py-1 text-xs"
                      aria-label={`Ativar a cena ${cena.nome}`}
                      disabled={bloqueado || cena.ativa || ativar.isPending}
                      title={motivoBloqueio ?? undefined}
                      onClick={() => ativar.mutate(cena.id)}
                    >
                      Ativar
                    </Botao>
                    <Botao
                      variante="secundario"
                      className="!px-3 !py-1 text-xs"
                      aria-label={`Renomear a cena ${cena.nome}`}
                      disabled={bloqueado}
                      title={motivoBloqueio ?? undefined}
                      onClick={() => {
                        setRenomeando(cena.id);
                        setNomeEditado(cena.nome);
                      }}
                    >
                      Renomear
                    </Botao>
                    <Botao
                      variante="perigo"
                      className="!px-3 !py-1 text-xs"
                      aria-label={`Excluir a cena ${cena.nome}`}
                      disabled={bloqueado || motivoExclusao !== null}
                      title={motivoBloqueio ?? motivoExclusao ?? undefined}
                      onClick={() => setCenaParaExcluir(cena)}
                    >
                      Excluir
                    </Botao>
                  </div>
                  {motivoExclusao && !bloqueado && (
                    <p className="mt-1 text-[11px] text-texto-2">{motivoExclusao}</p>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      {/* A falha de exclusão fica no próprio diálogo, para não aparecer duas vezes. */}
      {(ativar.isError || atualizar.isError) && (
        <p role="alert" className="mt-2 text-xs text-perigo">
          {(ativar.error ?? atualizar.error)?.message}
        </p>
      )}

      <form
        onSubmit={submeterCriacao}
        className="mt-3 flex flex-col gap-2 border-t border-borda pt-3"
      >
        <p className="text-[11px] text-texto-2">A nova cena vira a cena em jogo para todos.</p>
        <Campo
          rotulo="Nome da cena"
          required
          maxLength={80}
          disabled={bloqueado}
          value={nomeNova}
          onChange={(e) => setNomeNova(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <Campo
            rotulo="Largura (células)"
            type="number"
            min={5}
            max={100}
            disabled={bloqueado}
            value={largura}
            onChange={(e) => setLargura(Number(e.target.value))}
          />
          <Campo
            rotulo="Altura (células)"
            type="number"
            min={5}
            max={100}
            disabled={bloqueado}
            value={altura}
            onChange={(e) => setAltura(Number(e.target.value))}
          />
        </div>
        {criar.isError && (
          <p role="alert" className="text-xs text-perigo">
            {criar.error.message}
          </p>
        )}
        <Botao type="submit" disabled={bloqueado || criar.isPending}>
          Criar cena
        </Botao>
        {motivoBloqueio && <p className="text-[11px] text-texto-2">{motivoBloqueio}</p>}
      </form>

      <DialogoConfirmacao
        aberto={cenaParaExcluir !== null}
        titulo="Excluir cena"
        descricao={
          <>
            A cena <strong>{cenaParaExcluir?.nome}</strong> e todos os tokens posicionados nela
            serão apagados. Esta ação não pode ser desfeita. Os participantes que estão na cena em
            jogo não são afetados.
          </>
        }
        rotuloConfirmar="Excluir cena"
        processando={remover.isPending}
        erro={remover.isError ? remover.error.message : null}
        aoConfirmar={confirmarExclusao}
        aoCancelar={() => setCenaParaExcluir(null)}
      />
    </section>
  );
}
