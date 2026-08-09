import { useState, type FormEvent } from 'react';
import {
  ATRIBUTOS,
  definicaoDoSistema,
  formatarBonus,
  modificadorAtributo,
  type Atributos,
  type DadosFicha,
  type NomeAtributo,
  type PersonagemCalculavel,
  type PersonagemDTO,
} from '@rolavinte/shared';
import { Botao } from '@/components/ui/Botao';
import { Campo, CampoArea } from '@/components/ui/Campo';
import { Erro } from '@/components/ui/Estado';
import { useAtualizarPersonagem } from './api';
import { useRolarDados } from '@/features/jogo/api';
import { definirCampo } from './campos-ficha';
import { CamposDoSistema } from './CamposDoSistema';
import { SecaoPericias } from './SecaoPericias';
import { linhasDePericia, type LinhaDePericia } from './pericias';

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

/**
 * A ficha, renderizada **a partir da definição do sistema da mesa** (RV-091).
 *
 * Ela tem duas metades, e a distinção é a razão de ser deste card:
 *
 * - a **comum** — nome, classe, nível, PV, atributos e anotações — é igual em
 *   todos os sistemas e continua sendo JSX fixo aqui, porque de fato não varia;
 * - a **do sistema** vem de `definicaoDoSistema(personagem.sistema)`: seções,
 *   campos e perícias saem do registro de `@rolavinte/shared`, e este arquivo
 *   nunca pergunta qual é o sistema. Uma mesa "generico" tem `secoes: []` e
 *   `pericias: []`, então vê exatamente a ficha de sempre; um sistema novo
 *   aparece por adição no registro, sem tocar neste componente.
 *
 * O `personagem.sistema` vem no próprio DTO de propósito: a ficha não depende
 * de um segundo cache (`['mesa', id]`) que pode estar carregando.
 */
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
  const [dados, setDados] = useState<DadosFicha>(personagem.dados);

  const definicao = definicaoDoSistema(personagem.sistema);

  // Os bônus acompanham o que está na tela, e não o que está gravado: quem
  // acabou de subir de nível vê o número novo antes de salvar — e rola com ele,
  // que é o mesmo contrato dos dados de atributo desde sempre.
  const ficha: PersonagemCalculavel = { sistema: personagem.sistema, nivel, atributos, dados };
  const pericias = linhasDePericia(ficha, personagem.nome);

  function salvar(e: FormEvent) {
    e.preventDefault();
    atualizar.mutate(
      {
        personagemId: personagem.id,
        // `dados` substitui a ficha do sistema inteira — o PATCH não faz merge
        // de jsonb aninhado, e é por isso que o estado local guarda o objeto
        // completo em vez de um diff.
        campos: { nome, classe, nivel, pvAtual, pvMax, atributos, anotacoes, dados },
      },
      { onSuccess: aoFechar },
    );
  }

  /**
   * O dado do teste vem da definição (`dadoDeTeste`), não de um `1d20` escrito
   * aqui: o teste de perícia já saía assim (`expressaoDePericia`), e um `1d20`
   * fixo no atributo faria a mesma ficha usar dados diferentes nas duas metades
   * no dia em que entrar um sistema que não é d20 — exatamente a decisão por
   * sistema fora do registro que o RV-091 veio apagar.
   */
  function expressaoDeAtributo(atributo: NomeAtributo): string {
    return `${definicao.dadoDeTeste}${formatarBonus(modificadorAtributo(atributos[atributo]))}`;
  }

  function rolarAtributo(atributo: NomeAtributo) {
    rolar.mutate({
      expressao: expressaoDeAtributo(atributo),
      motivo: `${ROTULO_ATRIBUTO[atributo]} — ${personagem.nome}`,
    });
  }

  function rolarPericia(linha: LinhaDePericia) {
    rolar.mutate({ expressao: linha.expressao, motivo: linha.motivo });
  }

  /**
   * Onde o grau mora dentro de `dados` é decisão do sistema — daí o
   * `definicao.definirGrauDePericia` em vez de escrever em `dados.pericias`.
   */
  function trocarGrau(pericia: string, grau: string) {
    setDados((atual) => definicao.definirGrauDePericia(atual, pericia, grau));
  }

  function alterarCampo(chave: string, valor: unknown) {
    setDados((atual) => definirCampo(atual, chave, valor));
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
            <p className="text-xs text-texto-2">
              Jogador: {personagem.donoNome} · Sistema: {definicao.nome}
            </p>
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
                    title={motivoBloqueio ?? `Rolar ${expressaoDeAtributo(atributo)}`}
                  >
                    🎲 {mod >= 0 ? '+' : ''}
                    {mod}
                  </button>
                </div>
              );
            })}
          </div>
        </fieldset>

        <CamposDoSistema
          secoes={definicao.secoes}
          dados={dados}
          desabilitado={!podeEditar}
          aoAlterar={alterarCampo}
        />

        <SecaoPericias
          linhas={pericias}
          graus={definicao.grausPericia}
          desabilitado={!podeEditar}
          motivoBloqueio={motivoBloqueio}
          aoTrocarGrau={trocarGrau}
          aoRolar={rolarPericia}
        />

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
