import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { Botao } from '@/components/ui/Botao';
import { Campo } from '@/components/ui/Campo';
import { useLogin } from './api';
import { useSessao } from './store-sessao';

export function PaginaLogin() {
  const token = useSessao((s) => s.token);
  const login = useLogin();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  if (token) {
    const destino = (location.state as { de?: string } | null)?.de ?? '/';
    return <Navigate to={destino} replace />;
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    login.mutate({ email, senha });
  }

  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-borda bg-painel p-8">
        <h1 className="font-titulo text-3xl text-ouro">🎲 RolaVinte</h1>
        <p className="mt-1 mb-6 text-sm text-texto-2">Sua mesa de RPG online, em português.</p>

        <form onSubmit={enviar} className="flex flex-col gap-4">
          <Campo
            rotulo="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Campo
            rotulo="Senha"
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
          {login.isError && <p className="text-sm text-perigo">{login.error.message}</p>}
          <Botao type="submit" disabled={login.isPending}>
            {login.isPending ? 'Entrando…' : 'Entrar'}
          </Botao>
        </form>

        <p className="mt-6 text-center text-sm text-texto-2">
          Ainda não tem conta?{' '}
          <Link to="/registro" className="text-ouro hover:underline">
            Criar conta
          </Link>
        </p>
      </div>
    </main>
  );
}
