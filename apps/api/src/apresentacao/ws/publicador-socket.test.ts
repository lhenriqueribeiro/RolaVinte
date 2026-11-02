import { describe, expect, it } from 'vitest';
import { SALA_MESA, SALA_USUARIO_NA_MESA, type MensagemDTO } from '@rolavinte/shared';
import { PublicadorSocket } from './publicador-socket';
import type { ServidorJogo } from './servidor-socket';

/**
 * O adapter que decide **para quais salas** o evento sai (RV-070/RV-071).
 *
 * O `FakePublicadorEventosMesa` dos casos de uso registra a intenção ("privada,
 * para estes usuários") e por construção nunca erra o alvo — ele não tem salas.
 * Quem traduz intenção em sala é esta classe, e é aqui que um sussurro vira
 * broadcast se alguém trocar `to(salas)` por `to(sala da mesa)` (F3 da
 * taxonomia: o teste tem de estar no adapter).
 */

const MESA_ID = 'mesa-1';
const AUTOR_ID = 'autor-1';
const DESTINATARIO_ID = 'destinatario-1';

const MENSAGEM: MensagemDTO = {
  id: 'm1',
  mesaId: MESA_ID,
  autorId: AUTOR_ID,
  autorNome: 'Aria',
  tipo: 'sussurro',
  conteudo: 'plano secreto',
  rolagem: null,
  motivo: null,
  avaliacao: null,
  destinatarioId: DESTINATARIO_ID,
  destinatarioNome: 'Mestre',
  criadoEm: '2026-08-09T12:00:00.000Z',
};

interface Emissao {
  salas: string[];
  evento: string;
  payload: unknown;
}

/**
 * Um socket remoto como `fetchSockets()` devolve.
 *
 * `leave` é **síncrono** aqui de propósito: é essa a assinatura de
 * `RemoteSocket` no socket.io (`leave(room: Room): void`), ao contrário do
 * `Socket` local, cujo `leave` pode devolver promessa. Dar ao dublê uma
 * capacidade que o real não tem é a F3 da taxonomia — e, neste caso, faria o
 * teste afirmar um risco de rejeição órfã que por este caminho não existe. O
 * caminho em que ele existe é o do `Socket` local, coberto em `salas.test.ts`.
 */
interface SocketRemotoFalso {
  data: { usuarioId: string };
  saiuDe: string[];
  leave(sala: string): void;
}

function criarSocketRemoto(usuarioId: string): SocketRemotoFalso {
  const socket: SocketRemotoFalso = {
    data: { usuarioId },
    saiuDe: [],
    leave(sala: string) {
      socket.saiuDe.push(sala);
    },
  };
  return socket;
}

function criarIoFalso(opcoes: { sockets?: SocketRemotoFalso[]; falhaAoBuscar?: Error } = {}) {
  const emissoes: Emissao[] = [];
  const io = {
    to(salas: string | string[]) {
      const alvo = Array.isArray(salas) ? salas : [salas];
      return {
        emit(evento: string, payload: unknown) {
          emissoes.push({ salas: alvo, evento, payload });
        },
      };
    },
    in() {
      return {
        fetchSockets: () =>
          opcoes.falhaAoBuscar
            ? Promise.reject(opcoes.falhaAoBuscar)
            : Promise.resolve(opcoes.sockets ?? []),
      };
    },
  };
  return { io: io as unknown as ServidorJogo, emissoes };
}

describe('PublicadorSocket — entrega direcionada (RV-070/RV-071)', () => {
  it('sussurro sai só para as salas pessoais de autor e destinatário', () => {
    const { io, emissoes } = criarIoFalso();
    new PublicadorSocket(io).mensagemPrivada(MESA_ID, [AUTOR_ID, DESTINATARIO_ID], MENSAGEM);

    expect(emissoes).toHaveLength(1);
    const emissao = emissoes[0]!;
    expect(emissao.evento).toBe('mensagem:nova');
    expect(emissao.payload).toEqual(MENSAGEM);
    expect([...emissao.salas].sort()).toEqual(
      [
        SALA_USUARIO_NA_MESA(MESA_ID, AUTOR_ID),
        SALA_USUARIO_NA_MESA(MESA_ID, DESTINATARIO_ID),
      ].sort(),
    );
    // O que não pode acontecer de jeito nenhum:
    expect(emissao.salas).not.toContain(SALA_MESA(MESA_ID));
  });

  it('rolagem oculta sai para uma sala só', () => {
    const { io, emissoes } = criarIoFalso();
    new PublicadorSocket(io).mensagemPrivada(MESA_ID, [AUTOR_ID], MENSAGEM);
    expect(emissoes[0]!.salas).toEqual([SALA_USUARIO_NA_MESA(MESA_ID, AUTOR_ID)]);
  });

  it('lista de alvos vazia não emite nada — `to([])` no Socket.IO é broadcast geral', () => {
    const { io, emissoes } = criarIoFalso();
    new PublicadorSocket(io).mensagemPrivada(MESA_ID, [], MENSAGEM);
    expect(emissoes).toHaveLength(0);
  });

  it('mensagem pública continua indo para a sala da mesa', () => {
    const { io, emissoes } = criarIoFalso();
    new PublicadorSocket(io).mensagemNova(MESA_ID, { ...MENSAGEM, tipo: 'fala' });
    expect(emissoes[0]!.salas).toEqual([SALA_MESA(MESA_ID)]);
  });

  it('a sala pessoal de uma mesa não é a sala pessoal de outra', () => {
    expect(SALA_USUARIO_NA_MESA('mesa-a', AUTOR_ID)).not.toBe(
      SALA_USUARIO_NA_MESA('mesa-b', AUTOR_ID),
    );
  });
});

