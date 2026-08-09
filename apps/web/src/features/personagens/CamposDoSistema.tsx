import { useId } from 'react';
import type { CampoFicha, DadosFicha, SecaoFicha } from '@rolavinte/shared';
import { Campo, CampoArea } from '@/components/ui/Campo';
import { booleanoDoCampo, numeroDoCampo, textoDoCampo } from './campos-ficha';

/**
 * As seções que o **sistema da mesa** declara, renderizadas a partir da
 * definição (RV-091).
 *
 * Este arquivo é o que impede o `switch (sistema)` de reaparecer na tela: ele
 * não conhece o nome de nenhum sistema, só os quatro tipos de campo do
 * contrato. Acrescentar Pathfinder ao registro faz a ficha dele aparecer sem
 * que uma linha daqui mude — que é exatamente o critério de aceite "novo
 * sistema entra por adição".
 *
 * `minimo`/`maximo` viram atributos do `input`, não uma segunda validação: quem
 * valida é o `schemaFicha`, e o registro tem teste provando que os dois limites
 * são o mesmo número.
 */

interface PropsCampo {
  campo: CampoFicha;
  dados: DadosFicha;
  desabilitado: boolean;
  aoAlterar(chave: string, valor: unknown): void;
}

/** Caixa de marcação com rótulo próprio — o `Campo` de texto não serve aqui. */
function CampoBooleano({ campo, dados, desabilitado, aoAlterar }: PropsCampo) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-texto-2">
        {campo.rotulo}
      </label>
      <div className="flex items-center gap-2 rounded-lg border border-borda bg-fundo px-3 py-2">
        <input
          id={id}
          type="checkbox"
          className="size-4 accent-ouro"
          checked={booleanoDoCampo(dados, campo.chave)}
          disabled={desabilitado}
          onChange={(e) => aoAlterar(campo.chave, e.target.checked)}
        />
        {/* O estado também vai em texto: caixa marcada não é informação de cor,
            mas "sim/não" escrito ajuda quem lê a ficha de relance. */}
        <span className="text-sm text-texto">
          {booleanoDoCampo(dados, campo.chave) ? 'Sim' : 'Não'}
        </span>
      </div>
      {campo.ajuda && <p className="text-[11px] text-texto-2">{campo.ajuda}</p>}
    </div>
  );
}

/**
 * Um campo, escolhido pelo `tipo` do contrato.
 *
 * O `never` no fim é a rede: um `TipoCampoFicha` novo em `@rolavinte/shared`
 * para de compilar aqui em vez de renderizar nada em silêncio.
 */
function CampoDoSistema(props: PropsCampo) {
  const { campo, dados, desabilitado, aoAlterar } = props;
  const ajuda = campo.ajuda ? <p className="mt-1 text-[11px] text-texto-2">{campo.ajuda}</p> : null;

  switch (campo.tipo) {
    case 'booleano':
      return <CampoBooleano {...props} />;
    case 'texto-longo':
      return (
        <div className="col-span-2">
          <CampoArea
            rotulo={campo.rotulo}
            value={textoDoCampo(dados, campo.chave)}
            disabled={desabilitado}
            onChange={(e) => aoAlterar(campo.chave, e.target.value)}
          />
          {ajuda}
        </div>
      );
    case 'numero':
      return (
        <div>
          <Campo
            rotulo={campo.rotulo}
            type="number"
            min={campo.minimo}
            max={campo.maximo}
            value={numeroDoCampo(dados, campo.chave)}
            disabled={desabilitado}
            // Campo esvaziado vira `''`, não `undefined`: chave ausente faria o
            // schema aplicar o padrão e trocar o valor do jogador em silêncio,
            // enquanto `''` volta da API como "informe um número", em PT-BR.
            onChange={(e) =>
              aoAlterar(campo.chave, e.target.value === '' ? '' : Number(e.target.value))
            }
          />
          {ajuda}
        </div>
      );
    case 'texto':
      return (
        <div>
          <Campo
            rotulo={campo.rotulo}
            value={textoDoCampo(dados, campo.chave)}
            disabled={desabilitado}
            onChange={(e) => aoAlterar(campo.chave, e.target.value)}
          />
          {ajuda}
        </div>
      );
    default: {
      const naoTratado: never = campo.tipo;
      throw new Error(`Tipo de campo de ficha não tratado: ${String(naoTratado)}`);
    }
  }
}

interface Props {
  secoes: readonly SecaoFicha[];
  dados: DadosFicha;
  desabilitado: boolean;
  aoAlterar(chave: string, valor: unknown): void;
}

export function CamposDoSistema({ secoes, dados, desabilitado, aoAlterar }: Props) {
  return (
    <>
      {secoes.map((secao) => (
        <fieldset key={secao.chave} className="mt-4">
          <legend className="mb-2 text-sm text-texto-2">{secao.titulo}</legend>
          <div className="grid grid-cols-2 gap-3">
            {secao.campos.map((campo) => (
              <CampoDoSistema
                key={campo.chave}
                campo={campo}
                dados={dados}
                desabilitado={desabilitado}
                aoAlterar={aoAlterar}
              />
            ))}
          </div>
        </fieldset>
      ))}
    </>
  );
}
