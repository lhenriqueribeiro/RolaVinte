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
  destinatarioId: DESTINATARIO_ID,
  destinatarioNome: 'Mestre',
  criadoEm: '2026-08-09T12:00:00.000Z',
};

interface Emissao {
  salas: string[];
  evento: string;
  payload: unknown;
}

function criarIoFalso() {
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
