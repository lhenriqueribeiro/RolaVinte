import type { PayloadEventoServidor } from '@rolavinte/shared';
import type { PublicadorEventosMesa } from '../../aplicacao/ports/infraestrutura';

/**
 * Registro de um broadcast. Os payloads são derivados do contrato de eventos
 * (RV-115): se o fake recopiasse os formatos, ele passaria a esconder
 * exatamente a divergência que os testes de caso de uso deveriam pegar.
 */
export type EventoPublicado =
  | { nome: 'mensagem:nova'; mesaId: string; dados: PayloadEventoServidor<'mensagem:nova'> }
  | {
      /**
       * Entrega direcionada de sussurro/rolagem oculta (RV-070/RV-071).
       * Registrada com nome próprio **no fake**, embora o evento no fio seja o
       * mesmo `mensagem:nova`: é o que permite a um teste afirmar que a sala da
       * mesa não recebeu nada e que os alvos são exatamente estes.
       */
      nome: 'mensagem:privada';
      mesaId: string;
      usuarioIds: readonly string[];
      dados: PayloadEventoServidor<'mensagem:nova'>;
    }
  | { nome: 'token:criado'; mesaId: string; dados: PayloadEventoServidor<'token:criado'> }
  | { nome: 'token:atualizado'; mesaId: string; dados: PayloadEventoServidor<'token:atualizado'> }
  | { nome: 'token:removido'; mesaId: string; dados: PayloadEventoServidor<'token:removido'> }
  | { nome: 'cena:ativada'; mesaId: string; dados: PayloadEventoServidor<'cena:ativada'> }
  | {
      nome: 'personagem:atualizado';
      mesaId: string;
      dados: PayloadEventoServidor<'personagem:atualizado'>;
    }
  | {
      nome: 'mesa:participante-removido';
      mesaId: string;
      dados: Omit<PayloadEventoServidor<'mesa:participante-removido'>, 'mesaId'>;
    }
  | {
      nome: 'combate:atualizado';
      mesaId: string;
      dados: PayloadEventoServidor<'combate:atualizado'>;
    };

/** Fake de `PublicadorEventosMesa`: registra o broadcast em vez de emitir no socket. */
export class FakePublicadorEventosMesa implements PublicadorEventosMesa {
  private readonly registros: EventoPublicado[] = [];

  mensagemNova(mesaId: string, mensagem: PayloadEventoServidor<'mensagem:nova'>): void {
    this.registros.push({ nome: 'mensagem:nova', mesaId, dados: mensagem });
  }

  mensagemPrivada(
    mesaId: string,
    usuarioIds: readonly string[],
    mensagem: PayloadEventoServidor<'mensagem:nova'>,
  ): void {
    this.registros.push({
      nome: 'mensagem:privada',
      mesaId,
      usuarioIds: [...usuarioIds],
      dados: mensagem,
    });
  }

  tokenCriado(mesaId: string, token: PayloadEventoServidor<'token:criado'>): void {
    this.registros.push({ nome: 'token:criado', mesaId, dados: token });
  }

  tokenAtualizado(mesaId: string, token: PayloadEventoServidor<'token:atualizado'>): void {
    this.registros.push({ nome: 'token:atualizado', mesaId, dados: token });
  }

  tokenRemovido(mesaId: string, dados: PayloadEventoServidor<'token:removido'>): void {
    this.registros.push({ nome: 'token:removido', mesaId, dados });
  }

  cenaAtivada(mesaId: string, cena: PayloadEventoServidor<'cena:ativada'>): void {
    this.registros.push({ nome: 'cena:ativada', mesaId, dados: cena });
  }

  personagemAtualizado(
    mesaId: string,
    personagem: PayloadEventoServidor<'personagem:atualizado'>,
  ): void {
    this.registros.push({ nome: 'personagem:atualizado', mesaId, dados: personagem });
  }

  combateAtualizado(mesaId: string, combate: PayloadEventoServidor<'combate:atualizado'>): void {
    this.registros.push({ nome: 'combate:atualizado', mesaId, dados: combate });
  }

  participanteRemovido(
    mesaId: string,
    dados: Omit<PayloadEventoServidor<'mesa:participante-removido'>, 'mesaId'>,
  ): void {
    this.registros.push({ nome: 'mesa:participante-removido', mesaId, dados: { ...dados } });
  }

  get publicados(): readonly EventoPublicado[] {
    return this.registros;
  }

  /** Apoio a testes: só os eventos de um tipo. */
  doTipo<N extends EventoPublicado['nome']>(nome: N): Extract<EventoPublicado, { nome: N }>[] {
    return this.registros.filter(
      (e): e is Extract<EventoPublicado, { nome: N }> => e.nome === nome,
    );
  }

  limpar(): void {
    this.registros.length = 0;
  }
}
