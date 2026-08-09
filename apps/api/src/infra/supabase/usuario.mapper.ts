import { Usuario } from '../../dominio/contas/usuario';

export interface RowUsuario {
  id: string;
  nome: string;
  email: string;
  senha_hash: string;
  criado_em: string;
}

export function rowParaUsuario(row: RowUsuario): Usuario {
  return Usuario.reconstituir({
    id: row.id,
    nome: row.nome,
    email: row.email,
    senhaHash: row.senha_hash,
    criadoEm: new Date(row.criado_em),
  });
}

export function usuarioParaRow(usuario: Usuario): RowUsuario {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email.valor,
    senha_hash: usuario.senhaHash,
    criado_em: usuario.criadoEm.toISOString(),
  };
}
