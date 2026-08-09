import type { ReactNode } from 'react';
import { Botao } from './Botao';

/**
 * Estados padrão de carregamento, erro e vazio (RV-122).
 *
 * Antes disto cada tela escrevia o seu próprio "Carregando mesas…",
 * "Abrindo a mesa…", "Carregando conversa…" e um `<p className="text-perigo">`
 * solto — cinco vocabulários para a mesma situação, e nenhum deles oferecendo
 * uma saída ao usuário. Aqui existe **um** vocabulário: `Carregando`, `Erro` e
 * `Vazio`. Página nenhuma deve voltar a inventar o seu.
 *
 * Duas regras que estes componentes carregam por todo mundo:
 * - **Erro oferece saída.** Quando quem chama sabe refazer a consulta, passa
 *   `aoRetentar` e o usuário ganha "Tentar novamente" em vez de um beco sem
 *   saída.
 * - **Nada é transmitido só por cor** (guardrail 06): todo estado tem ícone e
 *   texto, e o erro é anunciado por `role="alert"`.
 */

const MENSAGEM_ERRO_GENERICA = 'Algo deu errado. Tente novamente.';

/**
 * Texto de erro apresentável a partir de qualquer coisa que uma mutação ou
 * query possa rejeitar.
 *
 * O `ErroApi` de `lib/api` já chega com a mensagem em PT-BR que o servidor
 * mandou; o resto (erro de rede, `throw` de terceiro, valor não-Error) cai no
 * texto genérico em vez de exibir "undefined" ou um objeto na tela.
 */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof Error && erro.message.trim() !== '') return erro.message;
  if (typeof erro === 'string' && erro.trim() !== '') return erro;
  return MENSAGEM_ERRO_GENERICA;
}

interface PropsCarregando {
  /** O que está sendo carregado, em PT-BR. Vira o texto anunciado. */
  rotulo?: string;
  /** Versão miúda, para painéis laterais e seções dentro de um card. */
  compacto?: boolean;
  className?: string;
}

/**
 * Espera de um bloco que não é lista. Para listas prefira `ListaEsqueleto`, que
 * mostra o formato do conteúdo em vez de uma frase.
 */
export function Carregando({
  rotulo = 'Carregando…',
  compacto = false,
  className = '',
}: PropsCarregando) {
  return (
    <div
      role="status"
      className={`flex items-center gap-2 ${compacto ? 'text-xs' : 'text-sm'} text-texto-2 ${className}`}
    >
      <span
        aria-hidden
        className={`inline-block animate-spin rounded-full border-2 border-borda border-t-ouro ${
          compacto ? 'size-3' : 'size-4'
        }`}
      />
      <span>{rotulo}</span>
    </div>
  );
}

interface PropsErro {
  /** O que a query/mutação rejeitou. Passa direto o `error` do TanStack Query. */
  erro: unknown;
  /**
   * Refaz a operação. Omitir é dizer "não há como tentar de novo daqui" — o que
   * é verdade para erro de submissão de formulário, e falso para uma listagem.
   */
  aoRetentar?: () => void;
  /** A nova tentativa está em andamento: o botão trava e diz que está tentando. */
  retentando?: boolean;
  compacto?: boolean;
  /** Saída alternativa (ex.: um link "Voltar ao início"). */
  children?: ReactNode;
  className?: string;
}

export function Erro({
  erro,
  aoRetentar,
  retentando = false,
  compacto = false,
  children,
  className = '',
}: PropsErro) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-start gap-2 rounded-lg border border-perigo/40 bg-perigo/10 p-3 ${className}`}
    >
      <p className={`flex items-start gap-2 text-perigo ${compacto ? 'text-xs' : 'text-sm'}`}>
        <span aria-hidden>⚠️</span>
        <span>
          <span className="sr-only">Erro: </span>
          {mensagemDeErro(erro)}
        </span>
      </p>
      {(aoRetentar || children) && (
        <div className="flex flex-wrap items-center gap-2">
          {aoRetentar && (
            <Botao
              variante="secundario"
              className={compacto ? '!px-2 !py-1 text-xs' : ''}
              disabled={retentando}
              onClick={aoRetentar}
            >
              {retentando ? 'Tentando…' : 'Tentar novamente'}
            </Botao>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

interface PropsVazio {
  /** Emoji decorativo — sempre acompanhado de texto, nunca sozinho. */
  icone?: string;
  titulo: string;
  descricao?: ReactNode;
  /** Botão ou link que resolve o vazio (criar a primeira mesa, por exemplo). */
  acao?: ReactNode;
  compacto?: boolean;
  className?: string;
}

export function Vazio({
  icone = '📭',
  titulo,
  descricao,
  acao,
  compacto = false,
  className = '',
}: PropsVazio) {
  return (
    <div
      className={`flex flex-col items-center gap-2 rounded-2xl border border-dashed border-borda text-center text-texto-2 ${
        compacto ? 'p-4' : 'p-12'
      } ${className}`}
    >
      <p aria-hidden className={compacto ? 'text-2xl' : 'text-4xl'}>
        {icone}
      </p>
      <p className={compacto ? 'text-xs' : 'text-base'}>{titulo}</p>
      {descricao && <div className={compacto ? 'text-[11px]' : 'text-sm'}>{descricao}</div>}
      {acao && <div className="mt-1">{acao}</div>}
    </div>
  );
}
