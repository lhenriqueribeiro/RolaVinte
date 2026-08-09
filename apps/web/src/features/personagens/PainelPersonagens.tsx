import { useState, type FormEvent } from 'react';
import type { PersonagemDTO } from '@rolavinte/shared';
import { Botao } from '@/components/ui/Botao';
import { Campo } from '@/components/ui/Campo';
import { DialogoConfirmacao } from '@/components/ui/Dialogo';
import { Erro, Vazio } from '@/components/ui/Estado';
import { ListaEsqueleto } from '@/components/ui/Esqueleto';
import { useNotificar } from '@/components/ui/Notificacao';
import { useSessao } from '@/features/auth/store-sessao';
import {
  useCriarPersonagem,
  useDuplicarPersonagem,
  usePersonagens,
  useRemoverPersonagem,
} from './api';
import { FichaPersonagem } from './FichaPersonagem';

interface Props {
  mesaId: string;
  souMestre: boolean;
  /** Preenchido quando a mesa está encerrada: a ficha congela junto (RV-027). */
  motivoBloqueio?: string | null;
}

/**
 * Motivo escrito de cada gestão travada (RV-093).
 *
 * A autorização de verdade é do caso de uso — dono ou mestre, com 403 na
 * chamada direta. Aqui ela vira botão desabilitado **com o motivo por escrito**,
 * porque apagar o botão sem explicação é pior que mostrá-lo travado.
 */
export function motivoGestaoTravada(
  podeGerenciar: boolean,
  motivoBloqueio: string | null,
): string | null {
  if (motivoBloqueio !== null) return motivoBloqueio;
  if (!podeGerenciar) return 'Só o dono da ficha ou o mestre da mesa podem excluir ou duplicar.';
  return null;
}

