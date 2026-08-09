import { describe, expect, it } from 'vitest';
import { RolarDados, ROLAGEM_OCULTA_SO_DO_MESTRE } from './rolar-dados';
import { EnviarSussurro } from './enviar-sussurro';
import { ListarMensagens } from './listar-mensagens';
import { Mesa } from '../../dominio/mesas/mesa';
import { Usuario } from '../../dominio/contas/usuario';
import { ServicoRolagemDados } from '../../dominio/jogo/servico-rolagem';
import {
  FakeMensagemRepository,
  FakeMesaRepository,
  FakePublicadorEventosMesa,
  FakeUsuarioRepository,
  GeradorIdSequencial,
  RelogioFixo,
} from '../../testes/fakes';

const AGORA = new Date('2026-08-08T12:00:00Z');
const MESA_ID = 'mesa-1';
const MESTRE_ID = 'mestre-1';
const JOGADOR_ID = 'jogador-1';
const ESPIA_ID = 'espia-1';

async function criarCenario() {
  const usuarios = new FakeUsuarioRepository();
  for (const [id, nome] of [
    [MESTRE_ID, 'Mestre'],
    [JOGADOR_ID, 'Aria'],
    [ESPIA_ID, 'Bruno'],
  ] as const) {
    const u = Usuario.criar({
      id,
      nome,
      email: `${id}@ex.com`,
      senhaHash: 'hash',
      agora: AGORA,
    });
    if (!u.ok) throw new Error('usuário inválido');
    await usuarios.salvar(u.valor);
  }

  const mesas = new FakeMesaRepository(usuarios);
  const criada = Mesa.criar({
    id: MESA_ID,
    nome: 'Mesa Teste',
    descricao: '',
    sistema: 'generico',
    mestreId: MESTRE_ID,
    agora: AGORA,
  });
  if (!criada.ok) throw new Error('mesa inválida');
  const mesa = criada.valor;
  for (const [id, email] of [
    [JOGADOR_ID, `${JOGADOR_ID}@ex.com`],
    [ESPIA_ID, `${ESPIA_ID}@ex.com`],
  ] as const) {
    const convite = mesa.convidar({
      solicitanteId: MESTRE_ID,
      nomeSolicitante: 'Mestre',
      emailConvidado: email,
      conviteId: `convite-${id}`,
      tokenConvite: `token-${id}`,
      agora: AGORA,
    });
    if (!convite.ok) throw new Error('convite inválido');
    const aceito = mesa.aceitarConvite({
      token: `token-${id}`,
      usuarioId: id,
      emailUsuario: email,
      agora: AGORA,
    });
    if (!aceito.ok) throw new Error(`convite não aceito: ${aceito.erro.mensagem}`);
  }
  await mesas.salvar(mesa);

  const mensagens = new FakeMensagemRepository();
  const publicador = new FakePublicadorEventosMesa();
  const geradorId = new GeradorIdSequencial();
  const relogio = new RelogioFixo(AGORA);

  return {
    mensagens,
    publicador,
    rolarDados: new RolarDados(
      mensagens,
      mesas,
      usuarios,
      new ServicoRolagemDados(() => 0.999), // sempre rola o máximo
      geradorId,
      relogio,
      publicador,
    ),
    enviarSussurro: new EnviarSussurro(mensagens, mesas, usuarios, geradorId, relogio, publicador),
    listarMensagens: new ListarMensagens(mensagens, mesas),
    mesas,
    mesa,
  };
}

