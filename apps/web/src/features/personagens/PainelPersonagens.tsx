import { useState, type FormEvent } from 'react';
import type { PersonagemDTO } from '@rolavinte/shared';
import { Botao } from '@/components/ui/Botao';
import { Campo } from '@/components/ui/Campo';
import { useSessao } from '@/features/auth/store-sessao';
import { useCriarPersonagem, usePersonagens } from './api';
import { FichaPersonagem } from './FichaPersonagem';

interface Props {
  mesaId: string;
  souMestre: boolean;
  /** Preenchido quando a mesa está encerrada: a ficha congela junto (RV-027). */
  motivoBloqueio?: string | null;
}

export function PainelPersonagens({ mesaId, souMestre, motivoBloqueio = null }: Props) {
  const bloqueado = motivoBloqueio !== null;
  const usuario = useSessao((s) => s.usuario);
  const personagens = usePersonagens(mesaId);
  const criar = useCriarPersonagem(mesaId);
  const [fichaAberta, setFichaAberta] = useState<PersonagemDTO | null>(null);
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
          {criar.isError && <p className="text-xs text-perigo">{criar.error.message}</p>}
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

      {personagens.isPending && <p className="text-sm text-texto-2">Carregando personagens…</p>}
      {personagens.data?.length === 0 && !criando && (
        <p className="text-sm text-texto-2">Nenhum personagem ainda. Crie o primeiro!</p>
      )}

      <ul className="flex flex-col gap-2">
        {personagens.data?.map((p) => {
          const fracaoPv = p.pvMax > 0 ? p.pvAtual / p.pvMax : 0;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setFichaAberta(p)}
                className="w-full cursor-pointer rounded-xl border border-borda bg-painel-2 p-3 text-left transition-colors hover:border-ouro/50"
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
    </div>
  );
}
