import { useEffect, useRef, useState, type FormEvent } from 'react';
import { comandoEhAviso, interpretarComando, listarUsosDeComandos } from '@rolavinte/shared';
import { Botao } from '@/components/ui/Botao';
import { Carregando, Erro, mensagemDeErro, Vazio } from '@/components/ui/Estado';
import { useSessao } from '@/features/auth/store-sessao';
import { useMesa } from '@/features/mesas/api';
import { useEnviarComandoChat, useMensagens } from './api';
import { MensagemChat } from './MensagemChat';
import { estaNoFim, rotuloNaoLidas } from './rolagem-chat';

/**
 * Chat da mesa.
 *
 * Uma gramática só (RV-074): a linha digitada vai crua para
 * `POST /mesas/:mesaId/chat` e quem a interpreta é `interpretarComando`, de
 * `@rolavinte/shared` — o mesmo parser que o servidor roda. O regex
 * `/^\/r(?:olar)?\s+(.+)$/i` que morava aqui era uma segunda gramática,
 * invisível, que já divergia: `/sussurro` virava uma fala com o texto literal
 * "sussurro @Fulano …" para a mesa inteira.
 *
 * O front chama o parser por um motivo só: decidir entre **avisar aqui** e
 * **postar**. Nada de classificar a ação para o servidor — se o cliente
 * mandasse `{ tipo: 'rolagem-oculta' }`, seria ele escolhendo o caminho de
 * autorização.
 */

const AVISO_OCULTO_SO_DO_MESTRE =
  'A rolagem oculta é exclusiva do mestre desta mesa. Use /r para rolar à vista de todos.';

