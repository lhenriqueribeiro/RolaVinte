import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { EVENTOS_SERVIDOR_PARA_CLIENTE } from '@rolavinte/shared';
import { criarQueryClientDeTeste, criarWrapperQuery } from '@/testes/utilitarios';
import { SocketFalso } from '@/testes/socket-falso';
import { useSocketMesa } from './use-socket-mesa';

/**
 * Cobertura de eventos WS (RV-115).
 *
 * O compilador garante o **formato** de cada payload; não garante que exista um
 * `on(...)` para cada evento publicado. Foi assim que `mesa:participante-removido`
 * nasceu emitido pelo servidor e sem ouvinte no cliente: o jogador removido
 * continuava com a mesa na tela até dar F5, e nem tipo, nem lint, nem teste, nem
 * build acusaram.
 *
 * Este arquivo fecha esse buraco de fora: percorre a lista de eventos
 * servidor→cliente exportada como valor por `@rolavinte/shared` e exige um
 * ouvinte registrado por `useSocketMesa` para cada um. Acrescentar um evento ao
 * contrato sem assiná-lo aqui deixa a suíte vermelha **nomeando o evento**.
 */

const MESA_ID = 'mesa-1';

/**
 * Eventos do próprio ciclo de vida do socket.io — não fazem parte do contrato
 * de domínio e por isso não entram na comparação nos dois sentidos.
 */
const EVENTOS_RESERVADOS = ['connect', 'disconnect', 'connect_error'];

/** O mesmo contrato, alargado para `string`: os nomes vindos do socket são crus. */
const NOMES_CONTRATADOS: readonly string[] = EVENTOS_SERVIDOR_PARA_CLIENTE;

const contexto = vi.hoisted(() => ({ socket: null as unknown as SocketFalso }));

vi.mock('@/lib/socket', () => ({
  obterSocket: () => contexto.socket,
  desconectarSocket: () => undefined,
}));

function montar() {
  return renderHook(() => useSocketMesa(MESA_ID), {
    wrapper: criarWrapperQuery(criarQueryClientDeTeste()),
  });
}

/** Só os ouvintes de eventos de negócio: os reservados do socket.io ficam de fora. */
function eventosDeNegocioOuvidos(): string[] {
  return contexto.socket.eventosOuvidos.filter((e) => !EVENTOS_RESERVADOS.includes(e));
}

beforeEach(() => {
  contexto.socket = new SocketFalso();
});

describe('cobertura dos eventos servidor→cliente', () => {
  it('o contrato exportado como valor não está vazio', () => {
    // Rede de segurança do próprio teste: uma lista vazia faria todas as
    // asserções abaixo passarem sem verificar coisa alguma.
    expect(EVENTOS_SERVIDOR_PARA_CLIENTE.length).toBeGreaterThan(0);
  });

  it('todo evento do contrato tem ouvinte registrado por useSocketMesa', () => {
    montar();
    const ouvidos = new Set(contexto.socket.eventosOuvidos);

    const semOuvinte = EVENTOS_SERVIDOR_PARA_CLIENTE.filter((evento) => !ouvidos.has(evento));

    expect(
      semOuvinte,
      `Evento(s) declarados em EventosServidorParaCliente sem nenhum ouvinte em ` +
        `use-socket-mesa.ts: ${semOuvinte.join(', ')}. O servidor vai publicá-lo(s) e o ` +
        `cliente vai ignorá-lo(s) em silêncio — assine com socket.on(...) e remova no ` +
        `cleanup com socket.off(...).`,
    ).toEqual([]);
  });

  it('não assina evento que não existe no contrato (pega erro de digitação)', () => {
    montar();

    const forasDoContrato = eventosDeNegocioOuvidos().filter(
      (evento) => !NOMES_CONTRATADOS.includes(evento),
    );

    expect(
      forasDoContrato,
      `Ouvinte(s) registrados para evento(s) que o servidor nunca emite: ` +
        `${forasDoContrato.join(', ')}. Ou o nome está errado, ou falta declarar o evento em ` +
        `packages/shared/src/tipos/eventos-ws.ts.`,
    ).toEqual([]);
  });

  it('todo ouvinte do contrato é removido no cleanup', () => {
    const { unmount } = montar();

    unmount();

    const vazados = EVENTOS_SERVIDOR_PARA_CLIENTE.filter((evento) =>
      contexto.socket.eventosOuvidos.includes(evento),
    );
    expect(
      vazados,
      `Ouvinte(s) que sobreviveram ao unmount: ${vazados.join(', ')}. Cada troca de mesa ` +
        `empilharia mais um, e o cache seria escrito várias vezes pelo mesmo evento.`,
    ).toEqual([]);
    expect(contexto.socket.totalOuvintes).toBe(0);
  });
});
