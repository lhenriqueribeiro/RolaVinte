import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { Botao } from '@/components/ui/Botao';
import { Campo } from '@/components/ui/Campo';
import { Erro } from '@/components/ui/Estado';
import { useRegistrar } from './api';
import { useSessao } from './store-sessao';

export function PaginaRegistro() {
  const token = useSessao((s) => s.token);
  const registrar = useRegistrar();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  if (token) return <Navigate to="/" replace />;

  function enviar(e: FormEvent) {
    e.preventDefault();
    registrar.mutate({ nome, email, senha });
  }

  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-borda bg-painel p-8">
        <h1 className="font-titulo text-3xl text-ouro">🎲 RolaVinte</h1>
        <p className="mt-1 mb-6 text-sm text-texto-2">Crie sua conta e reúna seu grupo.</p>

        <form onSubmit={enviar} className="flex flex-col gap-4">
          <Campo
            rotulo="Nome"
            required
            minLength={2}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
          <Campo
            rotulo="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Campo
            rotulo="Senha (mínimo 8 caracteres)"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
          {registrar.isError && <Erro erro={registrar.error} />}
          <Botao type="submit" disabled={registrar.isPending}>
            {registrar.isPending ? 'Criando conta…' : 'Criar conta'}
          </Botao>
        </form>

        <p className="mt-6 text-center text-sm text-texto-2">
          Já tem conta?{' '}
          <Link to="/login" className="text-ouro hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}
