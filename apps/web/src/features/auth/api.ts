import { useMutation } from '@tanstack/react-query';
import type { LoginEntrada, RegistrarEntrada, SessaoDTO } from '@rolavinte/shared';
import { requisitar } from '@/lib/api';
import { useSessao } from './store-sessao';

export function useLogin() {
  const entrar = useSessao((s) => s.entrar);
  return useMutation({
    mutationFn: (entrada: LoginEntrada) =>
      requisitar<SessaoDTO>('/auth/login', { metodo: 'POST', corpo: entrada }),
    onSuccess: (sessao) => entrar(sessao.token, sessao.usuario),
  });
}

export function useRegistrar() {
  const entrar = useSessao((s) => s.entrar);
  return useMutation({
    mutationFn: (entrada: RegistrarEntrada) =>
      requisitar<SessaoDTO>('/auth/registrar', { metodo: 'POST', corpo: entrada }),
    onSuccess: (sessao) => entrar(sessao.token, sessao.usuario),
  });
}
