import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UsuarioDTO } from '@rolavinte/shared';

interface EstadoSessao {
  token: string | null;
  usuario: UsuarioDTO | null;
  entrar(token: string, usuario: UsuarioDTO): void;
  sair(): void;
}

export const useSessao = create<EstadoSessao>()(
  persist(
    (set) => ({
      token: null,
      usuario: null,
      entrar: (token, usuario) => set({ token, usuario }),
      sair: () => set({ token: null, usuario: null }),
    }),
    { name: 'rolavinte-sessao' },
  ),
);
