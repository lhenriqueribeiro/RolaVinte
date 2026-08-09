import { describe, expect, it } from 'vitest';
import type { MensagemDTO } from '@rolavinte/shared';
import { RolarDados } from './rolar-dados';
import { Mesa } from '../../dominio/mesas/mesa';
import { Usuario } from '../../dominio/contas/usuario';
import type { Mensagem } from '../../dominio/jogo/mensagem';
import { ServicoRolagemDados } from '../../dominio/jogo/servico-rolagem';
import type { MensagemRepository, MesaRepository, UsuarioRepository } from '../ports/repositorios';
import type { PublicadorEventosMesa } from '../ports/infraestrutura';

const AGORA = new Date('2026-08-08T12:00:00Z');

function criarCenario() {
  const mesa = (() => {
    const r = Mesa.criar({
      id: 'mesa-1',
      nome: 'Mesa Teste',
      descricao: '',
      sistema: 'generico',
      mestreId: 'mestre-1',
      agora: AGORA,
    });
    if (!r.ok) throw new Error('mesa inválida');
    return r.valor;
  })();

  const usuario = (() => {
    const r = Usuario.criar({
      id: 'mestre-1',
      nome: 'Mestre',
      email: 'm@ex.com',
      senhaHash: 'hash',
      agora: AGORA,
    });
    if (!r.ok) throw new Error('usuário inválido');
    return r.valor;
  })();

  const salvas: Mensagem[] = [];
  const publicadas: MensagemDTO[] = [];

  const mesas: MesaRepository = {
    salvar: async () => {},
    buscarPorId: async (id) => (id === mesa.id ? mesa : null),
    buscarPorTokenConvite: async () => null,
    listarDoUsuario: async () => [],
    listarJogadores: async () => [],
  };
  const usuarios: UsuarioRepository = {
    salvar: async () => {},
    buscarPorId: async (id) => (id === usuario.id ? usuario : null),
    buscarPorEmail: async () => null,
  };
  const mensagens: MensagemRepository = {
    salvar: async (m) => {
      salvas.push(m);
    },
    listarDaMesa: async () => [],
  };
  const publicador: PublicadorEventosMesa = {
    mensagemNova: (_mesaId, dto) => {
      publicadas.push(dto);
    },
    tokenCriado: () => {},
    tokenAtualizado: () => {},
    tokenRemovido: () => {},
    cenaAtivada: () => {},
    personagemAtualizado: () => {},
    participanteRemovido: () => {},
  };

  const rolarDados = new RolarDados(
    mensagens,
    mesas,
    usuarios,
    new ServicoRolagemDados(() => 0.999), // sempre rola o máximo
    { gerar: () => 'msg-1' },
    { agora: () => AGORA },
    publicador,
  );

  return { rolarDados, salvas, publicadas };
}

describe('RolarDados', () => {
  it('rola, persiste e publica na sala da mesa', async () => {
    const { rolarDados, salvas, publicadas } = criarCenario();
    const r = await rolarDados.executar('mestre-1', 'mesa-1', {
      expressao: '2d6+1',
      motivo: 'ataque',
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.tipo).toBe('rolagem');
    expect(r.valor.rolagem?.total).toBe(13);
    expect(r.valor.motivo).toBe('ataque');
    expect(salvas).toHaveLength(1);
    expect(publicadas).toHaveLength(1);
  });

  it('rejeita quem não participa da mesa', async () => {
    const { rolarDados, salvas } = criarCenario();
    const r = await rolarDados.executar('intruso', 'mesa-1', { expressao: 'd20', motivo: '' });
    expect(!r.ok && r.erro.tipo).toBe('nao-autorizado');
    expect(salvas).toHaveLength(0);
  });

  it('rejeita expressão inválida sem persistir nada', async () => {
    const { rolarDados, salvas } = criarCenario();
    const r = await rolarDados.executar('mestre-1', 'mesa-1', { expressao: 'banana', motivo: '' });
    expect(!r.ok && r.erro.tipo).toBe('validacao');
    expect(salvas).toHaveLength(0);
  });
});
