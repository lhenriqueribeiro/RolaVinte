import { useId, useState } from 'react';
import type { FamiliaPericia, GrauPericia } from '@rolavinte/shared';
import { Botao } from '@/components/ui/Botao';
import type { LinhaDePericia } from './pericias';

/**
 * Perícias com grau de treinamento e rolagem em um clique (RV-090, estendida no
 * RV-153).
 *
 * A lista vem pronta de `linhasDePericia` — a conta é pura e testada fora do
 * navegador. Aqui só há apresentação, e nenhuma menção a sistema: um sistema
 * sem perícias devolve lista vazia e a seção nem aparece.
 *
 * O grau é um `select` com os rótulos do sistema, e não um ícone colorido: o
 * treinamento é informação, e informação não vai só em cor (guardrail 06).
 *
 * Duas coisas chegaram com o RV-153, e nenhuma delas cita um sistema:
 *
 * - **Famílias de perícia** (`familias`): perícias que o jogador cria, com
 *   especialização própria e grau próprio. Um sistema sem famílias recebe `[]` e
 *   não vê o formulário.
 * - **Ações que exigem treinamento** (`linha.acoes`): aparecem **indisponíveis
 *   com o motivo escrito**, nunca ocultas — esconder o que existe é a promessa
 *   falsa que a taxonomia chama de F6.
 */

interface PropsLinha {
  linha: LinhaDePericia;
  graus: readonly GrauPericia[];
  desabilitado: boolean;
  motivoBloqueio: string | null;
  aoTrocarGrau(pericia: string, grau: string): void;
  aoRolar(linha: LinhaDePericia): void;
  aoRemover(linha: LinhaDePericia): void;
}

