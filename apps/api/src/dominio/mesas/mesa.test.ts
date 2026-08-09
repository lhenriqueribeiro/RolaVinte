import { describe, expect, it } from 'vitest';
import { Mesa, MESA_ENCERRADA } from './mesa';
import { JogadorConvidado } from './eventos';

const AGORA = new Date('2026-08-08T12:00:00Z');

function mesaValida() {
  const r = Mesa.criar({
    id: 'mesa-1',
    nome: 'A Tumba dos Horrores',
    descricao: '',
    sistema: 'dnd5e',
    mestreId: 'mestre-1',
    agora: AGORA,
  });
  if (!r.ok) throw new Error(r.erro.mensagem);
  return r.valor;
}

/** Mesa com o mestre e um jogador que entrou por convite. */
function mesaComJogador() {
  const mesa = mesaValida();
  const convite = mesa.convidar({
    solicitanteId: 'mestre-1',
    nomeSolicitante: 'Mestre',
    emailConvidado: 'bruno@ex.com',
    conviteId: 'c1',
    tokenConvite: 'tok-123456789',
    agora: AGORA,
  });
  if (!convite.ok) throw new Error(convite.erro.mensagem);
  const aceite = mesa.aceitarConvite({
    token: 'tok-123456789',
    usuarioId: 'bruno',
    emailUsuario: 'bruno@ex.com',
    agora: AGORA,
  });
  if (!aceite.ok) throw new Error(aceite.erro.mensagem);
  mesa.puxarEventos();
  return mesa;
}

describe('Mesa', () => {
  it('nasce com o mestre como único participante', () => {
    const mesa = mesaValida();
    expect(mesa.participantes).toHaveLength(1);
    expect(mesa.ehMestre('mestre-1')).toBe(true);
    expect(mesa.ehParticipante('mestre-1')).toBe(true);
  });

  it('rejeita nome curto', () => {
    const r = Mesa.criar({
      id: 'm',
      nome: 'ab',
      descricao: '',
      sistema: 'generico',
      mestreId: 'u',
      agora: AGORA,
    });
    expect(r.ok).toBe(false);
  });

  it('só o mestre convida', () => {
    const mesa = mesaValida();
    const r = mesa.convidar({
      solicitanteId: 'intruso',
      nomeSolicitante: 'Intruso',
      emailConvidado: 'a@b.com',
      conviteId: 'c1',
      tokenConvite: 'tok-123456789',
      agora: AGORA,
    });
    expect(!r.ok && r.erro.tipo).toBe('nao-autorizado');
  });

  it('convite registra evento JogadorConvidado', () => {
    const mesa = mesaValida();
    const r = mesa.convidar({
      solicitanteId: 'mestre-1',
      nomeSolicitante: 'Mestre',
      emailConvidado: 'jogador@ex.com',
      conviteId: 'c1',
      tokenConvite: 'tok-123456789',
      agora: AGORA,
    });
    expect(r.ok).toBe(true);
    const eventos = mesa.puxarEventos();
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toBeInstanceOf(JogadorConvidado);
  });

  it('aplica cooldown de reenvio para o mesmo email', () => {
    const mesa = mesaValida();
    const base = {
      solicitanteId: 'mestre-1',
      nomeSolicitante: 'Mestre',
      emailConvidado: 'jogador@ex.com',
      agora: AGORA,
    };
    mesa.convidar({ ...base, conviteId: 'c1', tokenConvite: 'tok-1234567890' });
    const repetido = mesa.convidar({ ...base, conviteId: 'c2', tokenConvite: 'tok-0987654321' });
    expect(!repetido.ok && repetido.erro.tipo).toBe('conflito');

    const depoisDoCooldown = mesa.convidar({
      ...base,
      conviteId: 'c3',
      tokenConvite: 'tok-1122334455',
      agora: new Date(AGORA.getTime() + 61_000),
    });
    expect(depoisDoCooldown.ok).toBe(true);
  });

  it('aceitar convite adiciona jogador e consome o convite', () => {
    const mesa = mesaValida();
    mesa.convidar({
      solicitanteId: 'mestre-1',
      nomeSolicitante: 'Mestre',
      emailConvidado: 'jogador@ex.com',
      conviteId: 'c1',
      tokenConvite: 'tok-123456789',
      agora: AGORA,
    });

    const aceito = mesa.aceitarConvite({
      token: 'tok-123456789',
      usuarioId: 'jogador-1',
      emailUsuario: 'JOGADOR@ex.com',
      agora: AGORA,
    });
    expect(aceito.ok).toBe(true);
    expect(mesa.ehParticipante('jogador-1')).toBe(true);

    const deNovo = mesa.aceitarConvite({
      token: 'tok-123456789',
      usuarioId: 'jogador-2',
      emailUsuario: 'jogador@ex.com',
      agora: AGORA,
    });
    expect(!deNovo.ok && deNovo.erro.tipo).toBe('conflito');
  });

  it('convite aceito só pelo email convidado', () => {
    const mesa = mesaValida();
    mesa.convidar({
      solicitanteId: 'mestre-1',
      nomeSolicitante: 'Mestre',
      emailConvidado: 'certo@ex.com',
      conviteId: 'c1',
      tokenConvite: 'tok-123456789',
      agora: AGORA,
    });
    const r = mesa.aceitarConvite({
      token: 'tok-123456789',
      usuarioId: 'outro',
      emailUsuario: 'errado@ex.com',
      agora: AGORA,
    });
    expect(!r.ok && r.erro.tipo).toBe('nao-autorizado');
  });
});

