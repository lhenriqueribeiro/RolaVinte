import { Entidade } from '../compartilhado/entidade';
import { ErroDominio } from '../compartilhado/erro-dominio';
import { falha, ok, type Result } from '../compartilhado/resultado';
import { Email } from './email';

interface PropsUsuario {
  nome: string;
  email: Email;
  senhaHash: string;
  criadoEm: Date;
}

export class Usuario extends Entidade {
  private constructor(
    id: string,
    private readonly props: PropsUsuario,
  ) {
    super(id);
  }

  static criar(dados: {
    id: string;
    nome: string;
    email: string;
    senhaHash: string;
    agora: Date;
  }): Result<Usuario> {
    const nome = dados.nome.trim();
    if (nome.length < 2 || nome.length > 60) {
      return falha(ErroDominio.validacao('Nome deve ter entre 2 e 60 caracteres.'));
    }
    const email = Email.criar(dados.email);
    if (!email.ok) return falha(email.erro);
    return ok(
      new Usuario(dados.id, {
        nome,
        email: email.valor,
        senhaHash: dados.senhaHash,
        criadoEm: dados.agora,
      }),
    );
  }

  static reconstituir(dados: {
    id: string;
    nome: string;
    email: string;
    senhaHash: string;
    criadoEm: Date;
  }): Usuario {
    return new Usuario(dados.id, {
      nome: dados.nome,
      email: Email.reconstituir(dados.email),
      senhaHash: dados.senhaHash,
      criadoEm: dados.criadoEm,
    });
  }

  get nome(): string {
    return this.props.nome;
  }
  get email(): Email {
    return this.props.email;
  }
  get senhaHash(): string {
    return this.props.senhaHash;
  }
  get criadoEm(): Date {
    return this.props.criadoEm;
  }
}
