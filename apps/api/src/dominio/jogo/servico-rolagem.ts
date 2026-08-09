import { rolarExpressao, type ResultadoRolagem, type Rng } from '@rolavinte/shared';
import type { ExpressaoDados } from './expressao-dados';

/**
 * Serviço de domínio: avalia expressões já validadas.
 * RNG injetável mantém o serviço determinístico em testes.
 */
export class ServicoRolagemDados {
  constructor(private readonly rng: Rng) {}

  rolar(expressao: ExpressaoDados): ResultadoRolagem {
    const saida = rolarExpressao(expressao.valor, this.rng);
    if (!saida.ok) {
      // ExpressaoDados garante validade na construção; falhar aqui é bug.
      throw new Error(`Expressão validada falhou ao rolar: ${saida.erro}`);
    }
    return saida.resultado;
  }
}