describe('Mesa — gestão de convites (RV-020)', () => {
  it('revogar marca o convite como revogado sem apagá-lo', () => {
    const mesa = mesaValida();
    mesa.convidar({
      solicitanteId: 'mestre-1',
      nomeSolicitante: 'Mestre',
      emailConvidado: 'novo@ex.com',
      conviteId: 'c1',
      tokenConvite: 'tok-123456789',
      agora: AGORA,
    });

    const r = mesa.revogarConvite('mestre-1', 'c1');

    expect(r.ok).toBe(true);
    expect(mesa.convites).toHaveLength(1);
    expect(mesa.convites[0]?.status).toBe('revogado');
  });

  it('convite revogado não pode mais ser aceito', () => {
    const mesa = mesaValida();
    mesa.convidar({
      solicitanteId: 'mestre-1',
      nomeSolicitante: 'Mestre',
      emailConvidado: 'novo@ex.com',
      conviteId: 'c1',
      tokenConvite: 'tok-123456789',
      agora: AGORA,
    });
    mesa.revogarConvite('mestre-1', 'c1');

    const aceite = mesa.aceitarConvite({
      token: 'tok-123456789',
      usuarioId: 'novo',
      emailUsuario: 'novo@ex.com',
      agora: AGORA,
    });

    expect(!aceite.ok && aceite.erro.tipo).toBe('nao-encontrado');
    expect(!aceite.ok && aceite.erro.mensagem).toBe('Convite não encontrado ou já utilizado.');
    expect(mesa.ehParticipante('novo')).toBe(false);
  });

  it('revogar convite já aceito é conflito', () => {
    const mesa = mesaComJogador();

    const r = mesa.revogarConvite('mestre-1', 'c1');

    expect(!r.ok && r.erro.tipo).toBe('conflito');
    expect(mesa.convites[0]?.status).toBe('aceito');
  });

  it('revogar duas vezes é conflito', () => {
    const mesa = mesaValida();
    mesa.convidar({
      solicitanteId: 'mestre-1',
      nomeSolicitante: 'Mestre',
      emailConvidado: 'novo@ex.com',
      conviteId: 'c1',
      tokenConvite: 'tok-123456789',
      agora: AGORA,
    });
    mesa.revogarConvite('mestre-1', 'c1');

    const r = mesa.revogarConvite('mestre-1', 'c1');
    expect(!r.ok && r.erro.tipo).toBe('conflito');
  });

  it('jogador não revoga convite', () => {
    const mesa = mesaComJogador();
    const r = mesa.revogarConvite('bruno', 'c1');
    expect(!r.ok && r.erro.tipo).toBe('nao-autorizado');
  });

  it('revogar convite inexistente é não-encontrado', () => {
    const mesa = mesaValida();
    const r = mesa.revogarConvite('mestre-1', 'convite-fantasma');
    expect(!r.ok && r.erro.tipo).toBe('nao-encontrado');
  });

  it('convite revogado não bloqueia novo convite para o mesmo email', () => {
    const mesa = mesaValida();
    mesa.convidar({
      solicitanteId: 'mestre-1',
      nomeSolicitante: 'Mestre',
      emailConvidado: 'novo@ex.com',
      conviteId: 'c1',
      tokenConvite: 'tok-123456789',
      agora: AGORA,
    });
    mesa.revogarConvite('mestre-1', 'c1');

    const denovo = mesa.convidar({
      solicitanteId: 'mestre-1',
      nomeSolicitante: 'Mestre',
      emailConvidado: 'novo@ex.com',
      conviteId: 'c2',
      tokenConvite: 'tok-987654321',
      agora: AGORA,
    });

    expect(denovo.ok).toBe(true);
  });
});

