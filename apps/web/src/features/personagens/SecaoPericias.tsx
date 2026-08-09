import { useId } from 'react';
import type { GrauPericia } from '@rolavinte/shared';
import type { LinhaDePericia } from './pericias';

/**
 * Perícias com grau de treinamento e rolagem em um clique (RV-090).
 *
 * A lista vem pronta de `linhasDePericia` — a conta é pura e testada fora do
 * navegador. Aqui só há apresentação, e nenhuma menção a sistema: um sistema
 * sem perícias devolve lista vazia e a seção nem aparece.
 *
 * O grau é um `select` com os rótulos do sistema, e não um ícone colorido: o
 * treinamento é informação, e informação não vai só em cor (guardrail 06).
 */

interface PropsLinha {
  linha: LinhaDePericia;
  graus: readonly GrauPericia[];
  desabilitado: boolean;
  motivoBloqueio: string | null;
  aoTrocarGrau(pericia: string, grau: string): void;
  aoRolar(linha: LinhaDePericia): void;
}

function LinhaPericia({
  linha,
  graus,
  desabilitado,
  motivoBloqueio,
  aoTrocarGrau,
  aoRolar,
}: PropsLinha) {
  const id = useId();
  return (
    <li className="flex items-center gap-2 rounded-lg border border-borda bg-painel-2 px-2 py-1.5">
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
    </li>
  );
}

interface Props {
  linhas: readonly LinhaDePericia[];
  graus: readonly GrauPericia[];
  /** Edição do grau travada (ficha de outro jogador, mesa encerrada…). */
  desabilitado: boolean;
  /** Preenchido trava também a rolagem, e o texto explica por quê. */
  motivoBloqueio: string | null;
  aoTrocarGrau(pericia: string, grau: string): void;
  aoRolar(linha: LinhaDePericia): void;
}

export function SecaoPericias({
  linhas,
  graus,
  desabilitado,
  motivoBloqueio,
  aoTrocarGrau,
  aoRolar,
}: Props) {
  if (linhas.length === 0) return null;

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
          />
        ))}
      </ul>
    </fieldset>
  );
}
