import type { ResultadoRolagem, TipoMensagem } from '@rolavinte/shared';
import { Entidade } from '../compartilhado/entidade';
import { ErroDominio } from '../compartilhado/erro-dominio';
import { falha, ok, type Result } from '../compartilhado/resultado';

interface PropsMensagem {
  mesaId: string;
  autorId: string | null;
  autorNome: string;
  tipo: TipoMensagem;
  conteudo: string;
  rolagem: ResultadoRolagem | null;
  motivo: string | null;
  criadoEm: Date;
}

export class Mensagem extends Entidade {
  private constructor(
    id: string,
    private readonly props: PropsMensagem,
  ) {
    super(id);
  }

  static criarFala(dados: {
    id: string;
    mesaId: string;
    autorId: string;
    autorNome: string;
    conteudo: string;
    agora: Date;
  }): Result<Mensagem> {
    const conteudo = dados.conteudo.trim();
    if (conteudo.length === 0) return falha(ErroDominio.validacao('Mensagem vazia.'));
    if (conteudo.length > 2000) return falha(ErroDominio.validacao('Mensagem longa demais.'));
    return ok(
      new Mensagem(dados.id, {
        mesaId: dados.mesaId,
        autorId: dados.autorId,
        autorNome: dados.autorNome,
        tipo: 'fala',
        conteudo,
        rolagem: null,
        motivo: null,
        criadoEm: dados.agora,
      }),
    );
  }

  static criarRolagem(dados: {
    id: string;
    mesaId: string;
    autorId: string;
    autorNome: string;
    rolagem: ResultadoRolagem;
    motivo: string;
    agora: Date;
  }): Mensagem {
    return new Mensagem(dados.id, {
      mesaId: dados.mesaId,
      autorId: dados.autorId,
      autorNome: dados.autorNome,
      tipo: 'rolagem',
      conteudo: dados.rolagem.expressao,
      rolagem: dados.rolagem,
      motivo: dados.motivo.trim() || null,
      criadoEm: dados.agora,
    });
  }

  static reconstituir(dados: PropsMensagem & { id: string }): Mensagem {
    const { id, ...props } = dados;
    return new Mensagem(id, props);
  }

  get mesaId(): string {
    return this.props.mesaId;
  }
  get autorId(): string | null {
    return this.props.autorId;
  }
  get autorNome(): string {
    return this.props.autorNome;
  }
  get tipo(): TipoMensagem {
    return this.props.tipo;
  }
  get conteudo(): string {
    return this.props.conteudo;
  }
  get rolagem(): ResultadoRolagem | null {
    return this.props.rolagem;
  }
  get motivo(): string | null {
    return this.props.motivo;
  }
  get criadoEm(): Date {
    return this.props.criadoEm;
  }
}
