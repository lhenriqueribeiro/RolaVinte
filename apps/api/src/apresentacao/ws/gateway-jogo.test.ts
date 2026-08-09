import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AckEntrarNaMesa } from '@rolavinte/shared';
import { Mesa } from '../../dominio/mesas/mesa';
import { VerificarParticipacao } from '../../aplicacao/jogo/verificar-participacao';
import { FakeMesaRepository, FakeServicoToken, FakeUsuarioRepository } from '../../testes/fakes';
import { GatewayJogo } from './gateway-jogo';
import type { DadosSocket, ServidorJogo, SocketJogo } from './servidor-socket';

/**
 * Contrato de tempo real do gateway.
 *
 * A razão de existir deste arquivo é o RV-115: o `Server` passou a ser tipado
 * pelo contrato de `@rolavinte/shared`, e tipo **não** substitui validação. O
 * cliente é hostil — pode mandar número onde o contrato promete uuid, ou nem
 * mandar o callback de ack. Os casos abaixo fixam que o Zod continua no
 * caminho e que nada além dele é tocado quando o payload é lixo.
 */

const MESA_ID = '11111111-1111-4111-8111-111111111111';
const OUTRA_MESA_ID = '22222222-2222-4222-8222-222222222222';
const USUARIO_ID = 'usuario-1';

/** Só o que o gateway usa de um socket — o resto do `Socket` não entra em jogo. */
class SocketFalso {
  readonly data: DadosSocket = { usuarioId: '' };
  readonly salas = new Set<string>();
  readonly handshake = { auth: {} as Record<string, unknown> };
  private readonly handlers = new Map<string, (...args: unknown[]) => void | Promise<void>>();

  on(evento: string, handler: (...args: never[]) => void | Promise<void>): this {
    this.handlers.set(evento, handler as (...args: unknown[]) => void | Promise<void>);
    return this;
  }

  async join(sala: string): Promise<void> {
    this.salas.add(sala);
  }

  async leave(sala: string): Promise<void> {
    this.salas.delete(sala);
  }

  /** Simula um evento vindo do cliente e espera o handler terminar. */
  async receber(evento: string, ...args: unknown[]): Promise<void> {
    const handler = this.handlers.get(evento);
    if (!handler) throw new Error(`Gateway não ouve "${evento}".`);
    await handler(...args);
  }
}

/** Captura o middleware de handshake e o handler de conexão registrados. */
class IoFalso {
  middleware?: (socket: SocketJogo, next: (erro?: Error) => void) => void;
  aoConectar?: (socket: SocketJogo) => void;

  use(fn: (socket: SocketJogo, next: (erro?: Error) => void) => void): this {
    this.middleware = fn;
    return this;
  }

  on(evento: string, fn: (socket: SocketJogo) => void): this {
    if (evento === 'connection') this.aoConectar = fn;
    return this;
  }
}

function montarGateway() {
  const usuarios = new FakeUsuarioRepository();
  const mesas = new FakeMesaRepository(usuarios);
  const servicoToken = new FakeServicoToken();
  const verificarParticipacao = new VerificarParticipacao(mesas);
  const buscarPorId = vi.spyOn(mesas, 'buscarPorId');

  const io = new IoFalso();
  new GatewayJogo(io as unknown as ServidorJogo, servicoToken, verificarParticipacao).iniciar();

  /** Conecta um socket já autenticado, como faz o middleware do handshake. */
  function conectar(usuarioId = USUARIO_ID): SocketFalso {
    const socket = new SocketFalso();
    socket.data.usuarioId = usuarioId;
    io.aoConectar?.(socket as unknown as SocketJogo);
    return socket;
  }

  async function semearMesaCom(participanteId: string | null): Promise<void> {
    const criada = Mesa.criar({
      id: MESA_ID,
      nome: 'Maldição de Strahd',
      descricao: 'Barovia',
      sistema: 'dnd5e',
      mestreId: participanteId ?? 'outro-mestre',
      agora: new Date('2026-08-09T12:00:00.000Z'),
    });
    if (!criada.ok) throw new Error('Falha ao semear a mesa de teste.');
    await mesas.salvar(criada.valor);
    buscarPorId.mockClear();
  }

  return { io, mesas, servicoToken, buscarPorId, conectar, semearMesaCom };
}

/** Coletor de ack: guarda o que o gateway respondeu ao cliente. */
function criarAck() {
  const respostas: { ok: boolean; erro?: string }[] = [];
  const ack: AckEntrarNaMesa = (resposta) => respostas.push(resposta);
  return { ack, respostas };
}

let gateway: ReturnType<typeof montarGateway>;

beforeEach(() => {
  gateway = montarGateway();
});

