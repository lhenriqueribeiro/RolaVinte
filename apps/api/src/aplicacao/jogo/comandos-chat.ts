import type { ComandoChat, MensagemDTO, TipoComandoExecutavel } from '@rolavinte/shared';
import type { Result } from '../../dominio/compartilhado/resultado';

/**
 * Registry de manipuladores de comando de chat (RV-074).
 *
 * O ponto de extensão canônico do projeto é `Map<tipo, Handler>` montado no
 * composition root (`.claude/rules/04-design-patterns.md`), e é literalmente o
 * que existe aqui dentro. O que o `Map` cru não dá — e este invólucro dá — são
 * duas coisas:
 *
 * 1. **Tipo por chave.** O manipulador de `sussurro` recebe o comando já
 *    estreitado para a variante de sussurro, sem `as` espalhado por aí. O único
 *    cast do arquivo vive em `montar`, onde a correlação chave↔variante é
 *    verdadeira por construção.
 * 2. **Nenhum comando sem dono.** `ManipuladoresComandoChat` é um
 *    `Record<TipoComandoExecutavel, …>`: acrescentar um comando ao parser em
 *    `@rolavinte/shared` **quebra a compilação** dos dois composition roots até
 *    alguém registrar quem o executa. É o mesmo truque do `Record` de eventos
 *    WS do RV-115, pela mesma razão: contrato sem consumidor é comentário.
 *
 * `ProcessarComandoChat` não conhece nenhum comando pelo nome — não há `switch`
 * aqui nem lá.
 */

export interface ContextoComando {
  usuarioId: string;
  mesaId: string;
}

/** O comando já estreitado para a variante `T`. */
export type ComandoDoTipo<T extends TipoComandoExecutavel> = Extract<ComandoChat, { tipo: T }>;

export type ManipuladorComando<T extends TipoComandoExecutavel> = (
  contexto: ContextoComando,
  comando: ComandoDoTipo<T>,
) => Promise<Result<MensagemDTO>>;

/** Um manipulador por comando executável — chave faltando não compila. */
export type ManipuladoresComandoChat = {
  [T in TipoComandoExecutavel]: ManipuladorComando<T>;
};

type ManipuladorApagado = (
  contexto: ContextoComando,
  comando: ComandoChat,
) => Promise<Result<MensagemDTO>>;

export class RegistroComandosChat {
  private readonly mapa: ReadonlyMap<TipoComandoExecutavel, ManipuladorApagado>;

  constructor(manipuladores: ManipuladoresComandoChat) {
    this.mapa = new Map(
      (Object.keys(manipuladores) as TipoComandoExecutavel[]).map((tipo) => [
        tipo,
        // Seguro por construção: a chave do Record É o discriminante do comando
        // que será entregue a este manipulador (ver `buscar`). É o único ponto
        // do sistema onde essa correlação precisa ser afirmada.
        manipuladores[tipo] as ManipuladorApagado,
      ]),
    );
  }

  buscar(tipo: TipoComandoExecutavel): ManipuladorApagado | null {
    return this.mapa.get(tipo) ?? null;
  }
}
