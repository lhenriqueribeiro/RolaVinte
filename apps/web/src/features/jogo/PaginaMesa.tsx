import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMesa } from '@/features/mesas/api';
import { formatarData } from '@/features/mesas/formatos';
import { useSessao } from '@/features/auth/store-sessao';
import { usePersonagens } from '@/features/personagens/api';
import { PainelPersonagens } from '@/features/personagens/PainelPersonagens';
import { useCenaAtiva } from './api';
import { useSocketMesa } from './use-socket-mesa';
import { Tabletop } from './Tabletop';
import { Chat } from './Chat';
import { PainelMestre } from './PainelMestre';

type Aba = 'chat' | 'personagens' | 'mestre';

export function PaginaMesa() {
  const { mesaId = '' } = useParams();
  const usuario = useSessao((s) => s.usuario);
  const mesa = useMesa(mesaId);
  const cenaAtiva = useCenaAtiva(mesaId);
  const personagens = usePersonagens(mesaId);
  const [aba, setAba] = useState<Aba>('chat');
  useSocketMesa(mesaId);

  if (mesa.isPending) {
    return (
      <main className="flex min-h-full items-center justify-center text-texto-2">
        Abrindo a mesa…
      </main>
    );
  }
  if (mesa.isError) {
    return (
      <main className="flex min-h-full flex-col items-center justify-center gap-4">
        <p role="alert" className="text-perigo">
          {mesa.error.message}
        </p>
        <Link to="/" className="text-ouro hover:underline">
          Voltar ao início
        </Link>
      </main>
    );
  }

  const souMestre = mesa.data.meuPapel === 'mestre';
  const meusPersonagens = (personagens.data ?? []).filter((p) => p.donoId === usuario?.id);

  // RV-023: mesa encerrada abre em modo somente leitura. O motivo acompanha
  // cada controle desabilitado — não basta apagar os botões.
  const encerradaEm = mesa.data.encerradaEm;
  const motivoBloqueio =
    encerradaEm !== null
      ? `Esta mesa foi encerrada em ${formatarData(encerradaEm)} e está em modo somente leitura.`
      : null;

  const abas: { id: Aba; rotulo: string }[] = [
    { id: 'chat', rotulo: '💬 Chat' },
    { id: 'personagens', rotulo: '🧙 Personagens' },
    ...(souMestre ? [{ id: 'mestre' as Aba, rotulo: '👑 Mestre' }] : []),
  ];

  return (
    <main className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-borda bg-painel px-4">
        <Link to="/" className="text-sm text-texto-2 hover:text-ouro">
          ← Mesas
        </Link>
        <h1 className="font-titulo truncate text-lg text-ouro">{mesa.data.nome}</h1>
        {motivoBloqueio && (
          <span className="shrink-0 rounded-full border border-borda px-2 py-0.5 text-xs text-texto-2">
            🔒 Encerrada
          </span>
        )}
        <span className="hidden text-xs text-texto-2 sm:block">
          Mestre: {mesa.data.mestreNome} · {mesa.data.jogadores.length}{' '}
          {mesa.data.jogadores.length === 1 ? 'participante' : 'participantes'}
        </span>
      </header>

      {motivoBloqueio && (
        <p
          role="status"
          className="shrink-0 border-b border-borda bg-painel-2 px-4 py-2 text-xs text-texto-2"
        >
          {motivoBloqueio} Você continua lendo o histórico do chat, as fichas e o mapa, mas não é
          possível enviar mensagens, rolar dados, mover tokens nem alterar a mesa.
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <section className="min-w-0 flex-1 bg-fundo" aria-label="Tabletop">
          {cenaAtiva.isPending && (
            <div className="flex h-full items-center justify-center text-texto-2">
              Carregando cena…
            </div>
          )}
          {cenaAtiva.data &&
            (cenaAtiva.data.cena ? (
              <Tabletop
                mesaId={mesaId}
                cena={cenaAtiva.data.cena}
                tokens={cenaAtiva.data.tokens}
                souMestre={souMestre}
                meusPersonagens={meusPersonagens}
                personagens={personagens.data ?? []}
                motivoBloqueio={motivoBloqueio}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-texto-2">
                <p className="text-5xl">🗺️</p>
                <p>Nenhuma cena ativa.</p>
                {motivoBloqueio ? (
                  <p className="text-sm">Esta mesa foi encerrada sem nenhuma cena preparada.</p>
                ) : souMestre ? (
                  <p className="text-sm">Crie uma cena na aba 👑 Mestre para começar a jogar.</p>
                ) : (
                  <p className="text-sm">Aguarde o mestre preparar o mapa.</p>
                )}
              </div>
            ))}
        </section>

        <aside className="flex w-80 shrink-0 flex-col border-l border-borda bg-painel lg:w-96">
          <nav className="flex shrink-0 border-b border-borda" aria-label="Painéis da mesa">
            {abas.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAba(a.id)}
                className={`flex-1 cursor-pointer px-2 py-2.5 text-sm transition-colors ${
                  aba === a.id
                    ? 'border-b-2 border-ouro text-ouro'
                    : 'text-texto-2 hover:text-texto'
                }`}
              >
                {a.rotulo}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1">
            {aba === 'chat' && <Chat mesaId={mesaId} motivoBloqueio={motivoBloqueio} />}
            {aba === 'personagens' && (
              <PainelPersonagens
                mesaId={mesaId}
                souMestre={souMestre}
                motivoBloqueio={motivoBloqueio}
              />
            )}
            {aba === 'mestre' && souMestre && (
              <PainelMestre
                mesa={mesa.data}
                cena={cenaAtiva.data?.cena ?? null}
                personagens={personagens.data ?? []}
                motivoBloqueio={motivoBloqueio}
              />
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
