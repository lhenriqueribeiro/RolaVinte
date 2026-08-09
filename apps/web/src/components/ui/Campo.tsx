import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const ESTILO_INPUT =
  'w-full rounded-lg border border-borda bg-fundo px-3 py-2 text-sm text-texto placeholder:text-texto-2/60 focus:border-ouro focus:outline-none';

interface PropsCampo extends InputHTMLAttributes<HTMLInputElement> {
  rotulo: string;
}

export function Campo({ rotulo, className = '', ...resto }: PropsCampo) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-texto-2">
        {rotulo}
      </label>
      <input id={id} className={`${ESTILO_INPUT} ${className}`} {...resto} />
    </div>
  );
}

interface PropsArea extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  rotulo: string;
}

export function CampoArea({ rotulo, className = '', ...resto }: PropsArea) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-texto-2">
        {rotulo}
      </label>
      <textarea id={id} className={`${ESTILO_INPUT} min-h-20 ${className}`} {...resto} />
    </div>
  );
}