describe('RolarDados — rolagem comum', () => {
  it('rola, persiste e publica para a sala da mesa', async () => {
    const { rolarDados, mensagens, publicador } = await criarCenario();
    const r = await rolarDados.executar(JOGADOR_ID, MESA_ID, {
      expressao: '2d6+1',
      motivo: 'ataque',
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.tipo).toBe('rolagem');
    expect(r.valor.rolagem?.total).toBe(13);
    expect(r.valor.motivo).toBe('ataque');
    expect(mensagens.salvas).toHaveLength(1);
    expect(publicador.doTipo('mensagem:nova')).toHaveLength(1);
    expect(publicador.doTipo('mensagem:privada')).toHaveLength(0);
  });

  it('rejeita quem não participa da mesa', async () => {
    const { rolarDados, mensagens } = await criarCenario();
    const r = await rolarDados.executar('intruso', MESA_ID, { expressao: 'd20', motivo: '' });
    expect(!r.ok && r.erro.tipo).toBe('nao-autorizado');
    expect(mensagens.salvas).toHaveLength(0);
  });

  it('rejeita expressão inválida sem persistir nada', async () => {
    const { rolarDados, mensagens } = await criarCenario();
    const r = await rolarDados.executar(MESTRE_ID, MESA_ID, { expressao: 'banana', motivo: '' });
    expect(!r.ok && r.erro.tipo).toBe('validacao');
    expect(mensagens.salvas).toHaveLength(0);
  });
});

describe('RolarDados — rolagem oculta (RV-071)', () => {
  it('o mestre rola e o resultado sai só para ele, nunca para a sala', async () => {
    const { rolarDados, publicador } = await criarCenario();
    const r = await rolarDados.executar(MESTRE_ID, MESA_ID, {
      expressao: '1d20+5',
      motivo: 'percepção',
      oculta: true,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.tipo).toBe('rolagem-oculta');
    expect(r.valor.rolagem?.total).toBe(25);

    // O ponto do card: nenhum broadcast para a sala da mesa.
    expect(publicador.doTipo('mensagem:nova')).toHaveLength(0);
    const privados = publicador.doTipo('mensagem:privada');
    expect(privados).toHaveLength(1);
    expect(privados[0]!.usuarioIds).toEqual([MESTRE_ID]);
    expect(privados[0]!.mesaId).toBe(MESA_ID);
  });

  it('jogador recebe 403 e nada é persistido nem publicado', async () => {
    const { rolarDados, mensagens, publicador } = await criarCenario();
    const r = await rolarDados.executar(JOGADOR_ID, MESA_ID, {
      expressao: '1d20',
      motivo: '',
      oculta: true,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('nao-autorizado');
    expect(r.erro.mensagem).toBe(ROLAGEM_OCULTA_SO_DO_MESTRE);
    expect(mensagens.salvas).toHaveLength(0);
    expect(publicador.publicados).toHaveLength(0);
  });

  it('mesa encerrada bloqueia a rolagem oculta do próprio mestre', async () => {
    const { rolarDados, mesas, mesa } = await criarCenario();
    const encerrada = mesa.encerrar(MESTRE_ID, AGORA);
    expect(encerrada.ok).toBe(true);
    await mesas.salvar(mesa);

    const r = await rolarDados.executar(MESTRE_ID, MESA_ID, {
      expressao: '1d20',
      motivo: '',
      oculta: true,
    });
    expect(!r.ok && r.erro.tipo).toBe('conflito');
  });

  it('não deixa rastro no histórico dos jogadores', async () => {
    const { rolarDados, listarMensagens } = await criarCenario();
    await rolarDados.executar(MESTRE_ID, MESA_ID, {
      expressao: '1d20+5',
      motivo: 'percepção',
      oculta: true,
    });

    const doJogador = await listarMensagens.executar(JOGADOR_ID, MESA_ID);
    expect(doJogador.ok && doJogador.valor).toEqual([]);

    const doMestre = await listarMensagens.executar(MESTRE_ID, MESA_ID);
    expect(doMestre.ok && doMestre.valor.map((m) => m.tipo)).toEqual(['rolagem-oculta']);
  });
});

describe('EnviarSussurro (RV-070)', () => {
  it('entrega só a autor e destinatário, e nunca à sala', async () => {
    const { enviarSussurro, publicador } = await criarCenario();
    const r = await enviarSussurro.executar(JOGADOR_ID, MESA_ID, 'Mestre', 'plano secreto');

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.tipo).toBe('sussurro');
    expect(r.valor.destinatarioId).toBe(MESTRE_ID);
    expect(r.valor.destinatarioNome).toBe('Mestre');

    expect(publicador.doTipo('mensagem:nova')).toHaveLength(0);
    const privados = publicador.doTipo('mensagem:privada');
    expect(privados).toHaveLength(1);
    expect([...privados[0]!.usuarioIds].sort()).toEqual([JOGADOR_ID, MESTRE_ID].sort());
  });

  it('casa o nome sem diferenciar maiúsculas nem espaços nas pontas', async () => {
    const { enviarSussurro } = await criarCenario();
    const r = await enviarSussurro.executar(JOGADOR_ID, MESA_ID, '  mEsTrE ', 'oi');
    expect(r.ok && r.valor.destinatarioId).toBe(MESTRE_ID);
  });

  it('destinatário fora da mesa é 404 e nada é enviado', async () => {
    const { enviarSussurro, mensagens, publicador } = await criarCenario();
    const r = await enviarSussurro.executar(JOGADOR_ID, MESA_ID, 'Fantasma', 'oi');
    expect(!r.ok && r.erro.tipo).toBe('nao-encontrado');
    expect(mensagens.salvas).toHaveLength(0);
    expect(publicador.publicados).toHaveLength(0);
  });

  it('quem não participa não sussurra', async () => {
    const { enviarSussurro } = await criarCenario();
    const r = await enviarSussurro.executar('intruso', MESA_ID, 'Mestre', 'oi');
    expect(!r.ok && r.erro.tipo).toBe('nao-autorizado');
  });

  it('mesa encerrada bloqueia o sussurro', async () => {
    const { enviarSussurro, mesas, mesa } = await criarCenario();
    mesa.encerrar(MESTRE_ID, AGORA);
    await mesas.salvar(mesa);
    const r = await enviarSussurro.executar(JOGADOR_ID, MESA_ID, 'Mestre', 'oi');
    expect(!r.ok && r.erro.tipo).toBe('conflito');
  });
});

describe('ListarMensagens — histórico respeita a privacidade (RV-070)', () => {
  it('terceiro não vê o sussurro; autor e destinatário veem', async () => {
    const { enviarSussurro, rolarDados, listarMensagens } = await criarCenario();
    await rolarDados.executar(JOGADOR_ID, MESA_ID, { expressao: '1d20', motivo: '' });
    await enviarSussurro.executar(JOGADOR_ID, MESA_ID, 'Mestre', 'plano secreto');

    const doEspia = await listarMensagens.executar(ESPIA_ID, MESA_ID);
    expect(doEspia.ok).toBe(true);
    if (!doEspia.ok) return;
    expect(doEspia.valor.map((m) => m.tipo)).toEqual(['rolagem']);
    // O payload inteiro, não só o tipo: nem o conteúdo nem o nome do
    // destinatário podem atravessar a fronteira.
    expect(JSON.stringify(doEspia.valor)).not.toContain('plano secreto');

    // Ordenado por tipo, e não pela ordem de chegada: o relógio dos testes é
    // fixo, então as duas mensagens têm o mesmo `criadoEm` e a ordem entre elas
    // é indefinida — no fake e no Postgres (ver RV-073, cursor por data + id).
    for (const usuarioId of [JOGADOR_ID, MESTRE_ID]) {
      const visivel = await listarMensagens.executar(usuarioId, MESA_ID);
      expect(visivel.ok && visivel.valor.map((m) => m.tipo).sort()).toEqual([
        'rolagem',
        'sussurro',
      ]);
      expect(visivel.ok && JSON.stringify(visivel.valor)).toContain('plano secreto');
    }
  });
});
