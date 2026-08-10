import { useId, useRef, useState, type FormEvent } from 'react';
import type { TokenDTO } from '@rolavinte/shared';
import { TIPOS_IMAGEM_TOKEN } from '@rolavinte/shared';
import { Botao } from '@/components/ui/Botao';
import { Erro } from '@/components/ui/Estado';
import { useAtualizarToken, useDefinirImagemToken } from './api';
import { SeletorCondicoes } from './SeletorCondicoes';

interface Props {
  mesaId: string;
  token: TokenDTO;
  /** Mesa encerrada: o painel continua visível, com tudo travado e o motivo à vista. */
  motivoBloqueio: string | null;
  aoFechar: () => void;
}

/**
 * Propriedades do token selecionado (RV-040 / RV-041) — renderizado apenas
 * para o mestre. A autorização de verdade é do domínio: o jogador que forjar a
 * requisição recebe 403 de `PATCH /tokens/:id`, e continua podendo mover o
 * token do próprio personagem.
 *
 * O formulário nasce com os valores do token porque quem monta passa
 * `key={token.id}`: selecionar outra peça remonta o painel, em vez de sincronizar
 * campos por efeito. Uma edição vinda pelo socket enquanto o mestre digita **não**
 * apaga o que ele escreveu — só o "Salvar" resolve a divergência.
 */
export function PainelTokenSelecionado({ mesaId, token, motivoBloqueio, aoFechar }: Props) {
  const atualizar = useAtualizarToken(mesaId);
  const enviarArte = useDefinirImagemToken(mesaId);
  const [nome, setNome] = useState(token.nome);
  const [cor, setCor] = useState(token.cor);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const idNome = useId();
  const idCor = useId();
  const idArte = useId();

  const bloqueado = motivoBloqueio !== null;
  const alterado = nome.trim() !== token.nome || cor !== token.cor;

  function submeter(evento: FormEvent) {
    evento.preventDefault();
    atualizar.mutate({ tokenId: token.id, campos: { nome: nome.trim(), cor } });
  }

  function enviarArquivoSelecionado() {
    const arquivo = arquivoRef.current?.files?.[0];
    if (!arquivo) return;
    enviarArte.mutate(
      { tokenId: token.id, arquivo },
      {
        onSuccess: () => {
          if (arquivoRef.current) arquivoRef.current.value = '';
        },
      },
    );
  }

  return (
    <aside
      aria-label={`Propriedades do token ${token.nome}`}
      className="absolute right-2 top-2 z-30 w-60 rounded-xl border border-borda bg-painel/95 p-3 shadow-2xl backdrop-blur"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-titulo text-sm text-ouro">♟️ Token selecionado</h3>
        <Botao
          variante="fantasma"
          className="!px-2 !py-0.5 text-xs"
          aria-label="Fechar propriedades do token"
          onClick={aoFechar}
        >
          ✕
        </Botao>
      </div>

      <form onSubmit={submeter} className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={idNome} className="text-xs text-texto-2">
            Nome
          </label>
          <input
            id={idNome}
            value={nome}
            maxLength={60}
            disabled={bloqueado}
            onChange={(e) => setNome(e.target.value)}
            className="rounded-lg border border-borda bg-fundo px-2 py-1.5 text-sm text-texto focus:border-ouro focus:outline-none disabled:opacity-50"
          />
        </div>

        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={idCor} className="text-xs text-texto-2">
              Cor
            </label>
            <input
              id={idCor}
              type="color"
              value={cor}
              disabled={bloqueado}
              onChange={(e) => setCor(e.target.value)}
              className="h-8 w-12 cursor-pointer rounded border border-borda bg-fundo disabled:opacity-50"
            />
          </div>
          <Botao
            type="submit"
            className="!px-3 !py-1.5 text-xs"
            disabled={bloqueado || !alterado || atualizar.isPending}
          >
            {atualizar.isPending ? 'Salvando…' : 'Salvar'}
          </Botao>
        </div>

        {atualizar.isError && <Erro erro={atualizar.error} compacto />}
      </form>

      <div className="mt-3 flex flex-col gap-1 border-t border-borda pt-2">
        <label htmlFor={idArte} className="text-xs text-texto-2">
          Arte do token
        </label>
        <input
          id={idArte}
          ref={arquivoRef}
          type="file"
          accept={TIPOS_IMAGEM_TOKEN.join(',')}
          disabled={bloqueado}
          className="text-[11px] text-texto-2 file:mr-2 file:cursor-pointer file:rounded file:border file:border-borda file:bg-painel-2 file:px-2 file:py-1 file:text-[11px] file:text-texto disabled:opacity-50"
        />
        <Botao
          variante="secundario"
          className="!px-3 !py-1 text-xs"
          disabled={bloqueado || enviarArte.isPending}
          onClick={enviarArquivoSelecionado}
        >
          {enviarArte.isPending ? 'Enviando…' : 'Enviar arte'}
        </Botao>
        <p className="text-[10px] text-texto-2">PNG, JPEG ou WebP, até 8 MB.</p>
        {enviarArte.isError && <Erro erro={enviarArte.error} compacto />}
      </div>

      <SeletorCondicoes mesaId={mesaId} token={token} motivoBloqueio={motivoBloqueio} />

      {motivoBloqueio && <p className="mt-2 text-[11px] text-texto-2">{motivoBloqueio}</p>}
    </aside>
  );
}
