/**
 * Esqueletos de carregamento (RV-122).
 *
 * Lista que carrega mostra o **formato** do que vem, não a frase "Carregando…":
 * o layout não pula quando os dados chegam e o usuário já entende o que esperar.
 *
 * O esqueleto em si é decorativo (`aria-hidden`) — quem anuncia é o `role="status"`
 * do contêiner, com um rótulo em PT-BR. Sem isso, um leitor de tela leria uma
 * sequência de caixas vazias, ou pior: nada.
 */

interface PropsEsqueleto {
  className?: string;
}

export function Esqueleto({ className = 'h-4 w-full' }: PropsEsqueleto) {
  return <span aria-hidden className={`block animate-pulse rounded-md bg-painel-2 ${className}`} />;
}

interface PropsLista {
  /** Quantas silhuetas desenhar. Aproxime da quantidade típica da lista. */
  itens?: number;
  /** Altura de cada silhueta, em classe Tailwind (o formato do card real). */
  altura?: string;
  /** O que está sendo carregado, em PT-BR — é o texto anunciado. */
  rotulo: string;
  className?: string;
}

export function ListaEsqueleto({
  itens = 3,
  altura = 'h-24',
  rotulo,
  className = 'flex flex-col gap-3',
}: PropsLista) {
  return (
    <div role="status" className={className}>
      <span className="sr-only">{rotulo}</span>
      {Array.from({ length: itens }, (_, i) => (
        <Esqueleto key={i} className={`w-full ${altura}`} />
      ))}
    </div>
  );
}
