import type { UsuarioRepository } from '../../aplicacao/ports/repositorios';
import { Usuario } from '../../dominio/contas/usuario';

interface RegistroUsuario {
  id: string;
  nome: string;
  email: string;
  senhaHash: string;
  criadoEm: Date;
}

/**
 * Fake em memória de `UsuarioRepository`.
 *
 * Guarda um instantâneo dos dados (não a instância) e reconstitui a entidade a
 * cada leitura — como o adapter Supabase faria. Assim uma mutação feita fora do
 * `salvar` não vaza para o "banco", e o fake é substituível pelo adapter real.
 */
export class FakeUsuarioRepository implements UsuarioRepository {
  private readonly registros = new Map<string, RegistroUsuario>();

  async salvar(usuario: Usuario): Promise<void> {
    this.registros.set(usuario.id, {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email.valor,
      senhaHash: usuario.senhaHash,
      criadoEm: new Date(usuario.criadoEm),
    });
  }

  async buscarPorId(id: string): Promise<Usuario | null> {
    const registro = this.registros.get(id);
    return registro ? this.hidratar(registro) : null;
  }

  async buscarPorEmail(email: string): Promise<Usuario | null> {
    const alvo = email.trim().toLowerCase();
    for (const registro of this.registros.values()) {
      if (registro.email === alvo) return this.hidratar(registro);
    }
    return null;
  }

  /** Apoio a testes: quantos usuários existem. */
  get total(): number {
    return this.registros.size;
  }

  private hidratar(registro: RegistroUsuario): Usuario {
    return Usuario.reconstituir({
      id: registro.id,
      nome: registro.nome,
      email: registro.email,
      senhaHash: registro.senhaHash,
      criadoEm: new Date(registro.criadoEm),
    });
  }
}
