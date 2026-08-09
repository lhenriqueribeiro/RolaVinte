import type { ButtonHTMLAttributes } from 'react';

type Variante = 'primario' | 'secundario' | 'perigo' | 'fantasma';

const ESTILOS: Record<Variante, string> = {
  primario:
    'bg-ouro text-fundo font-semibold hover:bg-ouro-escuro disabled:opacity-50 disabled:cursor-not-allowed',
  secundario:
    'bg-painel-2 text-texto border border-borda hover:border-ouro/50 disabled:opacity-50 disabled:cursor-not-allowed',
  perigo: 'bg-perigo/15 text-perigo border border-perigo/40 hover:bg-perigo/25 disabled:opacity-50',
  fantasma: 'text-texto-2 hover:text-texto hover:bg-painel-2 disabled:opacity-50',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
}

export function Botao({ variante = 'primario', className = '', type = 'button', ...resto }: Props) {
  return (
    <button
      type={type}
      className={`rounded-lg px-4 py-2 text-sm transition-colors cursor-pointer ${ESTILOS[variante]} ${className}`}
      {...resto}
    />
  );
}
