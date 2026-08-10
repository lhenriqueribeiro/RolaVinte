import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { CenaDTO, PersonagemDTO, TokenDTO } from '@rolavinte/shared';
import { Botao } from '@/components/ui/Botao';
import { useMoverToken, useRemoverToken } from './api';
import { ALFA_LINHA_GRID, corComAlfa } from './aparencia';
import { PecaToken } from './PecaToken';
import { PainelTokenSelecionado } from './PainelTokenSelecionado';
import {
  PASSO_ZOOM,
  celulaDoCanto,
  posicionarTokenNoPonteiro,
  useTabletop,
  type Camera,
  type Ponto,
} from './store-tabletop';

/**
 * Lado da célula em px, usado só quando a cena vier sem o valor — dado em
 * cache de antes do RV-033, que passou `tamanhoCelula` a ser propriedade da
 * cena. É o mesmo default da migration.
 */
const CELULA_PADRAO = 44;

interface Props {
  mesaId: string;
  cena: CenaDTO;
  tokens: TokenDTO[];
  souMestre: boolean;
  meusPersonagens: PersonagemDTO[];
  /**
   * Todos os personagens da mesa (RV-042). É daqui que sai o PV das barras: o
   * token guarda só `personagemId`, e o cruzamento acontece na renderização —
   * nada de PV copiado para o token nem para estado local.
   */
  personagens?: PersonagemDTO[];
  /**
   * Peça de quem está no turno do combate (RV-063); `null` fora da luta.
   *
   * Vem pronto de `CombateDTO.tokenIdDoTurno` — o mapa **não** recalcula o turno
   * a partir do índice, senão um `indiceTurno` interpretado de forma diferente
   * realçaria a peça errada.
   */
  tokenIdDoTurno?: string | null;
  /** Mesa encerrada: o mapa vira somente leitura, com o motivo à vista (RV-023). */
  motivoBloqueio?: string | null;
}

interface EstadoArrasto {
  tokenId: string;
  px: number; // posição de mundo (px, sem escala) durante o arrasto
  py: number;
}

/**
 * jsdom não implementa captura de ponteiro, e navegadores antigos podem não
 * tê-la. A ausência não pode derrubar o arrasto — sem captura o evento ainda
 * borbulha até o visor, que é quem trata `pointermove`.
 */
function capturarPonteiro(elemento: Element, ponteiroId: number) {
  if (typeof elemento.setPointerCapture === 'function') {
    elemento.setPointerCapture(ponteiroId);
  }
}

/**
 * A barra de espaço panora o mapa, mas o painel de propriedades do token vive
 * dentro do visor: sem esta guarda, digitar um espaço no nome do token seria
 * engolido pelo `preventDefault` do pan.
 */
function ehControleDeFormulario(alvo: EventTarget | null): boolean {
  return (
    alvo instanceof HTMLInputElement ||
    alvo instanceof HTMLTextAreaElement ||
    alvo instanceof HTMLSelectElement
  );
}

