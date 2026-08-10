import type { DefesaCalculada } from '@rolavinte/shared';

/**
 * As defesas derivadas da ficha (RV-155): CA, as três salvaguardas, Percepção e a
 * CD de classe.
 *
 * **Somente leitura significa não editável — e não "sem botão de dado".** O número
 * não tem input: ele é calculado em `@rolavinte/shared` a partir dos graus e dos
 * campos de armadura, que são editáveis na seção Defesas acima. Mas salvaguarda é
 * a checagem mais rolada de uma sessão de PF2e (uma por magia de área, uma por
 * perigo), então as quatro checagens rolam em **um clique**, pela mesma rota das
 * perícias (RV-153).
 *
 * O que **não** ganha botão é o que não se rola: CA e CD de classe são
 * números-alvo. `expressao === null` é o contrato que diz isso, e vem do sistema —
 * a tela não decide o que é rolável, e não faz aritmética nenhuma.
 *
 * O `detalhe` de cada linha explica a composição do número em texto ("10 +
 * proficiência +7 + Destreza +1 (teto +1 da armadura) + item +4"): é o que responde
 * "por que a minha CA é 22?" no meio do combate, e é também como a borda do card
 * aparece na tela — armadura sem limite informado é dita em palavras, não deduzida
 * de um campo vazio.
 */

interface Props {
  defesas: readonly DefesaCalculada[];
  /** Preenchido trava a rolagem, e o texto explica por quê (mesa encerrada). */
  motivoBloqueio: string | null;
  aoRolar(defesa: DefesaCalculada): void;
}

export function SecaoDefesas({ defesas, motivoBloqueio, aoRolar }: Props) {
  // Sistema sem defesas devolve `[]` e a seção não aparece — é a resposta certa,
  // não um estado vazio a desenhar.
  if (defesas.length === 0) return null;

  return (
    <fieldset className="mt-4">
      <legend className="mb-2 text-sm text-texto-2">
        Defesas calculadas (nível, treinamento e atributo já somados)
      </legend>
      <ul className="flex flex-col gap-1.5">
        {defesas.map((defesa) => (
          <li key={defesa.chave} className="rounded-lg border border-borda bg-painel-2 px-2 py-1.5">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm text-texto">{defesa.rotulo}</span>
              {defesa.expressao === null ? (
                // Alvo: o número aparece como texto, sem dado. Um botão aqui
                // publicaria no chat uma rolagem que não significa nada.
                <span
                  className="shrink-0 rounded bg-fundo px-2 py-1 text-xs font-bold text-texto"
                  aria-label={`${defesa.rotulo} de ${defesa.valorFormatado}`}
                >
                  {defesa.valorFormatado}
                </span>
              ) : (
                <button
                  type="button"
                  className="shrink-0 cursor-pointer rounded bg-fundo px-2 py-1 text-xs text-ouro hover:bg-ouro/10 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Rolar ${defesa.rotulo} (${defesa.expressao})`}
                  title={motivoBloqueio ?? `Rolar ${defesa.expressao}`}
                  disabled={motivoBloqueio !== null}
                  onClick={() => aoRolar(defesa)}
                >
                  🎲 {defesa.valorFormatado}
                </button>
              )}
            </div>
            {/* A composição vai em texto, e não em cor nem em tooltip: quem soma à
                mão precisa poder conferir de onde saiu o número. */}
            <p className="mt-0.5 text-[11px] text-texto-2">{defesa.detalhe}</p>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