describe('Mesa — remoção e saída (RV-021 / RV-022)', () => {
  it('mestre remove jogador', () => {
    const mesa = mesaComJogador();

    const r = mesa.removerJogador('mestre-1', 'bruno');

    expect(r.ok).toBe(true);
    expect(mesa.ehParticipante('bruno')).toBe(false);
    expect(mesa.participantes).toHaveLength(1);
  });

  it('mestre não remove a si mesmo', () => {
    const mesa = mesaComJogador();

    const r = mesa.removerJogador('mestre-1', 'mestre-1');

    expect(!r.ok && r.erro.tipo).toBe('nao-autorizado');
    expect(mesa.ehParticipante('mestre-1')).toBe(true);
  });

  it('remover quem não participa é não-encontrado', () => {
    const mesa = mesaComJogador();
    const r = mesa.removerJogador('mestre-1', 'estranho');
    expect(!r.ok && r.erro.tipo).toBe('nao-encontrado');
  });

  it('jogador não remove outro jogador', () => {
    const mesa = mesaComJogador();
    const r = mesa.removerJogador('bruno', 'mestre-1');
    expect(!r.ok && r.erro.tipo).toBe('nao-autorizado');
  });

  it('jogador sai da mesa', () => {
    const mesa = mesaComJogador();

    const r = mesa.sair('bruno');

    expect(r.ok).toBe(true);
    expect(mesa.ehParticipante('bruno')).toBe(false);
  });

  it('mestre não sai da própria mesa', () => {
    const mesa = mesaComJogador();

    const r = mesa.sair('mestre-1');

    expect(!r.ok && r.erro.tipo).toBe('nao-autorizado');
    expect(mesa.ehParticipante('mestre-1')).toBe(true);
    expect(mesa.mestreId).toBe('mestre-1');
  });

  it('quem não participa não sai', () => {
    const mesa = mesaComJogador();
    const r = mesa.sair('estranho');
    expect(!r.ok && r.erro.tipo).toBe('nao-encontrado');
  });
});