export function Tabletop({
  mesaId,
  cena,
  tokens,
  souMestre,
  meusPersonagens,
  personagens = [],
  tokenIdDoTurno = null,
  motivoBloqueio = null,
}: Props) {
  const mover = useMoverToken(mesaId);
  const remover = useRemoverToken(mesaId);
  const [arrasto, setArrasto] = useState<EstadoArrasto | null>(null);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [espacoPressionado, setEspacoPressionado] = useState(false);
  const [panorando, setPanorando] = useState(false);
  const visorRef = useRef<HTMLDivElement>(null);
  const ultimoPonteiro = useRef<Ponto | null>(null);
  const cenaCentralizada = useRef<string | null>(null);

  // Seletores finos: o componente acompanha só os três números da câmera, e
  // nenhuma outra feature (chat, fichas) assina esta store — dar zoom no mapa
  // não custa re-render fora daqui.
  const escala = useTabletop((s) => s.escala);
  const deslocX = useTabletop((s) => s.deslocX);
  const deslocY = useTabletop((s) => s.deslocY);
  const aplicarZoom = useTabletop((s) => s.aplicarZoom);
  const arrastarCamera = useTabletop((s) => s.arrastarCamera);
  const centralizar = useTabletop((s) => s.centralizar);

  const camera: Camera = { escala, deslocX, deslocY };
  // `> 0` cobre também `undefined` e `NaN` vindos de cache antigo (RV-033).
  const celula = cena.tamanhoCelula > 0 ? cena.tamanhoCelula : CELULA_PADRAO;
  const larguraMapa = cena.larguraGrid * celula;
  const alturaMapa = cena.alturaGrid * celula;

  const meusPersonagemIds = new Set(meusPersonagens.map((p) => p.id));
  const personagemPorId = new Map(personagens.map((p) => [p.id, p]));

  function medirVisor(): DOMRect | null {
    return visorRef.current?.getBoundingClientRect() ?? null;
  }

  /** Ponto do evento em pixels do visor (origem no canto superior esquerdo). */
  function pontoNoVisor(evento: { clientX: number; clientY: number }): Ponto {
    const rect = medirVisor();
    return { x: evento.clientX - (rect?.left ?? 0), y: evento.clientY - (rect?.top ?? 0) };
  }

  function zoomNoCentro(fator: number) {
    const rect = medirVisor();
    aplicarZoom(fator, { x: (rect?.width ?? 0) / 2, y: (rect?.height ?? 0) / 2 });
  }

  function centralizarNoVisor() {
    const rect = medirVisor();
    centralizar(
      { largura: rect?.width ?? 0, altura: rect?.height ?? 0 },
      { largura: larguraMapa, altura: alturaMapa },
    );
  }

  // Cena nova entra centralizada: a câmera é global e não pode carregar o zoom
  // da cena (ou da mesa) anterior. O `ref` guarda qual cena já foi
  // centralizada, para que um refetch da cena atual não sequestre a câmera do
  // usuário no meio da sessão.
  useEffect(() => {
    if (cenaCentralizada.current === cena.id) return;
    cenaCentralizada.current = cena.id;
    const rect = visorRef.current?.getBoundingClientRect();
    centralizar(
      { largura: rect?.width ?? 0, altura: rect?.height ?? 0 },
      { largura: larguraMapa, altura: alturaMapa },
    );
  }, [cena.id, larguraMapa, alturaMapa, centralizar]);

  // A roda é assinada na mão, com `passive: false`: o React registra `onWheel`
  // como listener passivo, e `preventDefault` seria ignorado — a página
  // rolaria (ou o navegador daria o zoom nativo) junto com o nosso.
  useEffect(() => {
    const visor = visorRef.current;
    if (!visor) return;

    function aoGirarRoda(evento: WheelEvent) {
      if (!visor) return;
      evento.preventDefault();
      const rect = visor.getBoundingClientRect();
      const ancora = { x: evento.clientX - rect.left, y: evento.clientY - rect.top };
      const { aplicarZoom: zoom, arrastarCamera: pan } = useTabletop.getState();
      if (evento.ctrlKey) {
        zoom(evento.deltaY < 0 ? PASSO_ZOOM : 1 / PASSO_ZOOM, ancora);
      } else {
        pan(-evento.deltaX, -evento.deltaY);
      }
    }

    visor.addEventListener('wheel', aoGirarRoda, { passive: false });
    return () => visor.removeEventListener('wheel', aoGirarRoda);
  }, []);

  function podeMover(token: TokenDTO): boolean {
    if (motivoBloqueio !== null) return false;
    if (souMestre) return true;
    return token.personagemId !== null && meusPersonagemIds.has(token.personagemId);
  }

  function iniciarArrasto(e: PointerEvent<HTMLButtonElement>, token: TokenDTO) {
    if (espacoPressionado || e.button === 1) return; // o gesto é pan, não arrasto
    setSelecionado(token.id);
    if (!podeMover(token)) return;
    capturarPonteiro(e.currentTarget, e.pointerId);
    setArrasto({ tokenId: token.id, px: token.x * celula, py: token.y * celula });
  }

  function iniciarPan(e: PointerEvent<HTMLDivElement>) {
    if (!espacoPressionado && e.button !== 1) return;
    e.preventDefault();
    capturarPonteiro(e.currentTarget, e.pointerId);
    ultimoPonteiro.current = { x: e.clientX, y: e.clientY };
    setPanorando(true);
  }

  function durante(e: PointerEvent<HTMLDivElement>) {
    if (panorando) {
      const ultimo = ultimoPonteiro.current;
      if (!ultimo) return;
      ultimoPonteiro.current = { x: e.clientX, y: e.clientY };
      arrastarCamera(e.clientX - ultimo.x, e.clientY - ultimo.y);
      return;
    }
    if (!arrasto) return;
    // Sem desfazer escala e deslocamento aqui, o token cai na célula errada
    // assim que a câmera sai de (escala 1, deslocamento 0).
    const canto = posicionarTokenNoPonteiro(pontoNoVisor(e), camera, celula, {
      colunas: cena.larguraGrid,
      linhas: cena.alturaGrid,
    });
    setArrasto({ ...arrasto, px: canto.x, py: canto.y });
  }

  function soltar() {
    if (panorando) {
      setPanorando(false);
      ultimoPonteiro.current = null;
    }
    if (!arrasto) return;
    const { x, y } = celulaDoCanto({ x: arrasto.px, y: arrasto.py }, celula);
    const token = tokens.find((t) => t.id === arrasto.tokenId);
    setArrasto(null);
    if (token && (token.x !== x || token.y !== y)) {
      mover.mutate({ tokenId: token.id, x, y });
    }
  }

  function aoPressionarTecla(e: KeyboardEvent<HTMLDivElement>) {
    if (e.code !== 'Space' && e.key !== ' ') return;
    if (ehControleDeFormulario(e.target)) return;
    e.preventDefault(); // sem isto a página rola enquanto o mapa está focado
    setEspacoPressionado(true);
  }

  function aoSoltarTecla(e: KeyboardEvent<HTMLDivElement>) {
    if (e.code !== 'Space' && e.key !== ' ') return;
    if (ehControleDeFormulario(e.target)) return;
    setEspacoPressionado(false);
    setPanorando(false);
    ultimoPonteiro.current = null;
  }

  const tokenSelecionado = tokens.find((t) => t.id === selecionado) ?? null;
  const cursor = panorando
    ? 'cursor-grabbing'
    : espacoPressionado
      ? 'cursor-grab'
      : 'cursor-default';

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 items-center gap-3 border-b border-borda px-3 text-sm">
        <span className="font-titulo text-texto">🗺️ {cena.nome}</span>
        <span className="text-xs text-texto-2">
          {cena.larguraGrid}×{cena.alturaGrid}
        </span>
        {motivoBloqueio && (
          <span className="text-xs text-texto-2">🔒 {motivoBloqueio} Os tokens não se movem.</span>
        )}
        {tokenSelecionado && (
          <span className="flex items-center gap-2 text-xs text-texto-2">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: tokenSelecionado.cor }}
              aria-hidden
            />
            {tokenSelecionado.nome}
            {souMestre && (
              <Botao
                variante="perigo"
                className="!px-2 !py-0.5 text-xs"
                disabled={motivoBloqueio !== null}
                title={motivoBloqueio ?? undefined}
                onClick={() => {
                  remover.mutate(tokenSelecionado.id);
                  setSelecionado(null);
                }}
              >
                Remover
              </Botao>
            )}
          </span>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1" role="group" aria-label="Câmera">
          <Botao
            variante="secundario"
            className="!px-2 !py-0.5 text-xs"
            aria-label="Afastar o mapa"
            title="Afastar o mapa"
            onClick={() => zoomNoCentro(1 / PASSO_ZOOM)}
          >
            −
          </Botao>
          <span
            role="status"
            aria-live="polite"
            className="w-12 text-center text-xs tabular-nums text-texto-2"
          >
            {Math.round(escala * 100)}%
          </span>
          <Botao
            variante="secundario"
            className="!px-2 !py-0.5 text-xs"
            aria-label="Aproximar o mapa"
            title="Aproximar o mapa"
            onClick={() => zoomNoCentro(PASSO_ZOOM)}
          >
            +
          </Botao>
          <Botao
            variante="secundario"
            className="!px-2 !py-0.5 text-xs"
            aria-label="Centralizar o mapa"
            title="Centralizar o mapa"
            onClick={centralizarNoVisor}
          >
            ⌖
          </Botao>
        </div>
      </div>

      <div
        ref={visorRef}
        role="application"
        aria-label={`Mapa da cena ${cena.nome}`}
        aria-describedby="ajuda-camera"
        tabIndex={0}
        className={`relative min-h-0 flex-1 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ouro/60 ${cursor}`}
        style={{ touchAction: 'none' }}
        onPointerDown={iniciarPan}
        onPointerMove={durante}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        onKeyDown={aoPressionarTecla}
        onKeyUp={aoSoltarTecla}
      >
        <div
          className="absolute left-0 top-0 select-none rounded-lg border border-borda"
          style={{
            width: larguraMapa,
            height: alturaMapa,
            transform: `translate(${deslocX}px, ${deslocY}px) scale(${escala})`,
            transformOrigin: '0 0',
            backgroundColor: cena.corFundo,
          }}
        >
          {/* RV-032: o mapa ocupa exatamente a área do grid, então o grid
              continua alinhado sobre ele em qualquer escala. `alt` vazio
              porque a imagem é decorativa — quem descreve a cena é o rótulo
              do visor. */}
          {cena.imagemFundoUrl && (
            <img
              src={cena.imagemFundoUrl}
              alt=""
              aria-hidden
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full rounded-lg object-fill"
            />
          )}

          {/* RV-033: as linhas vêm da cena (tamanho e cor) e somem quando o
              mestre oculta o grid — os tokens continuam alinhados às células. */}
          {cena.gridVisivel && (
            <div
              data-testid="linhas-do-grid"
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: `linear-gradient(${corComAlfa(cena.corGrid, ALFA_LINHA_GRID)} 1px, transparent 1px), linear-gradient(90deg, ${corComAlfa(cena.corGrid, ALFA_LINHA_GRID)} 1px, transparent 1px)`,
                backgroundSize: `${celula}px ${celula}px`,
              }}
            />
          )}

          {tokens.map((token) => {
            const arrastando = arrasto?.tokenId === token.id;
            return (
              <PecaToken
                key={token.id}
                token={token}
                personagem={
                  token.personagemId ? (personagemPorId.get(token.personagemId) ?? null) : null
                }
                x={arrastando ? arrasto.px : token.x * celula}
                y={arrastando ? arrasto.py : token.y * celula}
                tamanhoCelula={celula}
                selecionado={selecionado === token.id}
                noTurno={tokenIdDoTurno === token.id}
                arrastando={arrastando}
                podeMover={podeMover(token)}
                aoApontar={(e) => iniciarArrasto(e, token)}
              />
            );
          })}
        </div>

        {souMestre && tokenSelecionado && (
          <PainelTokenSelecionado
            // Remonta ao trocar de peça: o formulário nasce com os valores do
            // token novo, sem efeito de sincronização.
            key={tokenSelecionado.id}
            mesaId={mesaId}
            token={tokenSelecionado}
            motivoBloqueio={motivoBloqueio}
            aoFechar={() => setSelecionado(null)}
          />
        )}
      </div>

      <p id="ajuda-camera" className="sr-only">
        Use Ctrl e a roda do mouse para dar zoom, o botão do meio ou a barra de espaço com o mouse
        para arrastar o mapa. Os botões Afastar, Aproximar e Centralizar fazem o mesmo pelo teclado.
      </p>
    </div>
  );
}