/**
 * Revogação de acesso do participante removido (RV-021/RV-022).
 *
 * ## O defeito que estes casos fixam (descoberto na revisão de 2026-11-01)
 *
 * `participanteRemovido` tirava o socket **só** da sala da mesa e o deixava na
 * sala pessoal daquela mesa — a que recebe sussurro e rolagem oculta. A
 * invariante declarada em `eventos-ws.ts` é que as duas entram juntas e saem
 * juntas; por este caminho ela era falsa, e o que fazia a limpeza na prática era
 * o cliente emitindo `mesa:sair` por conta própria ao ser expulso da tela.
 * Privacidade que depende da cooperação do cliente não é privacidade (F4).
 *
 * O `.catch(() => {})` vazio era o segundo problema: a busca dos sockets falhar
 * significa que o acesso que deveria ter sido revogado continua de pé. Isso é
 * notícia, não ruído.
 */
describe('PublicadorSocket — revogação de acesso do removido (RV-021/RV-022)', () => {
  const REMOVIDO = 'usuario-removido';
  const QUEM_FICA = 'usuario-que-fica';

  /** Espera o encadeamento de `fetchSockets().then(...)` do adapter drenar. */
  const drenarMicrotarefas = () => new Promise((resolve) => setImmediate(resolve));

  it('tira o removido das DUAS salas da mesa, não só da pública', async () => {
    const removido = criarSocketRemoto(REMOVIDO);
    const { io } = criarIoFalso({ sockets: [removido] });

    new PublicadorSocket(io).participanteRemovido(MESA_ID, { usuarioId: REMOVIDO });
    await drenarMicrotarefas();

    expect([...removido.saiuDe].sort()).toEqual(
      [SALA_MESA(MESA_ID), SALA_USUARIO_NA_MESA(MESA_ID, REMOVIDO)].sort(),
    );
  });

  it('não desconecta de sala nenhuma quem continua na mesa', async () => {
    const removido = criarSocketRemoto(REMOVIDO);
    const fica = criarSocketRemoto(QUEM_FICA);
    const { io } = criarIoFalso({ sockets: [fica, removido] });

    new PublicadorSocket(io).participanteRemovido(MESA_ID, { usuarioId: REMOVIDO });
    await drenarMicrotarefas();

    expect(fica.saiuDe).toEqual([]);
  });

  it('avisa a sala antes de tirar o removido dela', () => {
    const { io, emissoes } = criarIoFalso({ sockets: [criarSocketRemoto(REMOVIDO)] });

    new PublicadorSocket(io).participanteRemovido(MESA_ID, { usuarioId: REMOVIDO });

    // Síncrono de propósito: a saída acontece depois do `emit`, senão o próprio
    // removido não receberia o aviso que o faz largar a mesa na tela.
    expect(emissoes).toHaveLength(1);
    expect(emissoes[0]!.evento).toBe('mesa:participante-removido');
    expect(emissoes[0]!.salas).toEqual([SALA_MESA(MESA_ID)]);
  });

  it('falha ao buscar os sockets é registrada em vez de sumir', async () => {
    const erro = new Error('fetchSockets falhou');
    const { io } = criarIoFalso({ falhaAoBuscar: erro });
    const registrados: unknown[] = [];

    new PublicadorSocket(io, (e) => registrados.push(e)).participanteRemovido(MESA_ID, {
      usuarioId: REMOVIDO,
    });
    await drenarMicrotarefas();

    // O acesso que deveria ter sido revogado continua de pé: calar isso é
    // transformar uma falha de segurança numa não-notícia.
    expect(registrados).toContain(erro);
  });
});
