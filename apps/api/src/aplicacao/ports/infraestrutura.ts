import type { EventoDominio } from '../../dominio/compartilhado/evento-dominio';
import type { PayloadEventoServidor } from '@rolavinte/shared';

export interface GeradorId {
  gerar(): string;
}

export interface Relogio {
  agora(): Date;
}

export interface ServicoSenha {
  gerarHash(senha: string): Promise<string>;
  verificar(senha: string, hash: string): Promise<boolean>;
}

export interface ServicoToken {
  gerar(payload: { usuarioId: string }): Promise<string>;
  verificar(token: string): Promise<{ usuarioId: string } | null>;
}

export interface MensagemEmail {
  para: string;
  assunto: string;
  html: string;
}

export interface ServicoEmail {
  enviar(mensagem: MensagemEmail): Promise<void>;
}

/**
 * Armazenamento de arquivos binários (mapas das cenas — RV-032).
 *
 * O caminho é **sempre** gerado pela aplicação: nome de arquivo vindo do cliente
 * é vetor de path traversal e de sobrescrita. O SDK do provedor só aparece no
 * adapter em `infra/storage`.
 */
export interface ArmazenamentoArquivos {
  /** Grava o arquivo e devolve a URL pela qual o cliente o carrega. */
  salvar(caminho: string, conteudo: Uint8Array, tipo: string): Promise<string>;
  remover(caminho: string): Promise<void>;
}

export type HandlerEvento = (evento: EventoDominio) => Promise<void> | void;

export interface EventBus {
  publicar(eventos: EventoDominio[]): void;
  assinar(nomeEvento: string, handler: HandlerEvento): void;
}

/**
 * Broadcast em tempo real para todos os clientes conectados à sala da mesa.
 *
 * Os payloads vêm de `PayloadEventoServidor` (RV-115) em vez de recopiados: é
 * o que impede esta port de divergir do que o web escuta — mudar o formato em
 * `@rolavinte/shared` quebra a compilação de quem publica, dos dois lados.
 */
export interface PublicadorEventosMesa {
  mensagemNova(mesaId: string, mensagem: PayloadEventoServidor<'mensagem:nova'>): void;
  /**
   * Entrega direcionada de mensagem restrita — sussurro e rolagem oculta
   * (RV-070/RV-071). Mesmo evento (`mensagem:nova`), outro alvo: só os sockets
   * dos `usuarioIds` **naquela mesa**.
   *
   * É aqui que mora a privacidade. Publicar uma mensagem restrita por
   * `mensagemNova` a entregaria à sala inteira, e nenhum filtro de cliente
   * desfaria isso — o payload já teria saído do servidor.
   */
  mensagemPrivada(
    mesaId: string,
    usuarioIds: readonly string[],
    mensagem: PayloadEventoServidor<'mensagem:nova'>,
  ): void;
  tokenCriado(mesaId: string, token: PayloadEventoServidor<'token:criado'>): void;
  tokenAtualizado(mesaId: string, token: PayloadEventoServidor<'token:atualizado'>): void;
  tokenRemovido(mesaId: string, dados: PayloadEventoServidor<'token:removido'>): void;
  cenaAtivada(mesaId: string, cena: PayloadEventoServidor<'cena:ativada'>): void;
  /**
   * Ficha alterada (RV-042). O token não guarda PV: é este evento que faz a
   * barra de vida sobre o token mudar ao vivo quando o mestre aplica dano.
   */
  personagemAtualizado(
    mesaId: string,
    personagem: PayloadEventoServidor<'personagem:atualizado'>,
  ): void;
  /**
   * Remoção pelo mestre ou saída voluntária: tira o usuário da sala da mesa.
   * `mesaId` já é o primeiro argumento, então sai do payload — o adapter o
   * recoloca ao emitir.
   */
  participanteRemovido(
    mesaId: string,
    dados: Omit<PayloadEventoServidor<'mesa:participante-removido'>, 'mesaId'>,
  ): void;
  /**
   * O combate mudou (RV-061 … RV-065): começou, iniciativa rolada, turno passado,
   * combate encerrado. Um método para os quatro, porque o payload é o mesmo
   * `CombateDTO` completo e o cliente faz a mesma coisa com ele — reescrever o
   * cache do combate.
   */
  combateAtualizado(mesaId: string, combate: PayloadEventoServidor<'combate:atualizado'>): void;
}
