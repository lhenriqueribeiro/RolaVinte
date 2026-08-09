import { beforeEach, describe, expect, it } from 'vitest';
import { Mesa } from '../../dominio/mesas/mesa';
import { Personagem } from '../../dominio/personagens/personagem';
import { Usuario } from '../../dominio/contas/usuario';
import {
  FakeMesaRepository,
  FakePersonagemRepository,
  FakePublicadorEventosMesa,
  FakeUsuarioRepository,
} from '../../testes/fakes';
import { AtualizarPersonagem } from './atualizar-personagem';

const AGORA = new Date('2026-08-09T12:00:00.000Z');
const MESA_ID = '00000000-0000-4000-9000-000000000001';
const THORIN = '00000000-0000-4000-9000-0000000000b1';

const ATRIBUTOS = {
  forca: 16,
  destreza: 10,
  constituicao: 14,
  inteligencia: 10,
  sabedoria: 10,
  carisma: 10,
};

function usuario(id: string, nome: string): Usuario {
  const r = Usuario.criar({ id, nome, email: `${id}@ex.com`, senhaHash: 'hash', agora: AGORA });
  if (!r.ok) throw new Error(r.erro.mensagem);
  return r.valor;
}

interface Cenario {
  mesas: FakeMesaRepository;
  personagens: FakePersonagemRepository;
  publicador: FakePublicadorEventosMesa;
  atualizarPersonagem: AtualizarPersonagem;
}

/** Mesa do "mestre" com o jogador "bruno", dono de Thorin (30/30 PV). */
async function montarCenario(): Promise<Cenario> {
  const usuarios = new FakeUsuarioRepository();
  const mesas = new FakeMesaRepository(usuarios);
  const personagens = new FakePersonagemRepository(usuarios);
  const publicador = new FakePublicadorEventosMesa();

  for (const [id, nome] of [
    ['mestre', 'Mestre'],
    ['bruno', 'Bruno'],
    ['intruso', 'Intruso'],
  ] as const) {
    await usuarios.salvar(usuario(id, nome));
  }

  const criada = Mesa.criar({
    id: MESA_ID,
    nome: 'A Maldição de Strahd',
    descricao: '',
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
    tokenConvite: 'tok-1',
    agora: AGORA,
  });
  criada.valor.aceitarConvite({
    token: 'tok-1',
    usuarioId: 'bruno',
    emailUsuario: 'bruno@ex.com',
    agora: AGORA,
  });
  await mesas.salvar(criada.valor);

  const thorin = Personagem.criar(
    {
      id: THORIN,
      mesaId: MESA_ID,
      donoId: 'bruno',
      nome: 'Thorin',
      classe: 'Guerreiro',
      nivel: 3,
      pvMax: 30,
      atributos: ATRIBUTOS,
      anotacoes: '',
    },
    'dnd5e',
  );
  if (!thorin.ok) throw new Error(thorin.erro.mensagem);
  await personagens.salvar(thorin.valor);

  return {
    mesas,
    personagens,
    publicador,
    atualizarPersonagem: new AtualizarPersonagem(personagens, mesas, usuarios, publicador),
  };
}

let c: Cenario;

beforeEach(async () => {
  c = await montarCenario();
});

async function encerrarMesa(): Promise<void> {
  const mesa = await c.mesas.buscarPorId(MESA_ID);
  if (!mesa) throw new Error('mesa de teste ausente');
  const r = mesa.encerrar('mestre', AGORA);
  if (!r.ok) throw new Error(r.erro.mensagem);
  await c.mesas.salvar(mesa);
}

describe('AtualizarPersonagem publica personagem:atualizado (RV-042)', () => {
  it('publica exatamente um evento por atualização bem-sucedida, com o PV novo', async () => {
    const r = await c.atualizarPersonagem.executar('mestre', THORIN, { pvAtual: 12 });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor).toMatchObject({ pvAtual: 12, pvMax: 30 });

    const eventos = c.publicador.doTipo('personagem:atualizado');
    expect(eventos).toHaveLength(1);
    expect(c.publicador.publicados).toHaveLength(1);
    expect(eventos[0]?.mesaId).toBe(MESA_ID);
    // A barra do token lê PV daqui: o payload precisa trazer os dois valores.
    expect(eventos[0]?.dados).toMatchObject({ id: THORIN, pvAtual: 12, pvMax: 30 });
    expect(eventos[0]?.dados.donoNome).toBe('Bruno');
  });

  it('duas atualizações publicam dois eventos — um por escrita, nunca em lote', async () => {
    await c.atualizarPersonagem.executar('mestre', THORIN, { pvAtual: 20 });
    await c.atualizarPersonagem.executar('mestre', THORIN, { pvAtual: 12 });

    const eventos = c.publicador.doTipo('personagem:atualizado');
    expect(eventos.map((e) => e.dados.pvAtual)).toEqual([20, 12]);
  });

  it('o dono também dispara o evento — a barra muda para a mesa toda', async () => {
    const r = await c.atualizarPersonagem.executar('bruno', THORIN, { pvAtual: 5 });

    expect(r.ok).toBe(true);
    expect(c.publicador.doTipo('personagem:atualizado')).toHaveLength(1);
  });

  it('personagem inexistente: nenhum evento', async () => {
    const r = await c.atualizarPersonagem.executar('mestre', 'nao-existe', { pvAtual: 1 });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('nao-encontrado');
    expect(c.publicador.publicados).toHaveLength(0);
  });

  it('quem não é dono nem mestre: nenhum evento', async () => {
    const r = await c.atualizarPersonagem.executar('intruso', THORIN, { pvAtual: 1 });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('nao-autorizado');
    expect(c.publicador.publicados).toHaveLength(0);
  });

  it('mesa encerrada: nenhum evento', async () => {
    await encerrarMesa();

    const r = await c.atualizarPersonagem.executar('mestre', THORIN, { pvAtual: 1 });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('conflito');
    expect(c.publicador.publicados).toHaveLength(0);
  });

  it('validação recusada pelo domínio: nenhum evento e PV intacto', async () => {
    const r = await c.atualizarPersonagem.executar('mestre', THORIN, { pvAtual: 999 });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('validacao');
    expect(c.publicador.publicados).toHaveLength(0);
    expect((await c.personagens.buscarPorId(THORIN))?.pvAtual).toBe(30);
  });
});
