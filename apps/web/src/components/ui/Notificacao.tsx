import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/**
 * Fila de notificações efêmeras (RV-122).
 *
 * Serve ao sucesso silencioso: ações que davam certo e não diziam nada (enviar
 * convite, ativar cena) passam a confirmar em uma linha que some sozinha. Erro
 * **não** deveria virar toast quando existe um lugar fixo para ele na tela — um
 * aviso que desaparece em cinco segundos é pior que um `<Erro>` ao lado do
 * controle que falhou. O tipo `erro` existe para o que não tem lugar fixo (uma
 * falha disparada por evento de tempo real, por exemplo).
 *
 * Acessibilidade: a região é `aria-live="polite"` e cada aviso carrega o seu
 * papel — `status` para sucesso, `alert` para erro — mais o prefixo textual
 * ("Sucesso:" / "Erro:") em `sr-only`. Sem o prefixo, a única diferença entre os
 * dois seria a cor da borda, que leitor de tela não lê e daltônico não separa.
 */

export type TipoNotificacao = 'sucesso' | 'erro';

export interface Notificacao {
  id: string;
  tipo: TipoNotificacao;
  texto: string;
}

export interface ApiNotificacoes {
  sucesso: (texto: string) => void;
  erro: (texto: string) => void;
  descartar: (id: string) => void;
}

const DURACAO_PADRAO_MS = 5000;

const ContextoNotificacoes = createContext<ApiNotificacoes | null>(null);

/**
 * Acesso à fila. Lança quando não há provedor acima — de propósito: uma versão
 * "sem provedor vira no-op" transformaria a confirmação sumida num pulo
 * silencioso (F8 da taxonomia), e ninguém descobriria em teste.
 */
export function useNotificar(): ApiNotificacoes {
  const api = useContext(ContextoNotificacoes);
  if (!api) {
    throw new Error(
      'useNotificar precisa de <ProvedorNotificacoes> acima na árvore (montado em app/providers.tsx).',
    );
  }
  return api;
}

const ESTILO_POR_TIPO: Record<TipoNotificacao, string> = {
  sucesso: 'border-sucesso/50 bg-painel text-texto',
  erro: 'border-perigo/50 bg-painel text-texto',
};

const ICONE_POR_TIPO: Record<TipoNotificacao, string> = {
  sucesso: '✅',
  erro: '⚠️',
};

const PREFIXO_POR_TIPO: Record<TipoNotificacao, string> = {
  sucesso: 'Sucesso: ',
  erro: 'Erro: ',
};

function PainelNotificacoes({
  fila,
  aoDescartar,
}: {
  fila: readonly Notificacao[];
  aoDescartar: (id: string) => void;
}) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end"
    >
      {fila.map((notificacao) => (
        <div
          key={notificacao.id}
          role={notificacao.tipo === 'erro' ? 'alert' : 'status'}
          className={`pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl border p-3 text-sm shadow-2xl ${
            ESTILO_POR_TIPO[notificacao.tipo]
          }`}
        >
          <span aria-hidden>{ICONE_POR_TIPO[notificacao.tipo]}</span>
          <p className="min-w-0 flex-1 break-words">
            <span className="sr-only">{PREFIXO_POR_TIPO[notificacao.tipo]}</span>
            {notificacao.texto}
          </p>
          <button
            type="button"
            aria-label="Dispensar aviso"
            className="cursor-pointer text-texto-2 transition-colors hover:text-texto"
            onClick={() => aoDescartar(notificacao.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export function ProvedorNotificacoes({
  children,
  duracaoMs = DURACAO_PADRAO_MS,
}: {
  children: ReactNode;
  duracaoMs?: number;
}) {
  const [fila, setFila] = useState<readonly Notificacao[]>([]);
  const proximoId = useRef(0);
  const temporizadores = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const descartar = useCallback((id: string) => {
    const temporizador = temporizadores.current.get(id);
    if (temporizador !== undefined) {
      clearTimeout(temporizador);
      temporizadores.current.delete(id);
    }
    setFila((atual) => atual.filter((n) => n.id !== id));
  }, []);

  const notificar = useCallback(
    (tipo: TipoNotificacao, texto: string) => {
      proximoId.current += 1;
      const id = `notificacao-${proximoId.current}`;
      setFila((atual) => [...atual, { id, tipo, texto }]);
      temporizadores.current.set(
        id,
        setTimeout(() => descartar(id), duracaoMs),
      );
    },
    [descartar, duracaoMs],
  );

  // Desmontar com a fila cheia deixaria timers agendados chamando `setFila` num
  // componente que não existe mais.
  useEffect(() => {
    const agendados = temporizadores.current;
    return () => {
      agendados.forEach((temporizador) => clearTimeout(temporizador));
      agendados.clear();
    };
  }, []);

  const api = useMemo<ApiNotificacoes>(
    () => ({
      sucesso: (texto: string) => notificar('sucesso', texto),
      erro: (texto: string) => notificar('erro', texto),
      descartar,
    }),
    [notificar, descartar],
  );

  return (
    <ContextoNotificacoes.Provider value={api}>
      {children}
      <PainelNotificacoes fila={fila} aoDescartar={descartar} />
    </ContextoNotificacoes.Provider>
  );
}