describe('Mesa — encerramento (RV-023)', () => {
  it('só o mestre encerra', () => {
    const mesa = mesaComJogador();

    const r = mesa.encerrar('bruno', AGORA);

    expect(!r.ok && r.erro.tipo).toBe('nao-autorizado');
    expect(mesa.encerrada).toBe(false);
  });

  it('encerrar registra a data e é idempotente por conflito', () => {
    const mesa = mesaValida();

    const r = mesa.encerrar('mestre-1', AGORA);
    expect(r.ok).toBe(true);
    expect(mesa.encerrada).toBe(true);
    expect(mesa.encerradaEm).toEqual(AGORA);

    const denovo = mesa.encerrar('mestre-1', AGORA);
    expect(!denovo.ok && denovo.erro.tipo).toBe('conflito');
  });

  it('mesa encerrada recusa qualquer escrita com conflito', () => {
    const mesa = mesaComJogador();
    mesa.encerrar('mestre-1', AGORA);

    const escritas = [
      mesa.autorizarEscritaDeParticipante('bruno'),
      mesa.autorizarEscritaDoMestre('mestre-1', 'Apenas o mestre.'),
      mesa.atualizar('mestre-1', { nome: 'Outro nome qualquer' }),
      mesa.removerJogador('mestre-1', 'bruno'),
      mesa.revogarConvite('mestre-1', 'c1'),
      mesa.convidar({
        solicitanteId: 'mestre-1',
        nomeSolicitante: 'Mestre',
        emailConvidado: 'tarde@ex.com',
        conviteId: 'c9',
        tokenConvite: 'tok-000000000',
        agora: AGORA,
      }),
    ];

    for (const escrita of escritas) {
      expect(escrita.ok).toBe(false);
      if (!escrita.ok) {
        expect(escrita.erro.tipo).toBe('conflito');
        expect(escrita.erro.mensagem).toBe(MESA_ENCERRADA);
      }
    }
    // Leitura continua liberada: o histórico é o motivo de arquivar em vez de apagar.
    expect(mesa.ehParticipante('bruno')).toBe(true);
    expect(mesa.nome).toBe('A Tumba dos Horrores');
  });

  it('jogador ainda consegue sair de uma mesa encerrada', () => {
    // Arquivar não pode prender ninguém: sem isto, a campanha encerrada fica
    // para sempre no painel de quem não joga mais (RV-022).
    const mesa = mesaComJogador();
    mesa.encerrar('mestre-1', AGORA);

    const saida = mesa.sair('bruno');

    expect(saida.ok).toBe(true);
    expect(mesa.ehParticipante('bruno')).toBe(false);
    expect(mesa.nome).toBe('A Tumba dos Horrores');
  });

  it('mesa aberta autoriza participante e recusa estranho', () => {
    const mesa = mesaComJogador();

    expect(mesa.autorizarEscritaDeParticipante('bruno').ok).toBe(true);
    const estranho = mesa.autorizarEscritaDeParticipante('estranho');
    expect(!estranho.ok && estranho.erro.tipo).toBe('nao-autorizado');
  });
});

describe('Mesa — edição (RV-024)', () => {
  it('mestre atualiza nome, descrição e sistema', () => {
    const mesa = mesaValida();

    const r = mesa.atualizar('mestre-1', {
      nome: '  A Maldição de Strahd — Ato II  ',
      descricao: '  Barovia  ',
      sistema: 'tormenta20',
    });

    expect(r.ok).toBe(true);
    expect(mesa.nome).toBe('A Maldição de Strahd — Ato II');
    expect(mesa.descricao).toBe('Barovia');
    expect(mesa.sistema).toBe('tormenta20');
  });

  it('atualização parcial preserva os campos não enviados', () => {
    const mesa = mesaValida();

    mesa.atualizar('mestre-1', { nome: 'Novo Nome da Mesa' });

    expect(mesa.nome).toBe('Novo Nome da Mesa');
    expect(mesa.sistema).toBe('dnd5e');
  });

  it('reaproveita a validação de criar: nome curto dá a mesma mensagem', () => {
    const criada = Mesa.criar({
      id: 'm',
      nome: 'ab',
      descricao: '',
      sistema: 'generico',
      mestreId: 'u',
      agora: AGORA,
    });
    const mesa = mesaValida();
    const atualizada = mesa.atualizar('mestre-1', { nome: 'ab' });

    expect(criada.ok).toBe(false);
    expect(atualizada.ok).toBe(false);
    if (criada.ok || atualizada.ok) return;
    expect(criada.erro.tipo).toBe('validacao');
    expect(atualizada.erro.tipo).toBe('validacao');
    expect(atualizada.erro.mensagem).toBe(criada.erro.mensagem);
    expect(mesa.nome).toBe('A Tumba dos Horrores');
  });

  it('jogador não edita a mesa', () => {
    const mesa = mesaComJogador();
    const r = mesa.atualizar('bruno', { nome: 'Mesa do Bruno' });
    expect(!r.ok && r.erro.tipo).toBe('nao-autorizado');
  });
});
