import { useState, type FormEvent } from 'react';
import {
  ATRIBUTOS,
  modificadorAtributo,
  type Atributos,
  type NomeAtributo,
  type PersonagemDTO,
} from '@rolavinte/shared';
import { Botao } from '@/components/ui/Botao';
import { Campo, CampoArea } from '@/components/ui/Campo';
import { Erro } from '@/components/ui/Estado';
import { useAtualizarPersonagem } from './api';
import { useRolarDados } from '@/features/jogo/api';

const ROTULO_ATRIBUTO: Record<NomeAtributo, string> = {
  forca: 'FOR',
  destreza: 'DES',
  constituicao: 'CON',
  inteligencia: 'INT',
  sabedoria: 'SAB',
  carisma: 'CAR',
};

interface Props {
  personagem: PersonagemDTO;
  podeEditar: boolean;
  /** Quando a ficha está congelada por mesa encerrada, dizemos o porquê. */
  motivoBloqueio?: string | null;
  aoFechar(): void;
}

export function FichaPersonagem({
  personagem,
  podeEditar,
  motivoBloqueio = null,
  aoFechar,
}: Props) {
  const atualizar = useAtualizarPersonagem(personagem.mesaId);
  const rolar = useRolarDados(personagem.mesaId);
  const [nome, setNome] = useState(personagem.nome);
  const [classe, setClasse] = useState(personagem.classe);
  const [nivel, setNivel] = useState(personagem.nivel);
  const [pvAtual, setPvAtual] = useState(personagem.pvAtual);
  const [pvMax, setPvMax] = useState(personagem.pvMax);
  const [atributos, setAtributos] = useState<Atributos>(personagem.atributos);
  const [anotacoes, setAnotacoes] = useState(personagem.anotacoes);

  function salvar(e: FormEvent) {
    e.preventDefault();
    atualizar.mutate(
      {
        personagemId: personagem.id,
        campos: { nome, classe, nivel, pvAtual, pvMax, atributos, anotacoes },
      },
      { onSuccess: aoFechar },
    );
  }

  function rolarAtributo(atributo: NomeAtributo) {
    const mod = modificadorAtributo(atributos[atributo]);
    const expressao = mod === 0 ? '1d20' : `1d20${mod > 0 ? '+' : ''}${mod}`;
    rolar.mutate({ expressao, motivo: `${ROTULO_ATRIBUTO[atributo]} — ${personagem.nome}` });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-label={`Ficha de ${personagem.nome}`}
    >
      <form
        onSubmit={salvar}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-borda bg-painel p-6"
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="font-titulo text-2xl text-ouro">{personagem.nome}</h2>
            <p className="text-xs text-texto-2">Jogador: {personagem.donoNome}</p>
          </div>
          <Botao variante="fantasma" onClick={aoFechar} aria-label="Fechar ficha">
            ✕
          </Botao>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Campo
            rotulo="Nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            disabled={!podeEditar}
          />
          <Campo
            rotulo="Classe"
            value={classe}
            onChange={(e) => setClasse(e.target.value)}
            disabled={!podeEditar}
          />
          <Campo
            rotulo="Nível"
            type="number"
            min={1}
            max={20}
            value={nivel}
            onChange={(e) => setNivel(Number(e.target.value))}
            disabled={!podeEditar}
          />
          <div className="grid grid-cols-2 gap-2">
            <Campo
              rotulo="PV atual"
              type="number"
              min={0}
              max={pvMax}
              value={pvAtual}
              onChange={(e) => setPvAtual(Number(e.target.value))}
              disabled={!podeEditar}
            />
            <Campo
              rotulo="PV máx."
              type="number"
              min={1}
              value={pvMax}
              onChange={(e) => setPvMax(Number(e.target.value))}
              disabled={!podeEditar}
            />
          </div>
        </div>

        <fieldset className="mt-4">
          <legend className="mb-2 text-sm text-texto-2">
            Atributos (clique no dado para testar)
          </legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {ATRIBUTOS.map((atributo) => {
              const valor = atributos[atributo];
              const mod = modificadorAtributo(valor);
              return (
                <div
                  key={atributo}
                  className="rounded-lg border border-borda bg-painel-2 p-2 text-center"
                >
                  <p className="text-[11px] font-semibold text-texto-2">
                    {ROTULO_ATRIBUTO[atributo]}
                  </p>
                  <input
                    aria-label={`Valor de ${atributo}`}
                    type="number"
                    min={1}
                    max={30}
                    className="w-full bg-transparent text-center text-lg font-bold text-texto focus:outline-none disabled:opacity-100"
                    value={valor}
                    onChange={(e) =>
                      setAtributos({ ...atributos, [atributo]: Number(e.target.value) })
                    }
                    disabled={!podeEditar}
                  />
                  <button
                    type="button"
                    className="mt-1 w-full cursor-pointer rounded bg-fundo px-1 py-0.5 text-xs text-ouro hover:bg-ouro/10 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => rolarAtributo(atributo)}
                    disabled={motivoBloqueio !== null}
                    title={motivoBloqueio ?? `Rolar 1d20${mod >= 0 ? '+' : ''}${mod}`}
                  >
                    🎲 {mod >= 0 ? '+' : ''}
                    {mod}
                  </button>
                </div>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-4">
          <CampoArea
            rotulo="Anotações"
            value={anotacoes}
            onChange={(e) => setAnotacoes(e.target.value)}
            disabled={!podeEditar}
          />
        </div>

        {atualizar.isError && <Erro erro={atualizar.error} className="mt-3" />}

        {motivoBloqueio && (
          <p className="mt-4 rounded-lg border border-borda bg-painel-2 p-3 text-xs text-texto-2">
            {motivoBloqueio} A ficha está congelada: continua aberta para consulta, mas não aceita
            alterações nem rolagens — a rolagem publicaria no chat da mesa.
          </p>
        )}

        {podeEditar && (
          <div className="mt-5 flex gap-2">
            <Botao type="submit" disabled={atualizar.isPending}>
              {atualizar.isPending ? 'Salvando…' : 'Salvar ficha'}
            </Botao>
            <Botao variante="fantasma" onClick={aoFechar}>
              Cancelar
            </Botao>
          </div>
        )}
      </form>
    </div>
  );
}
