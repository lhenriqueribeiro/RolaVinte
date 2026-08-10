import { useState, type PointerEvent } from 'react';
import type { PersonagemDTO, TokenDTO } from '@rolavinte/shared';
import { CONDICOES, normalizarCondicoes } from '@rolavinte/shared';
import { CLASSE_DA_FAIXA, faixaDeVida, fracaoDeVida, rotuloDeVida } from './aparencia';

/**
 * O que o marcador do turno diz, escrito uma vez: ele vai para o `aria-label` do
 * símbolo, para o `title` e (em minúsculas) para o rótulo do botão da peça. Três
 * redações da mesma informação divergiriam.
 */
export const ROTULO_NO_TURNO = 'No turno';

interface Props {
  token: TokenDTO;
  /** Personagem vinculado ao token, quando existe — fonte única do PV (RV-042). */
  personagem: PersonagemDTO | null;
  /** Canto superior esquerdo em pixels de mundo (sem escala). */
  x: number;
  y: number;
  tamanhoCelula: number;
  selecionado: boolean;
  /**
   * A vez do combate é desta peça (RV-063). Opcional e `false` por omissão: o
   * mapa funciona fora da luta, e nem toda montagem do tabletop tem combate.
   */
  noTurno?: boolean;
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
  noTurno = false,
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

  // `normalizarCondicoes` e não `token.condicoes` direto: um `TokenDTO` em cache
  // de antes do RV-064 chega **sem** o campo, e um payload de uma versão futura
  // pode trazer chave que este cliente não conhece. As duas situações viram
  // "nenhuma condição a mais para desenhar", em vez de um `undefined.map`.
  const condicoes = normalizarCondicoes(token.condicoes ?? []);
  const rotulosCondicoes = condicoes.map((chave) => CONDICOES[chave].rotulo);

  /**
   * Rótulo do botão da peça. As condições entram aqui **além** de aparecerem na
   * lista de ícones ao lado: quem navega por teclado chega ao botão, e o estado
   * da peça tem de ser legível no elemento com que se interage — repetir a
   * informação em dois lugares custa menos que escondê-la de quem usa leitor de
   * tela.
   */
  const rotuloDaPeca = [
    `Token ${token.nome}`,
    // Logo depois do nome: quem chega ao botão por teclado durante a luta precisa
    // ouvir "é a vez desta peça" antes do resto do estado.
    noTurno ? ROTULO_NO_TURNO.toLowerCase() : null,
    rotuloVida,
    rotulosCondicoes.length > 0 ? `condições: ${rotulosCondicoes.join(', ')}` : null,
  ]
    .filter((parte) => parte !== null)
    .join(', ');

  return (
    <div
      className={`absolute ${arrastando ? 'z-20' : 'z-10 transition-[left,top] duration-150'} ${
        // Realce do turno (RV-063): a moldura é só o reforço visual — quem informa
        // são o marcador com rótulo textual e o `aria-label` do botão.
        noTurno ? 'rounded-full outline-2 outline-offset-2 outline-ouro' : ''
      }`}
      style={{ left: x, top: y, width: tamanhoCelula, height: tamanhoCelula }}
    >
      <button
        type="button"
        aria-label={rotuloDaPeca}
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

      {/* Marcador do turno (RV-063). Ele existe porque o realce por moldura é uma
          pista **de cor**: quem não a distingue precisa do símbolo com rótulo
          textual, e o item de DoD do card é explícito quanto a isso. */}
      {noTurno && (
        <span
          role="img"
          aria-label={ROTULO_NO_TURNO}
          title={ROTULO_NO_TURNO}
          className="pointer-events-none absolute -left-1 -top-1 z-10 rounded-full border border-ouro bg-fundo px-[3px] text-[10px] leading-[1.25] text-ouro shadow"
        >
          ▶
        </span>
      )}

      {/* Condições ativas (RV-064): ícone no canto da peça, cada um com rótulo
          textual em `aria-label` e `title`. O símbolo NUNCA informa sozinho —
          nem por cor, nem por forma; quem passa o mouse lê o nome e a descrição,
          quem usa leitor de tela ouve a lista, e o rótulo do botão repete. */}
      {condicoes.length > 0 && (
        <ul
          aria-label={`Condições de ${token.nome}`}
          className="pointer-events-none absolute -right-1 -top-1 z-10 flex max-w-[130%] flex-wrap justify-end gap-px"
        >
          {condicoes.map((chave) => (
            <li key={chave}>
              <span
                role="img"
                aria-label={CONDICOES[chave].rotulo}
                title={`${CONDICOES[chave].rotulo} — ${CONDICOES[chave].descricao}`}
                className="pointer-events-auto block rounded-full border border-black/60 bg-black/80 px-[3px] text-[10px] leading-[1.25] shadow"
              >
                {CONDICOES[chave].icone}
              </span>
            </li>
          ))}
        </ul>
      )}

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