export function Chat({
  mesaId,
  motivoBloqueio = null,
}: {
  mesaId: string;
  /** Mesa encerrada: só leitura, com o motivo à vista (RV-023). */
  motivoBloqueio?: string | null;
}) {
  const usuario = useSessao((s) => s.usuario);
  // Mesma `queryKey` que a página já carregou: nenhuma requisição a mais e
  // nenhuma segunda fonte de verdade sobre o meu papel na mesa.
  const mesa = useMesa(mesaId);
  const souMestre = mesa.data?.meuPapel === 'mestre';

  const mensagens = useMensagens(mesaId);
  const enviar = useEnviarComandoChat(mesaId);

  const [texto, setTexto] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);

  const listaRef = useRef<HTMLDivElement>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  // Espelho da leitura da rolagem: o efeito de auto-scroll precisa saber onde o
  // usuário está sem depender de estado (setState dentro de efeito é erro de
  // lint neste repositório, e aqui também seria um render a mais por mensagem).
  const noFimRef = useRef(true);

  const total = mensagens.data?.length ?? 0;
  /**
   * Marco do momento em que o usuário saiu do fim da lista. Enquanto ele estiver
   * lendo o histórico, tudo o que chegar depois deste marco é "não lido" — e a
   * tela **não** desce sozinha (RV-073).
   */
  const [marco, setMarco] = useState<{ noFim: boolean; totalAoSair: number }>({
    noFim: true,
    totalAoSair: 0,
  });
  const naoLidas = marco.noFim ? 0 : Math.max(total - marco.totalAoSair, 0);

  function aoRolar() {
    const lista = listaRef.current;
    if (!lista) return;
    const noFim = estaNoFim(lista);
    noFimRef.current = noFim;
    setMarco((atual) =>
      atual.noFim === noFim ? atual : { noFim, totalAoSair: noFim ? 0 : total },
    );
  }

  function descerAteOFim() {
    noFimRef.current = true;
    setMarco({ noFim: true, totalAoSair: 0 });
    fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  // Mensagem nova só puxa a tela para quem já estava no fim. Quem está lendo
  // para trás vê o aviso de não lidas e desce quando quiser.
  useEffect(() => {
    if (!noFimRef.current) return;
    fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [total]);

  function submeter(evento: FormEvent) {
    evento.preventDefault();
    const linha = texto.trim();
    if (!linha) return;
    setAviso(null);

    const comando = interpretarComando(linha);
    if (comandoEhAviso(comando)) {
      // Comando inexistente ou incompleto: o aviso do parser é o mesmo texto que
      // a API devolveria em 400. Mostrar aqui poupa a ida sem inventar mensagem.
      setAviso(comando.aviso);
      return;
    }
    if (comando.tipo === 'rolagem-oculta' && mesa.isSuccess && !souMestre) {
      // Cortesia, não proteção: quem autoriza é `mesa.autorizarEscritaDoMestre`
      // no servidor, que devolve 403 mesmo se esta linha sumir (RV-071). O
      // `isSuccess` evita a mentira inversa — enquanto o papel não chegou,
      // deixamos o servidor responder em vez de acusar o mestre de não ser um.
      setAviso(AVISO_OCULTO_SO_DO_MESTRE);
      return;
    }

    enviar.mutate(linha, {
      onSuccess: () => setTexto(''),
      onError: (falha) => setAviso(mensagemDeErro(falha)),
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative min-h-0 flex-1">
        {/* `role="log"` traz `aria-live="polite"` implícito: mensagem nova é
            anunciada sem roubar o foco de quem está digitando. */}
        <div
          ref={listaRef}
          role="log"
          aria-label="Histórico da conversa"
          onScroll={aoRolar}
          className="h-full space-y-2 overflow-y-auto p-3"
        >
          {mensagens.isPending && <Carregando rotulo="Carregando a conversa…" compacto />}
          {mensagens.isError && (
            <Erro
              erro={mensagens.error}
              compacto
              retentando={mensagens.isFetching}
              aoRetentar={() => void mensagens.refetch()}
            />
          )}
          {mensagens.isSuccess && total === 0 && (
            <Vazio
              compacto
              icone="💬"
              titulo="Nenhuma mensagem ainda."
              descricao={motivoBloqueio ? undefined : 'Diga alguma coisa ou role os dados.'}
            />
          )}
          {mensagens.data?.map((m) => (
            <MensagemChat key={m.id} mensagem={m} usuarioId={usuario?.id ?? null} />
          ))}
          <div ref={fimRef} />
        </div>

        {naoLidas > 0 && (
          <div role="status" className="absolute inset-x-0 bottom-2 flex justify-center">
            <button
              type="button"
              onClick={descerAteOFim}
              className="cursor-pointer rounded-full border border-ouro/50 bg-painel px-3 py-1 text-xs text-ouro shadow-lg transition-colors hover:bg-painel-2"
            >
              ↓ {rotuloNaoLidas(naoLidas)}
            </button>
          </div>
        )}
      </div>

      <form onSubmit={submeter} className="border-t border-borda p-3">
        {aviso && <Erro erro={aviso} compacto className="mb-2" />}
        <div className="flex gap-2">
          <input
            aria-label="Mensagem"
            className="min-w-0 flex-1 rounded-lg border border-borda bg-fundo px-3 py-2 text-sm placeholder:text-texto-2/60 focus:border-ouro focus:outline-none disabled:opacity-50"
            placeholder={
              motivoBloqueio ? 'Chat somente leitura' : 'Mensagem ou "/r 1d20+5 # iniciativa"'
            }
            disabled={motivoBloqueio !== null}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <Botao
            type="submit"
            disabled={motivoBloqueio !== null || enviar.isPending}
            title={motivoBloqueio ?? undefined}
          >
            Enviar
          </Botao>
        </div>
        <p className="mt-1.5 text-[11px] text-texto-2">
          {motivoBloqueio ? (
            <>{motivoBloqueio} O histórico acima continua disponível para leitura.</>
          ) : (
            // A dica vem do registry: comando novo aparece aqui sem editar o Chat.
            <>Comandos: {listarUsosDeComandos()}</>
          )}
        </p>
      </form>
    </div>
  );
}
