import { Link, useNavigate, useParams } from 'react-router';
import { Botao } from '@/components/ui/Botao';
import { Carregando, Erro } from '@/components/ui/Estado';
import { useSessao } from '@/features/auth/store-sessao';
import { useAceitarConvite, useConvitePublico } from './api';

export function PaginaConvite() {
  const { token = '' } = useParams();
  const sessao = useSessao();
  const convite = useConvitePublico(token);
  const aceitar = useAceitarConvite();
  const navigate = useNavigate();

  function aceitarConvite() {
    aceitar.mutate(token, {
      onSuccess: ({ mesaId }) => {
        void navigate(`/mesas/${mesaId}`);
      },
    });
  }

  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-borda bg-painel p-8 text-center">
        <h1 className="font-titulo text-3xl text-ouro">🎲 RolaVinte</h1>

        {convite.isPending && (
          <Carregando rotulo="Verificando o convite…" className="mt-6 justify-center" />
        )}
        {convite.isError && (
          <Erro
            erro={convite.error}
            className="mt-6"
            retentando={convite.isFetching}
            aoRetentar={() => void convite.refetch()}
          >
            <Link to="/" className="text-sm text-ouro hover:underline">
              Ir para o início
            </Link>
          </Erro>
        )}

        {convite.data && (
          <>
            <p className="mt-6 text-lg">
              <strong>{convite.data.mestreNome}</strong> convidou você para a mesa
            </p>
            <p className="font-titulo mt-1 text-2xl text-ouro">"{convite.data.mesaNome}"</p>
            <p className="mt-2 text-sm text-texto-2">Convite enviado para {convite.data.email}</p>

            {sessao.token ? (
              <div className="mt-8">
                {aceitar.isError && <Erro erro={aceitar.error} className="mb-3" />}
                <Botao onClick={aceitarConvite} disabled={aceitar.isPending} className="w-full">
                  {aceitar.isPending ? 'Entrando na mesa…' : 'Aceitar convite'}
                </Botao>
                <p className="mt-3 text-xs text-texto-2">
                  Conectado como {sessao.usuario?.email}. O convite só pode ser aceito pelo email
                  convidado.
                </p>
              </div>
            ) : (
              <div className="mt-8 flex flex-col gap-3">
                <p className="text-sm text-texto-2">
                  Entre ou crie uma conta com o email convidado para aceitar.
                </p>
                <Link to="/login" state={{ de: `/convites/${token}` }}>
                  <Botao className="w-full">Entrar</Botao>
                </Link>
                <Link to="/registro">
                  <Botao variante="secundario" className="w-full">
                    Criar conta
                  </Botao>
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
