import type { Atributos } from '@rolavinte/shared';
import { Entidade } from '../compartilhado/entidade';
import { ErroDominio } from '../compartilhado/erro-dominio';
import { falha, ok, type Result } from '../compartilhado/resultado';

interface PropsPersonagem {
  mesaId: string;
  donoId: string;
  nome: string;
  classe: string;
  nivel: number;
  pvAtual: number;
  pvMax: number;
  atributos: Atributos;
  anotacoes: string;
}

export interface CamposAtualizacaoPersonagem {
  nome?: string;
  classe?: string;
  nivel?: number;
  pvAtual?: number;
  pvMax?: number;
  atributos?: Atributos;
  anotacoes?: string;
}

export class Personagem extends Entidade {
  private constructor(
    id: string,
    private readonly props: PropsPersonagem,
  ) {
    super(id);
  }

  static criar(dados: Omit<PropsPersonagem, 'pvAtual'> & { id: string }): Result<Personagem> {
    const nome = dados.nome.trim();
    if (nome.length < 2 || nome.length > 60) {
      return falha(ErroDominio.validacao('Nome do personagem deve ter entre 2 e 60 caracteres.'));
    }
    if (dados.pvMax < 1) return falha(ErroDominio.validacao('PV máximo deve ser positivo.'));
    const { id, ...resto } = dados;
    return ok(new Personagem(id, { ...resto, nome, pvAtual: dados.pvMax }));
  }

  static reconstituir(dados: PropsPersonagem & { id: string }): Personagem {
    const { id, ...props } = dados;
    return new Personagem(id, props);
  }

  get mesaId(): string {
    return this.props.mesaId;
  }
  get donoId(): string {
    return this.props.donoId;
  }
  get nome(): string {
    return this.props.nome;
  }
  get classe(): string {
    return this.props.classe;
  }
  get nivel(): number {
    return this.props.nivel;
  }
  get pvAtual(): number {
    return this.props.pvAtual;
  }
  get pvMax(): number {
    return this.props.pvMax;
  }
  get atributos(): Atributos {
    return this.props.atributos;
  }
  get anotacoes(): string {
    return this.props.anotacoes;
  }

  podeSerEditadoPor(usuarioId: string, ehMestreDaMesa: boolean): boolean {
    return ehMestreDaMesa || this.props.donoId === usuarioId;
  }

  atualizar(campos: CamposAtualizacaoPersonagem): Result<void> {
    if (campos.nome !== undefined) {
      const nome = campos.nome.trim();
      if (nome.length < 2 || nome.length > 60) {
        return falha(ErroDominio.validacao('Nome do personagem deve ter entre 2 e 60 caracteres.'));
      }
      this.props.nome = nome;
    }
    if (campos.pvMax !== undefined) {
      if (campos.pvMax < 1) return falha(ErroDominio.validacao('PV máximo deve ser positivo.'));
      this.props.pvMax = campos.pvMax;
      this.props.pvAtual = Math.min(this.props.pvAtual, campos.pvMax);
    }
    if (campos.pvAtual !== undefined) {
      if (campos.pvAtual < 0 || campos.pvAtual > this.props.pvMax) {
        return falha(ErroDominio.validacao('PV atual deve estar entre 0 e o PV máximo.'));
      }
      this.props.pvAtual = campos.pvAtual;
    }
    if (campos.classe !== undefined) this.props.classe = campos.classe.trim();
    if (campos.nivel !== undefined) {
      if (campos.nivel < 1 || campos.nivel > 20)
        return falha(ErroDominio.validacao('Nível deve ser 1..20.'));
      this.props.nivel = campos.nivel;
    }
    if (campos.atributos !== undefined) this.props.atributos = campos.atributos;
    if (campos.anotacoes !== undefined) this.props.anotacoes = campos.anotacoes;
    return ok(undefined);
  }
}