describe('GatewayJogo — mesa:entrar recusa payload inválido antes de qualquer caso de uso', () => {
  const payloadsHostis: { rotulo: string; valor: unknown }[] = [
    { rotulo: 'número', valor: 42 },
    { rotulo: 'texto que não é uuid', valor: 'mesa-1' },
    { rotulo: 'objeto', valor: { mesaId: MESA_ID } },
    { rotulo: 'nulo', valor: null },
    { rotulo: 'ausente', valor: undefined },
  ];

  for (const { rotulo, valor } of payloadsHostis) {
    it(`recusa ${rotulo} com mensagem em PT-BR e não consulta o repositório`, async () => {
      const socket = gateway.conectar();
      const { ack, respostas } = criarAck();

      await socket.receber('mesa:entrar', valor, ack);

      expect(respostas).toEqual([{ ok: false, erro: 'Mesa inválida.' }]);
      expect(gateway.buscarPorId).not.toHaveBeenCalled();
      expect(socket.salas.size).toBe(0);
    });
  }

  it('não quebra quando o cliente omite o callback de ack', async () => {
    const socket = gateway.conectar();

    await expect(socket.receber('mesa:entrar', 42)).resolves.toBeUndefined();
    await expect(socket.receber('mesa:entrar', 'não-uuid', 'ack-falso')).resolves.toBeUndefined();

    expect(gateway.buscarPorId).not.toHaveBeenCalled();
    expect(socket.salas.size).toBe(0);
  });
});

describe('GatewayJogo — autorização de entrada na sala', () => {
  it('entra na sala quando o usuário participa da mesa', async () => {
    await gateway.semearMesaCom(USUARIO_ID);
    const socket = gateway.conectar();
    const { ack, respostas } = criarAck();

    await socket.receber('mesa:entrar', MESA_ID, ack);

    expect(respostas).toEqual([{ ok: true }]);
    expect([...socket.salas]).toEqual([`mesa:${MESA_ID}`]);
  });

  it('recusa quem não participa, mesmo com uuid válido', async () => {
    await gateway.semearMesaCom(null);
    const socket = gateway.conectar();
    const { ack, respostas } = criarAck();

    await socket.receber('mesa:entrar', MESA_ID, ack);

    expect(respostas).toEqual([{ ok: false, erro: 'Você não participa desta mesa.' }]);
    expect(socket.salas.size).toBe(0);
  });

  it('recusa mesa inexistente', async () => {
    const socket = gateway.conectar();
    const { ack, respostas } = criarAck();

    await socket.receber('mesa:entrar', OUTRA_MESA_ID, ack);

    expect(respostas).toEqual([{ ok: false, erro: 'Você não participa desta mesa.' }]);
    expect(socket.salas.size).toBe(0);
  });
});

describe('GatewayJogo — mesa:sair', () => {
  it('sai apenas da sala pedida', async () => {
    await gateway.semearMesaCom(USUARIO_ID);
    const socket = gateway.conectar();
    const { ack } = criarAck();
    await socket.receber('mesa:entrar', MESA_ID, ack);

    await socket.receber('mesa:sair', MESA_ID);

    expect(socket.salas.size).toBe(0);
  });

  it('ignora payload inválido sem derrubar a conexão', async () => {
    await gateway.semearMesaCom(USUARIO_ID);
    const socket = gateway.conectar();
    const { ack } = criarAck();
    await socket.receber('mesa:entrar', MESA_ID, ack);

    await socket.receber('mesa:sair', { mesaId: MESA_ID });

    expect([...socket.salas]).toEqual([`mesa:${MESA_ID}`]);
  });
});

describe('GatewayJogo — autenticação do handshake', () => {
  async function autenticar(token: unknown): Promise<{ erro?: Error; socket: SocketFalso }> {
    const socket = new SocketFalso();
    if (token !== undefined) socket.handshake.auth.token = token;
    const erro = await new Promise<Error | undefined>((resolver) => {
      gateway.io.middleware?.(socket as unknown as SocketJogo, resolver);
    });
    return { erro, socket };
  }

  it('recusa handshake sem token', async () => {
    const { erro } = await autenticar(undefined);
    expect(erro?.message).toBe('Autenticação necessária.');
  });

  it('recusa token que não é string', async () => {
    const { erro } = await autenticar(42);
    expect(erro?.message).toBe('Autenticação necessária.');
  });

  it('recusa token inválido', async () => {
    const { erro } = await autenticar('token-forjado');
    expect(erro?.message).toBe('Sessão inválida.');
  });

  it('aceita token válido e carimba o usuário no socket', async () => {
    const token = await gateway.servicoToken.gerar({ usuarioId: USUARIO_ID });

    const { erro, socket } = await autenticar(token);

    expect(erro).toBeUndefined();
    expect(socket.data.usuarioId).toBe(USUARIO_ID);
  });
});
