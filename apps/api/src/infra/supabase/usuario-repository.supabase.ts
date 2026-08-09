import type { SupabaseClient } from '@supabase/supabase-js';
import type { UsuarioRepository } from '../../aplicacao/ports/repositorios';
import type { Usuario } from '../../dominio/contas/usuario';
import { garantirSemErro } from './cliente';
import { rowParaUsuario, usuarioParaRow, type RowUsuario } from './usuario.mapper';

const COLUNAS = 'id, nome, email, senha_hash, criado_em';

export class SupabaseUsuarioRepository implements UsuarioRepository {
  constructor(private readonly sb: SupabaseClient) {}

  async salvar(usuario: Usuario): Promise<void> {
    const { error } = await this.sb.from('usuarios').upsert(usuarioParaRow(usuario));
    garantirSemErro('salvar usuário', error);
  }

  async buscarPorId(id: string): Promise<Usuario | null> {
    const { data, error } = await this.sb
      .from('usuarios')
      .select(COLUNAS)
      .eq('id', id)
      .maybeSingle();
    garantirSemErro('buscar usuário por id', error);
    return data ? rowParaUsuario(data as RowUsuario) : null;
  }

  async buscarPorEmail(email: string): Promise<Usuario | null> {
    const { data, error } = await this.sb
      .from('usuarios')
      .select(COLUNAS)
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();
    garantirSemErro('buscar usuário por email', error);
    return data ? rowParaUsuario(data as RowUsuario) : null;
  }
}