function LinhaPericia({
  linha,
  graus,
  desabilitado,
  motivoBloqueio,
  aoTrocarGrau,
  aoRolar,
  aoRemover,
}: PropsLinha) {
  const id = useId();
  return (
    <li className="rounded-lg border border-borda bg-painel-2 px-2 py-1.5">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="min-w-0 flex-1 truncate text-sm text-texto">
          {linha.rotulo}
        </label>
        <select
          id={id}
          className="max-w-32 cursor-pointer rounded border border-borda bg-fundo px-1.5 py-1 text-xs text-texto focus:border-ouro focus:outline-none disabled:cursor-not-allowed"
          value={linha.grau}
          disabled={desabilitado}
          onChange={(e) => aoTrocarGrau(linha.chave, e.target.value)}
        >
          {graus.map((grau) => (
            <option key={grau.chave} value={grau.chave}>
              {grau.rotulo}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="shrink-0 cursor-pointer rounded bg-fundo px-2 py-1 text-xs text-ouro hover:bg-ouro/10 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={`Rolar ${linha.rotulo} (${linha.expressao})`}
          title={motivoBloqueio ?? `Rolar ${linha.expressao}`}
          disabled={motivoBloqueio !== null}
          onClick={() => aoRolar(linha)}
        >
          🎲 {linha.bonusFormatado}
        </button>
        {linha.familia !== null && (
          <button
            type="button"
            className="shrink-0 cursor-pointer rounded bg-fundo px-2 py-1 text-xs text-texto-2 hover:text-perigo disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`Remover ${linha.rotulo}`}
            title={desabilitado ? 'Ficha somente leitura.' : `Remover ${linha.rotulo}`}
            disabled={desabilitado}
            onClick={() => aoRemover(linha)}
          >
            ✕
          </button>
        )}
      </div>
      {linha.acoes.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-[11px] text-texto-2">
            Ações que exigem treinamento ({linha.acoes.length})
          </summary>
          <ul className="mt-1 flex flex-col gap-0.5 pl-3">
            {linha.acoes.map((acao) => (
              <li key={acao.nome} className="text-[11px] text-texto-2">
                <span className={acao.disponivel ? 'text-texto' : ''}>{acao.nome}</span>
                {/* O estado vai em texto, não em cor: quem é destreinado precisa
                    ler o motivo, não deduzi-lo de um cinza mais claro. */}
                {acao.motivo !== null && <span> — indisponível: {acao.motivo}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

interface PropsFamilia {
  familia: FamiliaPericia;
  desabilitado: boolean;
  aoAcrescentar(familia: FamiliaPericia, especializacao: string): void;
}

/**
 * O formulário que cria uma instância de família — "Saber (Guerra)".
 *
 * O botão fica **desabilitado com o motivo no `title`** enquanto o campo está
 * vazio, em vez de sumir: controle escondido não explica nada. Quem tentar pela
 * API sem especialização recebe 400 em PT-BR do `schemaFicha`, que é onde a
 * defesa de verdade mora.
 */
function FormularioFamilia({ familia, desabilitado, aoAcrescentar }: PropsFamilia) {
  const id = useId();
  const [especializacao, setEspecializacao] = useState('');
  const vazio = especializacao.trim() === '';

  return (
    <div className="mt-2 flex items-end gap-2">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label htmlFor={id} className="text-[11px] text-texto-2">
          {familia.rotuloEspecializacao}
        </label>
        <input
          id={id}
          className="w-full rounded border border-borda bg-fundo px-2 py-1 text-xs text-texto focus:border-ouro focus:outline-none disabled:cursor-not-allowed"
          value={especializacao}
          disabled={desabilitado}
          onChange={(e) => setEspecializacao(e.target.value)}
        />
      </div>
      <Botao
        variante="fantasma"
        disabled={desabilitado || vazio}
        title={
          desabilitado
            ? 'Ficha somente leitura.'
            : vazio
              ? `Informe a ${familia.rotuloEspecializacao.toLocaleLowerCase('pt-BR')} antes de adicionar.`
              : `Adicionar ${familia.rotulo}`
        }
        onClick={() => {
          aoAcrescentar(familia, especializacao);
          setEspecializacao('');
        }}
      >
        Adicionar {familia.rotulo}
      </Botao>
    </div>
  );
}

interface Props {
  linhas: readonly LinhaDePericia[];
  graus: readonly GrauPericia[];
  familias: readonly FamiliaPericia[];
  /** Edição do grau travada (ficha de outro jogador, mesa encerrada…). */
  desabilitado: boolean;
  /** Preenchido trava também a rolagem, e o texto explica por quê. */
  motivoBloqueio: string | null;
  aoTrocarGrau(pericia: string, grau: string): void;
  aoRolar(linha: LinhaDePericia): void;
  aoAcrescentarDaFamilia(familia: FamiliaPericia, especializacao: string): void;
  aoRemoverDaFamilia(linha: LinhaDePericia): void;
}

export function SecaoPericias({
  linhas,
  graus,
  familias,
  desabilitado,
  motivoBloqueio,
  aoTrocarGrau,
  aoRolar,
  aoAcrescentarDaFamilia,
  aoRemoverDaFamilia,
}: Props) {
  if (linhas.length === 0 && familias.length === 0) return null;

  return (
    <fieldset className="mt-4">
      <legend className="mb-2 text-sm text-texto-2">
        Perícias (o bônus já soma atributo e treinamento)
      </legend>
      <ul className="flex flex-col gap-1.5">
        {linhas.map((linha) => (
          <LinhaPericia
            key={linha.chave}
            linha={linha}
            graus={graus}
            desabilitado={desabilitado}
            motivoBloqueio={motivoBloqueio}
            aoTrocarGrau={aoTrocarGrau}
            aoRolar={aoRolar}
            aoRemover={aoRemoverDaFamilia}
          />
        ))}
      </ul>
      {familias.map((familia) => (
        <div key={familia.chave}>
          <FormularioFamilia
            familia={familia}
            desabilitado={desabilitado}
            aoAcrescentar={aoAcrescentarDaFamilia}
          />
          {familia.ajuda && <p className="mt-1 text-[11px] text-texto-2">{familia.ajuda}</p>}
        </div>
      ))}
    </fieldset>
  );
}