export function PainelPersonagens({ mesaId, souMestre, motivoBloqueio = null }: Props) {
  const bloqueado = motivoBloqueio !== null;
  const usuario = useSessao((s) => s.usuario);
  const notificar = useNotificar();
  const personagens = usePersonagens(mesaId);
  const criar = useCriarPersonagem(mesaId);
  const duplicar = useDuplicarPersonagem(mesaId);
  const remover = useRemoverPersonagem(mesaId);
  const [fichaAberta, setFichaAberta] = useState<PersonagemDTO | null>(null);
  const [paraExcluir, setParaExcluir] = useState<PersonagemDTO | null>(null);
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState('');
  const [classe, setClasse] = useState('');
  const [pvMax, setPvMax] = useState(10);

  function submeterCriacao(e: FormEvent) {
    e.preventDefault();
    criar.mutate(
      {
        nome,
        classe,
        nivel: 1,
        pvMax,
        atributos: {
          forca: 10,
          destreza: 10,
          constituicao: 10,
          inteligencia: 10,
          sabedoria: 10,
          carisma: 10,
        },
        anotacoes: '',
      },
      {
        onSuccess: () => {
          setCriando(false);
          setNome('');
          setClasse('');
          setPvMax(10);
        },
      },
    );
  }

  function confirmarExclusao() {
    if (!paraExcluir) return;
    const nomeExcluido = paraExcluir.nome;
    remover.mutate(paraExcluir.id, {
      onSuccess: () => {
        // A ficha aberta pode ser justamente a que sumiu: o modal da ficha não
        // prende o foco, então dá para tabular até a lista atrás dele e acionar
        // "Excluir" pelo teclado. Fechá-la evita um formulário editando um id
        // que não existe mais.
        setFichaAberta((atual) => (atual?.id === paraExcluir.id ? null : atual));
        setParaExcluir(null);
        notificar.sucesso(`A ficha de ${nomeExcluido} foi excluída.`);
      },
    });
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      {!criando && (
        <>
          <Botao
            variante="secundario"
            onClick={() => setCriando(true)}
            disabled={bloqueado}
            title={motivoBloqueio ?? undefined}
          >
            + Novo personagem
          </Botao>
          {motivoBloqueio && (
            <p className="text-[11px] text-texto-2">
              {motivoBloqueio} As fichas continuam abertas para leitura.
            </p>
          )}
        </>
      )}

      {criando && (
        <form
          onSubmit={submeterCriacao}
          className="flex flex-col gap-3 rounded-xl border border-borda bg-painel-2 p-3"
        >
          <Campo
            rotulo="Nome"
            required
            minLength={2}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
          <Campo rotulo="Classe" value={classe} onChange={(e) => setClasse(e.target.value)} />
          <Campo
            rotulo="PV máximo"
            type="number"
            min={1}
            value={pvMax}
            onChange={(e) => setPvMax(Number(e.target.value))}
          />
          {criar.isError && <Erro erro={criar.error} compacto />}
          <div className="flex gap-2">
            <Botao type="submit" disabled={criar.isPending}>
              Criar
            </Botao>
            <Botao variante="fantasma" onClick={() => setCriando(false)}>
              Cancelar
            </Botao>
          </div>
        </form>
      )}

      {personagens.isPending && (
        <ListaEsqueleto itens={3} altura="h-20" rotulo="Carregando os personagens…" />
      )}
      {personagens.isError && (
        <Erro
          erro={personagens.error}
          compacto
          retentando={personagens.isFetching}
          aoRetentar={() => void personagens.refetch()}
        />
      )}
      {personagens.isSuccess && personagens.data.length === 0 && !criando && (
        <Vazio compacto icone="🧙" titulo="Nenhum personagem ainda. Crie o primeiro!" />
      )}

      {/* A falha de exclusão fica dentro do diálogo, para não aparecer duas vezes. */}
      {duplicar.isError && <Erro erro={duplicar.error} compacto />}

      <ul className="flex flex-col gap-2">
        {personagens.data?.map((p) => {
          const fracaoPv = p.pvMax > 0 ? p.pvAtual / p.pvMax : 0;
          const podeGerenciar = souMestre || p.donoId === usuario?.id;
          const motivoTravado = motivoGestaoTravada(podeGerenciar, motivoBloqueio);
          return (
            <li key={p.id} className="rounded-xl border border-borda bg-painel-2">
              {/* O cartão inteiro abre a ficha, mas as ações ficam **fora** dele:
                  botão dentro de botão é HTML inválido e o clique vazaria para
                  a abertura da ficha. */}
              <button
                type="button"
                onClick={() => setFichaAberta(p)}
                aria-label={`Abrir a ficha de ${p.nome}`}
                className="w-full cursor-pointer rounded-t-xl p-3 text-left transition-colors hover:bg-painel"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-texto">{p.nome}</span>
                  <span className="text-xs text-texto-2">
                    {p.classe || 'Sem classe'} · Nv {p.nivel}
                  </span>
                </div>
                <p className="mt-1 text-xs text-texto-2">de {p.donoNome}</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-fundo" aria-hidden>
                  <div
                    className={`h-full ${fracaoPv > 0.5 ? 'bg-sucesso' : fracaoPv > 0.25 ? 'bg-ouro' : 'bg-perigo'}`}
                    style={{ width: `${Math.max(fracaoPv * 100, 2)}%` }}
                  />
                </div>
                <p className="mt-1 text-right text-[11px] text-texto-2">
                  PV {p.pvAtual}/{p.pvMax}
                </p>
              </button>

              <div className="flex flex-wrap gap-1.5 border-t border-borda px-3 py-2">
                <Botao
                  variante="secundario"
                  className="!px-3 !py-1 text-xs"
                  aria-label={`Duplicar ${p.nome}`}
                  disabled={motivoTravado !== null || duplicar.isPending}
                  title={motivoTravado ?? undefined}
                  onClick={() =>
                    duplicar.mutate(p.id, {
                      onSuccess: (copia) => notificar.sucesso(`Cópia criada: ${copia.nome}.`),
                    })
                  }
                >
                  Duplicar
                </Botao>
                <Botao
                  variante="perigo"
                  className="!px-3 !py-1 text-xs"
                  aria-label={`Excluir ${p.nome}`}
                  disabled={motivoTravado !== null}
                  title={motivoTravado ?? undefined}
                  onClick={() => setParaExcluir(p)}
                >
                  Excluir
                </Botao>
              </div>
              {motivoTravado && !bloqueado && (
                <p className="px-3 pb-2 text-[11px] text-texto-2">{motivoTravado}</p>
              )}
            </li>
          );
        })}
      </ul>

      {fichaAberta && (
        <FichaPersonagem
          personagem={fichaAberta}
          podeEditar={!bloqueado && (souMestre || fichaAberta.donoId === usuario?.id)}
          motivoBloqueio={motivoBloqueio}
          aoFechar={() => setFichaAberta(null)}
        />
      )}

      <DialogoConfirmacao
        aberto={paraExcluir !== null}
        titulo="Excluir personagem"
        descricao={
          <>
            <p>
              A ficha de <strong>{paraExcluir?.nome}</strong> será apagada definitivamente. Esta
              ação não pode ser desfeita.
            </p>
            <p className="mt-2">
              Os tokens que apontavam para ela continuam no mapa, agora sem vínculo com nenhuma
              ficha e sem barra de vida.
            </p>
            <p className="mt-2">
              Quem estiver com esta mesa aberta em outra tela só verá a ficha sumir ao recarregar a
              página: a exclusão ainda não é avisada em tempo real.
            </p>
          </>
        }
        rotuloConfirmar="Excluir personagem"
        processando={remover.isPending}
        erro={remover.error}
        aoConfirmar={confirmarExclusao}
        aoCancelar={() => setParaExcluir(null)}
      />
    </div>
  );
}
