import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMesa } from '@/features/mesas/api';
import { formatarData } from '@/features/mesas/formatos';
import { Carregando, Erro } from '@/components/ui/Estado';
import { useSessao } from '@/features/auth/store-sessao';
import { usePersonagens } from '@/features/personagens/api';
import { PainelPersonagens } from '@/features/personagens/PainelPersonagens';
import { useCenaAtiva, useCombate } from './api';
import { motivoDeConexao, rotuloDeConexao, useConexao } from './store-conexao';
import { useSocketMesa } from './use-socket-mesa';
import { Tabletop } from './Tabletop';
import { Chat } from './Chat';
import { PainelIniciativa } from './PainelIniciativa';
import { PainelMestre } from './PainelMestre';

type Aba = 'chat' | 'combate' | 'personagens' | 'mestre';

export function PaginaMesa() {
  const { mesaId = '' } = useParams();
  const usuario = useSessao((s) => s.usuario);
  const mesa = useMesa(mesaId);
  const cenaAtiva = useCenaAtiva(mesaId);
  const personagens = usePersonagens(mesaId);
  // A página lê o combate **só** para realçar a peça do turno no mapa (RV-063). O
  // painel usa a mesma `queryKey`, então o TanStack serve as duas montagens com
  // uma requisição — e não há um segundo cache de combate para divergir.
  const combate = useCombate(mesaId);
  const [aba, setAba] = useState<Aba>('chat');
  // Seletor fino: a página só depende do *estado* da conexão, e nada mais da
  // store — um campo a mais aqui rerenderizaria o tabletop inteiro a cada
  // tentativa de reconexão.
  const estadoConexao = useConexao((s) => s.estado);
  useSocketMesa(mesaId);

  if (mesa.isPending) {
    return (
      <main className="flex min-h-full items-center justify-center">
        <Carregando rotulo="Abrindo a mesa…" />
      </main>
    );
  }
  if (mesa.isError) {
    return (
      <main className="flex min-h-full flex-col items-center justify-center gap-4 p-4">
        <Erro erro={mesa.error} retentando={mesa.isFetching} aoRetentar={() => void mesa.refetch()}>
          <Link to="/" className="text-sm text-ouro hover:underline">
            Voltar ao início
          </Link>
        </Erro>
      </main>
    );
  }

  const souMestre = mesa.data.meuPapel === 'mestre';
  const meusPersonagens = (personagens.data ?? []).filter((p) => p.donoId === usuario?.id);

  // RV-023: mesa encerrada abre em modo somente leitura. O motivo acompanha
  // cada controle desabilitado — não basta apagar os botões.
  const encerradaEm = mesa.data.encerradaEm;
  const motivoEncerrada =
    encerradaEm !== null
      ? `Esta mesa foi encerrada em ${formatarData(encerradaEm)} e está em modo somente leitura.`
      : null;

  /**
   * RV-112: enquanto o tempo real está fora do ar, a escrita fica bloqueada —
   * pelo mesmo canal por onde o encerramento já bloqueava. Cada controle da
   * mesa (chat, tabletop, fichas, painel do mestre) já sabe desabilitar-se
   * **mostrando o motivo** quando recebe `motivoBloqueio`; nenhum deles precisa
   * conhecer o socket, e nenhum texto novo de "desabilitado sem explicação"
   * entra na tela.
   *
   * O encerramento tem precedência: ele é definitivo, e voltar a conexão não o
   * desfaz. A faixa de status abaixo é independente do motivo escolhido, então
   * numa mesa encerrada **e** desconectada o usuário continua vendo as duas
   * informações.
   */
  const motivoConexao = motivoDeConexao(estadoConexao);
  const rotuloConexao = rotuloDeConexao(estadoConexao);
  const motivoBloqueio = motivoEncerrada ?? motivoConexao;

  const abas: { id: Aba; rotulo: string }[] = [
    { id: 'chat', rotulo: '💬 Chat' },
    // A aba de combate é de **todos**: a ordem e de quem é a vez são justamente o
    // que o jogador precisa ver para se preparar antes do turno (RV-063).
    { id: 'combate', rotulo: '⚔️ Combate' },
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
        {motivoEncerrada && (
          <span className="shrink-0 rounded-full border border-borda px-2 py-0.5 text-xs text-texto-2">
            🔒 Encerrada
          </span>
        )}
        <span className="hidden text-xs text-texto-2 sm:block">
          Mestre: {mesa.data.mestreNome} · {mesa.data.jogadores.length}{' '}
          {mesa.data.jogadores.length === 1 ? 'participante' : 'participantes'}
        </span>
      </header>

      {motivoEncerrada && (
        <p
          role="status"
          className="shrink-0 border-b border-borda bg-painel-2 px-4 py-2 text-xs text-texto-2"
        >
          {motivoEncerrada} Você continua lendo o histórico do chat, as fichas e o mapa, mas não é
          possível enviar mensagens, rolar dados, mover tokens nem alterar a mesa.
        </p>
      )}

      {/* Faixa de conexão (RV-112). `role="status"` para o leitor de tela
          anunciar a queda sem roubar o foco de quem está digitando, e o estado
          vai em texto + emoji — nunca só em cor. */}
      {rotuloConexao && motivoConexao && (
        <p
          role="status"
          className="shrink-0 border-b border-ouro/40 bg-painel-2 px-4 py-2 text-xs text-texto-2"
        >
          <strong className="text-ouro">{rotuloConexao}</strong> {motivoConexao}
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <section className="min-w-0 flex-1 bg-fundo" aria-label="Tabletop">
          {cenaAtiva.isPending && (
            <div className="flex h-full items-center justify-center">
              <Carregando rotulo="Carregando a cena…" />
            </div>
          )}
          {cenaAtiva.isError && (
            <div className="flex h-full items-center justify-center p-4">
              <Erro
                erro={cenaAtiva.error}
                retentando={cenaAtiva.isFetching}
                aoRetentar={() => void cenaAtiva.refetch()}
              />
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
                tokenIdDoTurno={combate.data?.combate?.tokenIdDoTurno ?? null}
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
            {aba === 'combate' && (
              <PainelIniciativa
                mesaId={mesaId}
                souMestre={souMestre}
                tokens={cenaAtiva.data?.tokens ?? []}
                personagens={personagens.data ?? []}
                meusPersonagens={meusPersonagens}
                motivoBloqueio={motivoBloqueio}
              />
            )}
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
