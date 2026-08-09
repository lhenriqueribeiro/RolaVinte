import { beforeEach, describe, expect, it } from 'vitest';
import { Mesa } from '../../dominio/mesas/mesa';
import { Usuario } from '../../dominio/contas/usuario';
import {
  FakeMesaRepository,
  FakePublicadorEventosMesa,
  FakeUsuarioRepository,
  RelogioFixo,
} from '../../testes/fakes';
import { AtualizarMesa } from './atualizar-mesa';
import { EncerrarMesa } from './encerrar-mesa';
import { ListarConvites } from './listar-convites';
import { RemoverJogador } from './remover-jogador';
import { RevogarConvite } from './revogar-convite';
import { SairDaMesa } from './sair-da-mesa';

const AGORA = new Date('2026-08-08T12:00:00.000Z');
const MESA_ID = 'mesa-1';

function usuario(id: string, nome: string): Usuario {
  const r = Usuario.criar({
    id,
    nome,
    email: `${id}@ex.com`,
    senhaHash: 'hash',
    agora: AGORA,
  });
  if (!r.ok) throw new Error(r.erro.mensagem);
  return r.valor;
}

interface Cenario {
  mesas: FakeMesaRepository;
  usuarios: FakeUsuarioRepository;
  publicador: FakePublicadorEventosMesa;
  relogio: RelogioFixo;
}

/** Mesa persistida com o mestre e o jogador "bruno" (convite já aceito). */
async function montarCenario(): Promise<Cenario> {
  const usuarios = new FakeUsuarioRepository();
  const mesas = new FakeMesaRepository(usuarios);
  const publicador = new FakePublicadorEventosMesa();
  const relogio = new RelogioFixo(AGORA);

  await usuarios.salvar(usuario('mestre', 'Mestre'));
  await usuarios.salvar(usuario('bruno', 'Bruno'));

  const criada = Mesa.criar({
    id: MESA_ID,
    nome: 'A Maldição de Strahd',
    descricao: 'Barovia',
    sistema: 'dnd5e',
    mestreId: 'mestre',
    agora: AGORA,
  });
  if (!criada.ok) throw new Error(criada.erro.mensagem);
  criada.valor.convidar({
    solicitanteId: 'mestre',
    nomeSolicitante: 'Mestre',
    emailConvidado: 'bruno@ex.com',
    conviteId: 'convite-1',
    tokenConvite: 'tok-123456789',
    agora: AGORA,
  });
  criada.valor.aceitarConvite({
    token: 'tok-123456789',
    usuarioId: 'bruno',
    emailUsuario: 'bruno@ex.com',
    agora: AGORA,
  });
  await mesas.salvar(criada.valor);

  return { mesas, usuarios, publicador, relogio };
}

let cenario: Cenario;

beforeEach(async () => {
  cenario = await montarCenario();
});

describe('ListarConvites', () => {
  it('devolve o histórico para o mestre', async () => {
    const uso = new ListarConvites(cenario.mesas);

    const r = await uso.executar('mestre', MESA_ID);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor).toHaveLength(1);
    expect(r.valor[0]?.email).toBe('bruno@ex.com');
    expect(r.valor[0]?.status).toBe('aceito');
  });

  it('recusa jogador', async () => {
    const uso = new ListarConvites(cenario.mesas);
    const r = await uso.executar('bruno', MESA_ID);
    expect(!r.ok && r.erro.tipo).toBe('nao-autorizado');
  });

  it('mesa inexistente é não-encontrado', async () => {
    const uso = new ListarConvites(cenario.mesas);
    const r = await uso.executar('mestre', 'mesa-fantasma');
    expect(!r.ok && r.erro.tipo).toBe('nao-encontrado');
  });
});

describe('RevogarConvite', () => {
  it('persiste o status revogado', async () => {
    const mesa = await cenario.mesas.buscarPorId(MESA_ID);
    mesa?.convidar({
      solicitanteId: 'mestre',
      nomeSolicitante: 'Mestre',
      emailConvidado: 'novo@ex.com',
      conviteId: 'convite-2',
      tokenConvite: 'tok-987654321',
      agora: AGORA,
    });
    if (mesa) await cenario.mesas.salvar(mesa);

    const r = await new RevogarConvite(cenario.mesas).executar('mestre', MESA_ID, 'convite-2');

    expect(r.ok).toBe(true);
    const relida = await cenario.mesas.buscarPorId(MESA_ID);
    expect(relida?.convites.find((c) => c.id === 'convite-2')?.status).toBe('revogado');
    // Nada foi apagado: o histórico segue com os dois convites.
    expect(relida?.convites).toHaveLength(2);
  });

  it('recusa jogador', async () => {
    const r = await new RevogarConvite(cenario.mesas).executar('bruno', MESA_ID, 'convite-1');
    expect(!r.ok && r.erro.tipo).toBe('nao-autorizado');
  });
});

