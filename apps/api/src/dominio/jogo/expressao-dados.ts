import { validarExpressao } from '@rolavinte/shared';
import { ErroDominio } from '../compartilhado/erro-dominio';
import { falha, ok, type Result } from '../compartilhado/resultado';

/** VO que garante que só expressões de dados válidas circulam no domínio. */
export class ExpressaoDados {
  private constructor(readonly valor: string) {}

  static criar(bruto: string): Result<ExpressaoDados> {
    const resultado = validarExpressao(bruto);
    if (!resultado.ok) return falha(ErroDominio.validacao(resultado.erro));
    return ok(new ExpressaoDados(bruto.replace(/\s+/g, '').toLowerCase()));
  }
}
