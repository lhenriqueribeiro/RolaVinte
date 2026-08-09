import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Política de reconexão do socket (RV-112).
 *
 * O critério de aceite é "dez quedas seguidas não viram tempestade de
 * requisições", e quem o cumpre **não é** código nosso: é o `Backoff` do
 * socket.io-client. Este arquivo mede a única parte que é nossa — que as opções
 * cheguem ao `io(...)` com valores que fazem sentido.
 *
 * Foi ao fonte da dependência para não repetir a classe F1 da taxonomia
 * (configuração decorativa, que ninguém lê). Em socket.io-client 4.8.3,
 * `manager.js` monta `new Backoff({ min: reconnectionDelay, max:
 * reconnectionDelayMax, jitter: randomizationFactor })`, e
 * `contrib/backo2.js#duration()` calcula `min(ms * factor^tentativa, max)` —
 * crescimento exponencial com **teto**, exatamente o que o card pede. Um teste
 * que reimplementasse essa fórmula aqui estaria medindo a cópia, não o original.
 */

const { ioFalso } = vi.hoisted(() => ({
  // O socket real carrega o `auth` do handshake, e `obterSocket` compara o token
  // guardado ali com o da sessão para decidir se recria a conexão. Um duplo que
  // devolvesse `auth: {}` faria o módulo recriar o socket a cada chamada — e o
  // teste de reuso passaria a medir o defeito do próprio duplo.
  ioFalso: vi.fn((_uri: string, opcoes: { auth?: unknown }) => ({
    auth: opcoes.auth,
    disconnect: vi.fn(),
  })),
}));

vi.mock('socket.io-client', () => ({ io: ioFalso }));

/** O módulo guarda o socket num singleton: cada caso precisa de uma carga limpa. */
async function carregarModulo() {
  vi.resetModules();
  ioFalso.mockClear();
  return import('./socket');
}

async function opcoesUsadas(): Promise<Record<string, unknown>> {
  const { obterSocket } = await carregarModulo();
  obterSocket();
  const [, opcoes] = ioFalso.mock.calls[0] as unknown as [string, Record<string, unknown>];
  return opcoes;
}

beforeEach(() => {
  ioFalso.mockClear();
});

describe('obterSocket — política de reconexão', () => {
  it('entrega as opções de reconexão ao socket.io, que é quem as lê', async () => {
    const { OPCOES_RECONEXAO } = await carregarModulo();

    await expect(opcoesUsadas()).resolves.toMatchObject({ ...OPCOES_RECONEXAO });
  });

  it('a reconexão automática está ligada', async () => {
    expect((await opcoesUsadas()).reconnection).toBe(true);
  });

  it('o atraso tem teto finito, e o teto é maior que o atraso inicial', async () => {
    const { OPCOES_RECONEXAO } = await carregarModulo();

    // Sem teto finito, o atraso dobraria para sempre e uma queda de dez minutos
    // deixaria o jogador esperando horas pela próxima tentativa.
    expect(Number.isFinite(OPCOES_RECONEXAO.reconnectionDelayMax)).toBe(true);
    expect(OPCOES_RECONEXAO.reconnectionDelay).toBeGreaterThan(0);
    expect(OPCOES_RECONEXAO.reconnectionDelayMax).toBeGreaterThan(
      OPCOES_RECONEXAO.reconnectionDelay,
    );
    // E o teto não pode ser tão alto que vire abandono disfarçado.
    expect(OPCOES_RECONEXAO.reconnectionDelayMax).toBeLessThanOrEqual(30_000);
  });

  it('as tentativas são espalhadas (jitter), para o servidor não voltar sob avalanche', async () => {
    const { OPCOES_RECONEXAO } = await carregarModulo();

    // `backo2.js` só aplica o jitter quando ele está em (0, 1].
    expect(OPCOES_RECONEXAO.randomizationFactor).toBeGreaterThan(0);
    expect(OPCOES_RECONEXAO.randomizationFactor).toBeLessThanOrEqual(1);
  });

  it('reusa o mesmo socket enquanto o token não muda', async () => {
    const { obterSocket } = await carregarModulo();

    obterSocket();
    obterSocket();

    expect(ioFalso).toHaveBeenCalledTimes(1);
  });
});
