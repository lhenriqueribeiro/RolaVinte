import { useId, useRef, useState } from 'react';
import type { CenaDTO } from '@rolavinte/shared';
import { TAMANHO_CELULA_MAX, TAMANHO_CELULA_MIN, TIPOS_IMAGEM_FUNDO } from '@rolavinte/shared';
import { Botao } from '@/components/ui/Botao';
import { Erro } from '@/components/ui/Estado';
import { useAtualizarCena, useDefinirFundoCena } from './api';

interface Props {
  mesaId: string;
  cena: CenaDTO;
  motivoBloqueio: string | null;
}

/**
 * Mapa de fundo e configuração do grid da cena em jogo (RV-032 / RV-033).
 *
 * O tamanho da célula é o que faz o grid coincidir com o desenho do mapa: o
 * `Tabletop` lê `cena.tamanhoCelula`, e não uma constante, desde o RV-033.
 *
 * Quem monta passa `key={cena.id}`: trocar a cena em jogo remonta o painel com
 * os valores da cena nova, sem sincronizar campo por efeito. Enquanto a cena é
 * a mesma, o que o mestre digitou no campo de célula é preservado.
 */
export function PropriedadesCena({ mesaId, cena, motivoBloqueio }: Props) {
  const atualizar = useAtualizarCena(mesaId);
  const enviarFundo = useDefinirFundoCena(mesaId);
  const [celula, setCelula] = useState(cena.tamanhoCelula);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const idCelula = useId();
  const idCorGrid = useId();
  const idVisivel = useId();
  const idArquivo = useId();

  const bloqueado = motivoBloqueio !== null;

  function salvarCelula() {
    if (celula === cena.tamanhoCelula) return;
    atualizar.mutate({ cenaId: cena.id, campos: { tamanhoCelula: celula } });
  }

  function enviarArquivoSelecionado() {
    const arquivo = arquivoRef.current?.files?.[0];
    if (!arquivo) return;
    enviarFundo.mutate(
      { cenaId: cena.id, arquivo },
      {
        onSuccess: () => {
          if (arquivoRef.current) arquivoRef.current.value = '';
        },
      },
    );
  }

  return (
    <section className="rounded-xl border border-borda bg-painel-2 p-3">
      <h3 className="mb-2 font-titulo text-sm text-ouro">🖼️ Mapa e grid — {cena.nome}</h3>

      <div className="flex flex-col gap-1">
        <label htmlFor={idArquivo} className="text-xs text-texto-2">
          Imagem de fundo
        </label>
        <input
          id={idArquivo}
          ref={arquivoRef}
          type="file"
          accept={TIPOS_IMAGEM_FUNDO.join(',')}
          disabled={bloqueado}
          className="text-[11px] text-texto-2 file:mr-2 file:cursor-pointer file:rounded file:border file:border-borda file:bg-painel file:px-2 file:py-1 file:text-[11px] file:text-texto disabled:opacity-50"
        />
        <div className="flex items-center gap-2">
          <Botao
            variante="secundario"
            className="!px-3 !py-1 text-xs"
            disabled={bloqueado || enviarFundo.isPending}
            onClick={enviarArquivoSelecionado}
          >
            {enviarFundo.isPending ? 'Enviando…' : 'Enviar mapa'}
          </Botao>
          <span className="text-[10px] text-texto-2">
            {cena.imagemFundoUrl ? 'Esta cena já tem mapa.' : 'Sem mapa nesta cena.'}
          </span>
        </div>
        <p className="text-[10px] text-texto-2">
          PNG, JPEG ou WebP, até 8 MB. Subir outro mapa substitui o atual.
        </p>
        {enviarFundo.isError && <Erro erro={enviarFundo.error} compacto />}
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t border-borda pt-3">
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor={idCelula} className="text-xs text-texto-2">
              Tamanho da célula (px)
            </label>
            <input
              id={idCelula}
              type="number"
              min={TAMANHO_CELULA_MIN}
              max={TAMANHO_CELULA_MAX}
              value={celula}
              disabled={bloqueado}
              onChange={(e) => setCelula(Number(e.target.value))}
              className="w-full rounded-lg border border-borda bg-fundo px-2 py-1.5 text-sm text-texto focus:border-ouro focus:outline-none disabled:opacity-50"
            />
          </div>
          <Botao
            className="!px-3 !py-1.5 text-xs"
            disabled={bloqueado || celula === cena.tamanhoCelula || atualizar.isPending}
            onClick={salvarCelula}
          >
            Aplicar
          </Botao>
        </div>
        <p className="text-[10px] text-texto-2">
          Entre {TAMANHO_CELULA_MIN} e {TAMANHO_CELULA_MAX} px. Ajuste até o grid coincidir com o
          desenho do mapa.
        </p>

        <div className="flex items-center gap-2">
          <input
            id={idVisivel}
            type="checkbox"
            checked={cena.gridVisivel}
            disabled={bloqueado || atualizar.isPending}
            onChange={(e) =>
              atualizar.mutate({ cenaId: cena.id, campos: { gridVisivel: e.target.checked } })
            }
            className="h-4 w-4 cursor-pointer accent-ouro disabled:opacity-50"
          />
          <label htmlFor={idVisivel} className="cursor-pointer text-xs text-texto-2">
            Exibir grid
          </label>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor={idCorGrid} className="text-xs text-texto-2">
            Cor do grid
          </label>
          <input
            id={idCorGrid}
            type="color"
            value={cena.corGrid}
            disabled={bloqueado}
            onChange={(e) =>
              atualizar.mutate({ cenaId: cena.id, campos: { corGrid: e.target.value } })
            }
            className="h-8 w-12 cursor-pointer rounded border border-borda bg-fundo disabled:opacity-50"
          />
        </div>

        {atualizar.isError && <Erro erro={atualizar.error} compacto />}
        {motivoBloqueio && <p className="text-[11px] text-texto-2">{motivoBloqueio}</p>}
      </div>
    </section>
  );
}
