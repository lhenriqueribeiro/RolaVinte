import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { SISTEMAS_RPG, type MesaDTO, type SistemaRpg } from '@rolavinte/shared';
import { Botao } from '@/components/ui/Botao';
import { Campo, CampoArea } from '@/components/ui/Campo';
import { Erro, Vazio } from '@/components/ui/Estado';
import { ListaEsqueleto } from '@/components/ui/Esqueleto';
import { useNotificar } from '@/components/ui/Notificacao';
import { useSessao } from '@/features/auth/store-sessao';
import { useCriarMesa, useMesas } from './api';
import { AcaoEncerrarMesa } from './AcaoEncerrarMesa';
import { AcaoSairDaMesa } from './AcaoSairDaMesa';
import { formatarData, nomeDoSistema } from './formatos';

function CartaoMesa({ mesa }: { mesa: MesaDTO }) {
  const encerrada = mesa.encerradaEm !== null;

  return (
    <li
      className={`flex flex-col rounded-2xl border bg-painel p-5 ${
        encerrada ? 'border-borda/60' : 'border-borda'
      }`}
    >
      <div className="mb-1 flex items-start justify-between gap-2">
        <h3 className="font-titulo text-lg text-texto">
          <Link to={`/mesas/${mesa.id}`} className="hover:text-ouro hover:underline">
            {mesa.nome}
          </Link>
        </h3>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
            mesa.meuPapel === 'mestre' ? 'bg-ouro/15 text-ouro' : 'bg-painel-2 text-texto-2'
          }`}
        >
          {mesa.meuPapel === 'mestre' ? '👑 Mestre' : 'Jogador'}
        </span>
      </div>

      {encerrada && (
        <p className="mb-2 text-xs text-texto-2">
          🔒 Encerrada em {formatarData(mesa.encerradaEm ?? '')} · somente leitura
        </p>
      )}

      {mesa.descricao && <p className="mb-3 line-clamp-2 text-sm text-texto-2">{mesa.descricao}</p>}

      <p className="text-xs text-texto-2">
        {nomeDoSistema(mesa.sistema)} · {mesa.totalJogadores}{' '}
        {mesa.totalJogadores === 1 ? 'participante' : 'participantes'} · Mestre: {mesa.mestreNome}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          to={`/mesas/${mesa.id}`}
          className="rounded-lg border border-borda bg-painel-2 px-3 py-1 text-xs text-texto transition-colors hover:border-ouro/50"
        >
          {encerrada ? 'Abrir (somente leitura)' : 'Abrir mesa'}
        </Link>
        {mesa.meuPapel === 'mestre' ? (
          <AcaoEncerrarMesa mesa={mesa} compacto />
        ) : (
          <AcaoSairDaMesa mesa={mesa} />
        )}
      </div>
    </li>
  );
}

export function PaginaDashboard() {
  const usuario = useSessao((s) => s.usuario);
  const sair = useSessao((s) => s.sair);
  const mesas = useMesas();
  const criarMesa = useCriarMesa();
  const notificar = useNotificar();
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [sistema, setSistema] = useState<SistemaRpg>('generico');

  function enviar(e: FormEvent) {
    e.preventDefault();
    criarMesa.mutate(
      { nome, descricao, sistema },
      {
        onSuccess: (mesa) => {
          setCriando(false);
          setNome('');
          setDescricao('');
          notificar.sucesso(`Mesa "${mesa.nome}" criada.`);
        },
      },
    );
  }

  const ativas = (mesas.data ?? []).filter((m) => m.encerradaEm === null);
  const encerradas = (mesas.data ?? []).filter((m) => m.encerradaEm !== null);
  const semNenhuma = mesas.isSuccess && ativas.length === 0 && encerradas.length === 0;

  return (
    <main className="mx-auto max-w-4xl p-6">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-titulo text-3xl text-ouro">🎲 RolaVinte</h1>
          <p className="text-sm text-texto-2">Olá, {usuario?.nome}. Boas rolagens!</p>
        </div>
        <div className="flex gap-2">
          <Botao onClick={() => setCriando(true)}>+ Nova mesa</Botao>
          <Botao variante="fantasma" onClick={sair}>
            Sair
          </Botao>
        </div>
      </header>

      {criando && (
        <form
          onSubmit={enviar}
          className="mb-8 flex flex-col gap-4 rounded-2xl border border-borda bg-painel p-6"
        >
          <h2 className="font-titulo text-xl text-texto">Criar nova mesa</h2>
          <Campo
            rotulo="Nome da mesa"
            required
            minLength={3}
            placeholder="A Maldição de Strahd"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
          <CampoArea
            rotulo="Descrição (opcional)"
            placeholder="Uma campanha sombria nas terras de Barovia…"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sistema" className="text-sm text-texto-2">
              Sistema
            </label>
            <select
              id="sistema"
              className="rounded-lg border border-borda bg-fundo px-3 py-2 text-sm"
              value={sistema}
              onChange={(e) => setSistema(e.target.value as SistemaRpg)}
            >
              {SISTEMAS_RPG.map((s) => (
                <option key={s} value={s}>
                  {nomeDoSistema(s)}
                </option>
              ))}
            </select>
          </div>
          {criarMesa.isError && <Erro erro={criarMesa.error} compacto />}
          <div className="flex gap-2">
            <Botao type="submit" disabled={criarMesa.isPending}>
              {criarMesa.isPending ? 'Criando…' : 'Criar mesa'}
            </Botao>
            <Botao variante="fantasma" onClick={() => setCriando(false)}>
              Cancelar
            </Botao>
          </div>
        </form>
      )}

      {mesas.isPending && (
        <ListaEsqueleto
          itens={4}
          altura="h-40"
          rotulo="Carregando suas mesas…"
          className="grid gap-4 sm:grid-cols-2"
        />
      )}
      {mesas.isError && (
        <Erro
          erro={mesas.error}
          retentando={mesas.isFetching}
          aoRetentar={() => void mesas.refetch()}
        />
      )}
      {semNenhuma && !criando && (
        <Vazio
          icone="🐉"
          titulo="Você ainda não tem mesas."
          descricao="Crie a primeira e convide seu grupo!"
        />
      )}

      {ativas.length > 0 && (
        <section aria-labelledby="titulo-mesas-ativas">
          <h2 id="titulo-mesas-ativas" className="mb-3 font-titulo text-xl text-texto">
            Ativas
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {ativas.map((mesa) => (
              <CartaoMesa key={mesa.id} mesa={mesa} />
            ))}
          </ul>
        </section>
      )}

      {encerradas.length > 0 && (
        <section aria-labelledby="titulo-mesas-encerradas" className="mt-10">
          <h2 id="titulo-mesas-encerradas" className="mb-1 font-titulo text-xl text-texto">
            Encerradas
          </h2>
          <p className="mb-3 text-sm text-texto-2">
            Campanhas arquivadas: o chat, as fichas e os mapas continuam disponíveis para leitura,
            mas ninguém pode mais escrever nelas.
          </p>
          <ul className="grid gap-4 sm:grid-cols-2">
            {encerradas.map((mesa) => (
              <CartaoMesa key={mesa.id} mesa={mesa} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
