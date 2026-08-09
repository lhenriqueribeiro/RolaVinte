import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { MensagemDTO, TermoAvaliado } from '@rolavinte/shared';
import { Botao } from '@/components/ui/Botao';
import { useSessao } from '@/features/auth/store-sessao';
import { useEnviarMensagem, useMensagens, useRolarDados } from './api';

function DetalheRolagem({ termos }: { termos: TermoAvaliado[] }) {
  return (
    <span className="text-xs text-texto-2">
      {termos.map((termo, i) => (
        <span key={i}>
          {i > 0 && <span> {termo.sinal === 1 ? '+' : '−'} </span>}
          {i === 0 && termo.sinal === -1 && <span>− </span>}
          {termo.tipo === 'constante' ? (
            termo.valor
          ) : (
            <span>
              {termo.quantidade}d{termo.faces}
              {termo.manter ? `${termo.manter.modo}${termo.manter.quantidade}` : ''} [
              {termo.dados.map((d, j) => (
                <span key={j} className={d.descartado ? 'line-through opacity-50' : ''}>
                  {j > 0 && ', '}
                  {d.valor}
                </span>
              ))}
              ]
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

function ItemMensagem({ mensagem, minha }: { mensagem: MensagemDTO; minha: boolean }) {
  const hora = new Date(mensagem.criadoEm).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (mensagem.tipo === 'rolagem' && mensagem.rolagem) {
    return (
      <div className="rounded-lg border border-ouro/30 bg-ouro/5 px-3 py-2">
        <p className="text-xs text-texto-2">
          <span className={minha ? 'text-ouro' : 'text-texto'}>{mensagem.autorNome}</span> rolou{' '}
          <code className="text-ouro">{mensagem.rolagem.expressao}</code>
          {mensagem.motivo && <span> · {mensagem.motivo}</span>} · {hora}
        </p>
        <p className="my-0.5 font-titulo text-2xl text-ouro">🎲 {mensagem.rolagem.total}</p>
        <DetalheRolagem termos={mensagem.rolagem.termos} />
      </div>
    );
  }

  return (
    <div className="px-1 py-0.5">
      <p className="text-sm">
        <span className={`font-semibold ${minha ? 'text-ouro' : 'text-texto'}`}>
          {mensagem.autorNome}
        </span>{' '}
        <span className="text-xs text-texto-2">{hora}</span>
      </p>
      <p className="text-sm text-texto/90 whitespace-pre-wrap break-words">{mensagem.conteudo}</p>
    </div>
  );
}

/**
 * Chat da mesa. Comandos: "/r <expressão> [# motivo]" rola dados
 * (ex.: "/r 2d20kh1+5 # ataque com vantagem").
 */
export function Chat({
  mesaId,
  motivoBloqueio = null,
}: {
  mesaId: string;
  /** Mesa encerrada: só leitura, com o motivo à vista (RV-023). */
  motivoBloqueio?: string | null;
}) {
  const usuario = useSessao((s) => s.usuario);
  const mensagens = useMensagens(mesaId);
  const enviar = useEnviarMensagem(mesaId);
  const rolar = useRolarDados(mesaId);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens.data?.length]);

  function submeter(e: FormEvent) {
    e.preventDefault();
    const conteudo = texto.trim();
    if (!conteudo) return;
    setErro(null);

    const comandoRolagem = /^\/r(?:olar)?\s+(.+)$/i.exec(conteudo);
    if (comandoRolagem) {
      const [expressao, ...motivoPartes] = comandoRolagem[1]!.split('#');
      rolar.mutate(
        { expressao: expressao!.trim(), motivo: motivoPartes.join('#').trim() },
        { onSuccess: () => setTexto(''), onError: (e) => setErro(e.message) },
      );
      return;
    }

    enviar.mutate(conteudo, { onSuccess: () => setTexto(''), onError: (e) => setErro(e.message) });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {mensagens.isPending && <p className="text-sm text-texto-2">Carregando conversa…</p>}
        {mensagens.data?.map((m) => (
          <ItemMensagem key={m.id} mensagem={m} minha={m.autorId === usuario?.id} />
        ))}
        <div ref={fimRef} />
      </div>

      <form onSubmit={submeter} className="border-t border-borda p-3">
        {erro && <p className="mb-2 text-xs text-perigo">{erro}</p>}
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
            disabled={motivoBloqueio !== null || enviar.isPending || rolar.isPending}
            title={motivoBloqueio ?? undefined}
          >
            Enviar
          </Botao>
        </div>
        <p className="mt-1.5 text-[11px] text-texto-2">
          {motivoBloqueio ? (
            <>{motivoBloqueio} O histórico acima continua disponível para leitura.</>
          ) : (
            <>
              Dica: <code>/r 4d6kh3</code> rola 4d6 mantendo os 3 maiores.
            </>
          )}
        </p>
      </form>
    </div>
  );
}
