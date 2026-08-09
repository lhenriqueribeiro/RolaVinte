import { useState, type PointerEvent } from 'react';
import type { PersonagemDTO, TokenDTO } from '@rolavinte/shared';
import { CLASSE_DA_FAIXA, faixaDeVida, fracaoDeVida, rotuloDeVida } from './aparencia';

interface Props {
  token: TokenDTO;
  /** Personagem vinculado ao token, quando existe — fonte única do PV (RV-042). */
  personagem: PersonagemDTO | null;
  /** Canto superior esquerdo em pixels de mundo (sem escala). */
  x: number;
  y: number;
  tamanhoCelula: number;
  selecionado: boolean;
  arrastando: boolean;
  podeMover: boolean;
  aoApontar: (evento: PointerEvent<HTMLButtonElement>) => void;
}

/**
 * Peça no mapa: arte recortada em círculo (RV-041), com fallback de cor mais
 * as iniciais do nome, e barra de vida quando há personagem vinculado (RV-042).
 *
 * O PV **não** é copiado para cá: chega pelo `personagem`, que vem do cache
 * `['personagens', mesaId]`. Guardar o PV em estado local faria a barra
 * congelar no primeiro dano vindo pelo socket.
 */
export function PecaToken({
  token,
  personagem,
  x,
  y,
  tamanhoCelula,
  selecionado,
  arrastando,
  podeMover,
  aoApontar,
}: Props) {
  // Imagem que responde 404 (ou some do Storage) não pode deixar um buraco no
  // mapa: o `onError` devolve a peça ao fallback de cor, sem erro no console.
  // Guardamos a URL que falhou, e não um booleano: assim uma arte nova volta a
  // ser tentada sem precisar de efeito para desfazer a marca.
  const [urlQueFalhou, setUrlQueFalhou] = useState<string | null>(null);

  const temArte = token.imagemUrl !== null && token.imagemUrl !== urlQueFalhou;
  const rotuloVida = personagem ? rotuloDeVida(personagem.pvAtual, personagem.pvMax) : null;

  return (
    <div
      className={`absolute ${arrastando ? 'z-20' : 'z-10 transition-[left,top] duration-150'}`}
      style={{ left: x, top: y, width: tamanhoCelula, height: tamanhoCelula }}
    >
      <button
        type="button"
        aria-label={rotuloVida ? `Token ${token.nome}, ${rotuloVida}` : `Token ${token.nome}`}
        onPointerDown={aoApontar}
        className={`absolute inset-[3px] flex items-center justify-center overflow-hidden rounded-full border-2 text-[10px] font-bold text-white shadow-lg ${
          podeMover ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
        } ${selecionado ? 'ring-2 ring-ouro ring-offset-1 ring-offset-black/40' : ''}`}
        style={{
          // A borda mantém a cor definida mesmo com arte (RV-041); sem arte a
          // cor também preenche o círculo.
          borderColor: token.cor,
          backgroundColor: token.cor,
          touchAction: 'none',
        }}
      >
        {temArte && token.imagemUrl !== null && (
          <img
            src={token.imagemUrl}
            alt=""
            aria-hidden
            draggable={false}
            onError={() => setUrlQueFalhou(token.imagemUrl)}
            className="pointer-events-none absolute inset-0 h-full w-full rounded-full object-cover"
          />
        )}
        {!temArte && (
          <span className="pointer-events-none truncate px-1" title={token.nome}>
            {token.nome.slice(0, 4)}
          </span>
        )}
      </button>

      {personagem && rotuloVida && (
        <div className="pointer-events-none absolute inset-x-1 bottom-0">
          <div
            role="progressbar"
            aria-label={`Pontos de vida de ${personagem.nome}`}
            aria-valuemin={0}
            aria-valuemax={personagem.pvMax}
            aria-valuenow={personagem.pvAtual}
            aria-valuetext={rotuloVida}
            className="h-1.5 overflow-hidden rounded-full border border-black/50 bg-black/70"
          >
            <div
              className={`h-full ${CLASSE_DA_FAIXA[faixaDeVida(personagem.pvAtual, personagem.pvMax)]}`}
              style={{ width: `${fracaoDeVida(personagem.pvAtual, personagem.pvMax) * 100}%` }}
            />
          </div>
          {/* A cor sozinha não informa: os PV vão escritos embaixo da barra. */}
          <p className="mt-0.5 text-center text-[9px] leading-none tabular-nums text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
            {rotuloVida}
          </p>
        </div>
      )}
    </div>
  );
}
