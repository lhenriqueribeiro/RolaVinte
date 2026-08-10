import type { TokenDTO } from '@rolavinte/shared';
import { CONDICOES, CONDICOES_DISPONIVEIS, normalizarCondicoes } from '@rolavinte/shared';
import { Erro } from '@/components/ui/Estado';
import { useAlternarCondicaoToken } from './api';

interface Props {
  mesaId: string;
  token: TokenDTO;
  /** Mesa encerrada: os botões continuam visíveis, travados, com o motivo à vista. */
  motivoBloqueio: string | null;
}

/**
 * Marcação de condições da peça selecionada (RV-064) — só o mestre vê este
 * painel, e o 403 de `PATCH /tokens/:id/condicoes` é quem de fato protege.
 *
 * ## O catálogo é o ponto de extensão, e este componente prova isso
 *
 * A lista de botões é `CONDICOES_DISPONIVEIS`, de `@rolavinte/shared`. Não existe
 * aqui nenhum nome de condição escrito à mão, nenhum `if` por chave e nenhuma
 * ordenação própria: acrescentar uma condição ao catálogo faz o botão aparecer,
 * com rótulo e ícone, sem tocar neste arquivo.
 *
 * ## Nada informa só por cor ou só por forma
 *
 * Cada botão mostra **ícone e rótulo escritos**, e o estado marcado é dito em
 * `aria-pressed` — não apenas pelo contorno dourado. Um botão que dependesse da
 * cor de fundo para dizer "está ativo" seria invisível para quem não distingue a
 * cor, e é regra do projeto desde a v0.5.0.
 */
export function SeletorCondicoes({ mesaId, token, motivoBloqueio }: Props) {
  const alternar = useAlternarCondicaoToken(mesaId);
  const bloqueado = motivoBloqueio !== null;

  // Tolerante à ausência do campo, como o `PecaToken`: DTO em cache de antes
  // deste card chega sem `condicoes`.
  const ativas = new Set(normalizarCondicoes(token.condicoes ?? []));

  return (
    <div className="mt-3 flex flex-col gap-1 border-t border-borda pt-2">
      <p className="text-xs text-texto-2" id={`condicoes-${token.id}`}>
        Condições
      </p>
      <div
        role="group"
        aria-labelledby={`condicoes-${token.id}`}
        className="grid grid-cols-2 gap-1"
      >
        {CONDICOES_DISPONIVEIS.map((chave) => {
          const definicao = CONDICOES[chave];
          const ativa = ativas.has(chave);
          return (
            <button
              key={chave}
              type="button"
              // `aria-pressed` é o que transmite "marcada" sem depender do
              // destaque visual. O rótulo do botão continua sendo só o nome da
              // condição, para que a lista seja navegável sem ambiguidade.
              aria-pressed={ativa}
              disabled={bloqueado || alternar.isPending}
              title={motivoBloqueio ?? `${definicao.rotulo} — ${definicao.descricao}`}
              onClick={() =>
                alternar.mutate({ tokenId: token.id, condicao: chave, aplicada: !ativa })
              }
              className={`flex items-center gap-1 rounded-lg border px-1.5 py-1 text-left text-[11px] transition-colors disabled:opacity-50 ${
                ativa
                  ? 'border-ouro bg-ouro/20 font-semibold text-texto'
                  : 'border-borda bg-painel-2 text-texto-2 hover:text-texto'
              }`}
            >
              <span aria-hidden className="text-xs leading-none">
                {definicao.icone}
              </span>
              <span className="truncate">{definicao.rotulo}</span>
            </button>
          );
        })}
      </div>
      {alternar.isError && <Erro erro={alternar.error} compacto />}
    </div>
  );
}
