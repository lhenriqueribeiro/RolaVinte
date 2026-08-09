import type { CenaDTO, MensagemDTO, PersonagemDTO, TokenDTO } from './dtos';

/**
 * Contrato dos eventos Socket.IO — única fonte de verdade para api e web.
 * Cliente → servidor: comandos. Servidor → sala mesa:{id}: fatos.
 *
 * Os dois lados **aplicam** estes tipos nos genéricos do socket.io (RV-115):
 * `Socket<EventosServidorParaCliente, EventosClienteParaServidor>` no web e
 * `Server<EventosClienteParaServidorBruto, EventosServidorParaCliente, …>` na
 * api. Mudar um payload aqui quebra a compilação dos dois lados de uma vez —
 * que é exatamente o ponto: um evento não pode nascer com formatos diferentes
 * em cada ponta.
 */

/** Resposta do servidor ao pedido de entrada na sala da mesa. */
export type AckEntrarNaMesa = (resposta: { ok: boolean; erro?: string }) => void;

export interface EventosClienteParaServidor {
  'mesa:entrar': (mesaId: string, ack: AckEntrarNaMesa) => void;
  'mesa:sair': (mesaId: string) => void;
}

export interface EventosServidorParaCliente {
  'mensagem:nova': (mensagem: MensagemDTO) => void;
  'token:criado': (token: TokenDTO) => void;
  'token:atualizado': (token: TokenDTO) => void;
  'token:removido': (dados: { tokenId: string; cenaId: string }) => void;
  'cena:ativada': (cena: CenaDTO) => void;
  /**
   * Ficha alterada por alguém da mesa (RV-042). Carrega o `PersonagemDTO`
   * inteiro para que o cliente remende `['personagens', mesaId]` sem refetch —
   * é o que faz a barra de vida do token mudar ao vivo quando o mestre aplica
   * dano, sem que o PV precise ser copiado para o token.
   */
  'personagem:atualizado': (personagem: PersonagemDTO) => void;
  /** Removido pelo mestre ou saída voluntária (RV-021 / RV-022). */
  'mesa:participante-removido': (dados: { mesaId: string; usuarioId: string }) => void;
}

export type NomeEventoServidorParaCliente = keyof EventosServidorParaCliente;

/**
 * Payload do evento `E`, exatamente como chega ao cliente. Quem publica ou
 * registra o evento (port, adapter, fake de teste) usa isto em vez de recopiar
 * o formato — payload copiado é payload que diverge.
 */
export type PayloadEventoServidor<E extends NomeEventoServidorParaCliente> = Parameters<
  EventosServidorParaCliente[E]
>[0];

/**
 * `EventosServidorParaCliente` só existe em tempo de compilação, e nem o
 * TypeScript nem o lint conseguem exigir que o cliente tenha um `on(...)` para
 * cada evento — foi assim que `mesa:participante-removido` nasceu órfão.
 *
 * Este `Record` é a ponte entre tipo e valor: `Record<K, true>` recusa tanto
 * chave faltando quanto chave sobrando, então acrescentar um evento ao contrato
 * acima **obriga** a acrescentá-lo aqui, e a lista abaixo alimenta o teste de
 * cobertura de ouvintes do front (`features/jogo/cobertura-eventos-ws.test.ts`).
 */
const REGISTRO_SERVIDOR_PARA_CLIENTE: Record<NomeEventoServidorParaCliente, true> = {
  'mensagem:nova': true,
  'token:criado': true,
  'token:atualizado': true,
  'token:removido': true,
  'cena:ativada': true,
  'personagem:atualizado': true,
  'mesa:participante-removido': true,
};

/** Nomes dos eventos servidor→cliente, como valor. Ver o `Record` acima. */
export const EVENTOS_SERVIDOR_PARA_CLIENTE: readonly NomeEventoServidorParaCliente[] =
  Object.freeze(Object.keys(REGISTRO_SERVIDOR_PARA_CLIENTE) as NomeEventoServidorParaCliente[]);

/** Payload de dado vira `unknown`; callback de ack continua tipado (é nosso). */
type ArgumentoBruto<A> = A extends (...args: never[]) => unknown ? A | undefined : unknown;

type ArgumentosBrutos<A extends unknown[]> = { [I in keyof A]: ArgumentoBruto<A[I]> };

type HandlerBruto<F> = F extends (...args: infer A) => unknown
  ? (...args: ArgumentosBrutos<A>) => void | Promise<void>
  : never;

/**
 * Espelho de `EventosClienteParaServidor` para o **servidor** ouvir: mesmos
 * nomes e mesma aridade (derivados mecanicamente, não copiados), mas cada dado
 * chega como `unknown`.
 *
 * O cliente é hostil: o tipo diz o que ele *deveria* mandar, não o que ele
 * mandou. Tipo não substitui validação — o `GatewayJogo` continua obrigado a
 * passar todo payload por Zod antes de chamar qualquer caso de uso
 * (`.claude/rules/05-backend.md`). Este tipo existe justamente para que aplicar
 * os genéricos no `Server` não apague essa obrigação.
 */
export type EventosClienteParaServidorBruto = {
  [E in keyof EventosClienteParaServidor]: HandlerBruto<EventosClienteParaServidor[E]>;
};

export const SALA_MESA = (mesaId: string) => `mesa:${mesaId}`;
