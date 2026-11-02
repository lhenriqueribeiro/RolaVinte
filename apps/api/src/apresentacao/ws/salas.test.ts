import { describe, expect, it } from 'vitest';
import { SALA_MESA, SALA_USUARIO_NA_MESA } from '@rolavinte/shared';
import { sairDasSalasDaMesa, salasDaMesa, type SocketQueSai } from './salas';

/**
 * As salas de uma mesa, e a saída delas sem deixar promessa sem dono.
 *
 * ## Por que este arquivo existe (revisão de 2026-11-01)
 *
 * Duas coisas se repetiam à mão em cada ponto que mexia em sala: **quais** são
 * as salas de uma mesa, e **como** sair delas. A segunda cópia já nasceu
 * incompleta — `participanteRemovido` tirava o jogador removido da sala da mesa
 * e o deixava na pessoal, que é o destino de sussurro e rolagem oculta.
 *
 * ## O que é específico do `Socket` local
 *
 * `RemoteSocket.leave` é síncrono (`leave(room): void`); o `Socket` local, não
 * — ele devolve `void | Promise<void>`, porque o adapter pode ser assíncrono. É
 * por isso que `leave` aparece como união em `SocketQueSai`, e é só pelo
 * caminho do `Socket` local (o gateway, no `mesa:sair`) que uma rejeição órfã é
 * possível. O socket.io não observa o que um listener devolve, e sem
 * `unhandledRejection` registrado uma rejeição ali derruba o processo inteiro:
 * todas as mesas, todos os jogadores. Foi o que aconteceu de verdade neste
 * projeto, e é o que o último caso abaixo protege.
 */

const MESA_ID = 'mesa-1';
const USUARIO_ID = 'usuario-1';

function criarSocket(aoSair?: (sala: string) => void | Promise<void>) {
  const saiuDe: string[] = [];
  const socket: SocketQueSai = {
    data: { usuarioId: USUARIO_ID },
    leave(sala: string) {
      saiuDe.push(sala);
      return aoSair?.(sala);
    },
  };
  return { socket, saiuDe };
}

const registrador = () => {
  const registrados: { erro: unknown; contexto: string }[] = [];
  return {
    registrados,
    registrar: (erro: unknown, contexto: string) => registrados.push({ erro, contexto }),
  };
};

describe('salasDaMesa', () => {
  it('são a sala da mesa e a sala pessoal dentro dela', () => {
    expect([...salasDaMesa(MESA_ID, USUARIO_ID)].sort()).toEqual(
      [SALA_MESA(MESA_ID), SALA_USUARIO_NA_MESA(MESA_ID, USUARIO_ID)].sort(),
    );
  });

  it('a sala pessoal de uma mesa não serve para outra', () => {
    expect(salasDaMesa('mesa-a', USUARIO_ID)).not.toEqual(salasDaMesa('mesa-b', USUARIO_ID));
  });
});

describe('sairDasSalasDaMesa', () => {
  it('sai de todas as salas da mesa, não só da pública', () => {
    const { socket, saiuDe } = criarSocket();
    const log = registrador();

    sairDasSalasDaMesa(socket, MESA_ID, USUARIO_ID, log.registrar, 'teste');

    expect([...saiuDe].sort()).toEqual([...salasDaMesa(MESA_ID, USUARIO_ID)].sort());
    expect(log.registrados).toEqual([]);
  });

  it('`leave` síncrono (RemoteSocket) não registra erro nenhum', () => {
    const { socket } = criarSocket(() => undefined);
    const log = registrador();

    sairDasSalasDaMesa(socket, MESA_ID, USUARIO_ID, log.registrar, 'teste');

    expect(log.registrados).toEqual([]);
  });

  it('`leave` assíncrono que rejeita é registrado, e não vira rejeição sem dono', async () => {
    const erro = new Error('adapter do socket.io caiu');
    const { socket } = criarSocket(() => Promise.reject(erro));
    const log = registrador();

    // A asserção é sobre o próprio `unhandledRejection` do Node, e não sobre um
    // efeito indireto: é literalmente este evento que, sem ouvinte registrado,
    // encerra o processo. Medir só o log testaria o sintoma e deixaria passar um
    // `void` no lugar do `catch` — que foi como a classe original atravessou
    // `check`, `lint`, `test` e `build` sem ruído nenhum.
    const orfas: unknown[] = [];
    const capturar = (motivo: unknown) => orfas.push(motivo);
    process.on('unhandledRejection', capturar);
    try {
      sairDasSalasDaMesa(socket, MESA_ID, USUARIO_ID, log.registrar, 'mesa:sair');
      // Dois turnos do loop: o Node só decide que uma rejeição ficou sem dono
      // depois de esvaziar as microtarefas e voltar ao loop. Com um turno só,
      // este caso passaria verde por chegar cedo demais.
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off('unhandledRejection', capturar);
    }

    expect(orfas).toEqual([]);
    // Uma por sala: nenhuma falha é engolida porque a outra também falhou.
    expect(log.registrados).toHaveLength(salasDaMesa(MESA_ID, USUARIO_ID).length);
    expect(log.registrados.map((r) => r.erro)).toContain(erro);
    expect(log.registrados[0]!.contexto).toBe('mesa:sair');
  });
});