describe('RemoverJogador', () => {
  it('remove, persiste e avisa a sala da mesa', async () => {
    const uso = new RemoverJogador(cenario.mesas, cenario.publicador);

    const r = await uso.executar('mestre', MESA_ID, 'bruno');

    expect(r.ok).toBe(true);
    expect(cenario.publicador.doTipo('mesa:participante-removido')).toEqual([
      { nome: 'mesa:participante-removido', mesaId: MESA_ID, dados: { usuarioId: 'bruno' } },
    ]);
  });

  /**
   * Regressão: antes o repositório só fazia upsert, então a linha do removido
   * continuava no banco e ele reaparecia na leitura seguinte.
   */
  it('nova leitura do repositório não traz o participante removido', async () => {
    const uso = new RemoverJogador(cenario.mesas, cenario.publicador);

    await uso.executar('mestre', MESA_ID, 'bruno');

    const relida = await cenario.mesas.buscarPorId(MESA_ID);
    expect(relida?.ehParticipante('bruno')).toBe(false);
    expect(relida?.participantes.map((p) => p.usuarioId)).toEqual(['mestre']);
    expect(await cenario.mesas.listarJogadores(MESA_ID)).toHaveLength(1);
    expect(await cenario.mesas.listarDoUsuario('bruno')).toEqual([]);
  });

  it('mestre não remove a si mesmo e a mesa continua com mestre', async () => {
    const uso = new RemoverJogador(cenario.mesas, cenario.publicador);

    const r = await uso.executar('mestre', MESA_ID, 'mestre');

    expect(!r.ok && r.erro.tipo).toBe('nao-autorizado');
    const relida = await cenario.mesas.buscarPorId(MESA_ID);
    expect(relida?.ehParticipante('mestre')).toBe(true);
    expect(cenario.publicador.publicados).toHaveLength(0);
  });

  it('jogador não remove ninguém', async () => {
    const uso = new RemoverJogador(cenario.mesas, cenario.publicador);
    const r = await uso.executar('bruno', MESA_ID, 'mestre');
    expect(!r.ok && r.erro.tipo).toBe('nao-autorizado');
  });
});

describe('SairDaMesa', () => {
  it('jogador sai e some do próprio dashboard', async () => {
    const uso = new SairDaMesa(cenario.mesas, cenario.publicador);

    const r = await uso.executar('bruno', MESA_ID);

    expect(r.ok).toBe(true);
    expect(await cenario.mesas.listarDoUsuario('bruno')).toEqual([]);
    const relida = await cenario.mesas.buscarPorId(MESA_ID);
    expect(relida?.ehParticipante('bruno')).toBe(false);
  });

  it('mestre não sai da própria mesa', async () => {
    const uso = new SairDaMesa(cenario.mesas, cenario.publicador);
    const r = await uso.executar('mestre', MESA_ID);
    expect(!r.ok && r.erro.tipo).toBe('nao-autorizado');
  });
});

describe('EncerrarMesa', () => {
  it('registra a data do relógio injetado', async () => {
    const uso = new EncerrarMesa(cenario.mesas, cenario.relogio);

    const r = await uso.executar('mestre', MESA_ID);

    expect(r.ok).toBe(true);
    const relida = await cenario.mesas.buscarPorId(MESA_ID);
    expect(relida?.encerrada).toBe(true);
    expect(relida?.encerradaEm).toEqual(AGORA);
    const [dto] = await cenario.mesas.listarDoUsuario('mestre');
    expect(dto?.encerradaEm).toBe(AGORA.toISOString());
  });

  it('recusa jogador', async () => {
    const uso = new EncerrarMesa(cenario.mesas, cenario.relogio);
    const r = await uso.executar('bruno', MESA_ID);
    expect(!r.ok && r.erro.tipo).toBe('nao-autorizado');
  });
});

describe('AtualizarMesa', () => {
  it('mestre edita e recebe o DTO atualizado', async () => {
    const uso = new AtualizarMesa(cenario.mesas, cenario.usuarios);

    const r = await uso.executar('mestre', MESA_ID, { nome: 'A Maldição de Strahd — Ato II' });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.nome).toBe('A Maldição de Strahd — Ato II');
    expect(r.valor.mestreNome).toBe('Mestre');
    expect(r.valor.meuPapel).toBe('mestre');
    expect(r.valor.encerradaEm).toBeNull();
    const relida = await cenario.mesas.buscarPorId(MESA_ID);
    expect(relida?.nome).toBe('A Maldição de Strahd — Ato II');
  });

  it('recusa jogador sem alterar nada', async () => {
    const uso = new AtualizarMesa(cenario.mesas, cenario.usuarios);

    const r = await uso.executar('bruno', MESA_ID, { nome: 'Mesa do Bruno' });

    expect(!r.ok && r.erro.tipo).toBe('nao-autorizado');
    const relida = await cenario.mesas.buscarPorId(MESA_ID);
    expect(relida?.nome).toBe('A Maldição de Strahd');
  });
});
