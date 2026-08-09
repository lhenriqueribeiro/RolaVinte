export type TipoErroDominio = 'validacao' | 'nao-autorizado' | 'nao-encontrado' | 'conflito';

export class ErroDominio {
  private constructor(
    readonly tipo: TipoErroDominio,
    readonly mensagem: string,
  ) {}

  static validacao(mensagem: string): ErroDominio {
    return new ErroDominio('validacao', mensagem);
  }
  static naoAutorizado(mensagem = 'Você não tem permissão para esta ação.'): ErroDominio {
    return new ErroDominio('nao-autorizado', mensagem);
  }
  static naoEncontrado(mensagem = 'Recurso não encontrado.'): ErroDominio {
    return new ErroDominio('nao-encontrado', mensagem);
  }
  static conflito(mensagem: string): ErroDominio {
    return new ErroDominio('conflito', mensagem);
  }
}
