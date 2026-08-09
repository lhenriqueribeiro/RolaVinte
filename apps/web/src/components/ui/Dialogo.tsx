import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Botao } from './Botao';
import { Erro } from './Estado';

const SELETOR_FOCAVEL = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

interface PropsDialogo {
  aberto: boolean;
  titulo: string;
  descricao?: ReactNode;
  /** Fechar sem confirmar: clique no fundo, botão de cancelar ou tecla Esc. */
  aoFechar: () => void;
  children?: ReactNode;
  rodape: ReactNode;
}

/**
 * Diálogo modal acessível: `aria-modal`, rótulo ligado ao título, foco preso
 * dentro do painel, Esc fecha e o foco volta para quem abriu.
 */
export function Dialogo({ aberto, titulo, descricao, aoFechar, children, rodape }: PropsDialogo) {
  const painelRef = useRef<HTMLDivElement>(null);
  const aoFecharRef = useRef(aoFechar);
  const tituloId = useId();
  const descricaoId = useId();

  // Mantém a última versão do callback sem reexecutar o efeito de foco a cada
  // render (senão o foco piscaria entre o painel e quem abriu o diálogo).
  useEffect(() => {
    aoFecharRef.current = aoFechar;
  });

  useEffect(() => {
    if (!aberto) return;
    const painel = painelRef.current;
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const primeiro = painel?.querySelector<HTMLElement>(SELETOR_FOCAVEL);
    (primeiro ?? painel)?.focus();

    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') {
        evento.preventDefault();
        aoFecharRef.current();
        return;
      }
      if (evento.key !== 'Tab' || !painel) return;
      const focaveis = Array.from(painel.querySelectorAll<HTMLElement>(SELETOR_FOCAVEL));
      const inicio = focaveis[0];
      const fim = focaveis[focaveis.length - 1];
      if (!inicio || !fim) {
        evento.preventDefault();
        painel.focus();
        return;
      }
      const ativo = document.activeElement;
      if (evento.shiftKey && (ativo === inicio || ativo === painel)) {
        evento.preventDefault();
        fim.focus();
      } else if (!evento.shiftKey && ativo === fim) {
        evento.preventDefault();
        inicio.focus();
      }
    }

    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      anterior?.focus();
    };
  }, [aberto]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fechar sem confirmar"
        // Fora da ordem de tabulação: pelo teclado se fecha com Esc ou com o
        // botão de cancelar, ambos dentro do foco preso.
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-black/70"
        onClick={aoFechar}
      />
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={descricao ? descricaoId : undefined}
        tabIndex={-1}
        className="relative w-full max-w-md rounded-2xl border border-borda bg-painel p-6 shadow-2xl focus:outline-none"
      >
        <h2 id={tituloId} className="font-titulo text-xl text-texto">
          {titulo}
        </h2>
        {descricao && (
          <div id={descricaoId} className="mt-2 text-sm text-texto-2">
            {descricao}
          </div>
        )}
        {children}
        <div className="mt-5 flex flex-wrap justify-end gap-2">{rodape}</div>
      </div>
    </div>
  );
}

interface PropsConfirmacao {
  aberto: boolean;
  titulo: string;
  descricao: ReactNode;
  rotuloConfirmar: string;
  rotuloCancelar?: string;
  processando?: boolean;
  /**
   * O que a mutação rejeitou — o objeto, não a mensagem já extraída. Assim o
   * texto sai de um lugar só (`mensagemDeErro`) e a página não precisa saber
   * que `error.message` existe.
   */
  erro?: unknown;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}

/**
 * Confirmação de ação destrutiva. O botão de cancelar vem primeiro: é ele que
 * recebe o foco ao abrir, então um Enter distraído não destrói nada.
 */
export function DialogoConfirmacao({
  aberto,
  titulo,
  descricao,
  rotuloConfirmar,
  rotuloCancelar = 'Cancelar',
  processando = false,
  erro = null,
  aoConfirmar,
  aoCancelar,
}: PropsConfirmacao) {
  return (
    <Dialogo
      aberto={aberto}
      titulo={titulo}
      descricao={descricao}
      aoFechar={aoCancelar}
      rodape={
        <>
          <Botao variante="secundario" onClick={aoCancelar} disabled={processando}>
            {rotuloCancelar}
          </Botao>
          <Botao variante="perigo" onClick={aoConfirmar} disabled={processando}>
            {processando ? 'Aguarde…' : rotuloConfirmar}
          </Botao>
        </>
      }
    >
      {erro != null && <Erro erro={erro} compacto className="mt-3" />}
    </Dialogo>
  );
}
