import { beforeEach, describe, expect, it } from 'vitest';
import { dadosIniciaisDaFicha, type Atributos, type SistemaRpg } from '@rolavinte/shared';
import { Mesa } from '../../dominio/mesas/mesa';
import { Personagem } from '../../dominio/personagens/personagem';
import { Usuario } from '../../dominio/contas/usuario';
import {
  FakeMesaRepository,
  FakePersonagemRepository,
  FakePublicadorEventosMesa,
  FakeUsuarioRepository,
  GeradorIdSequencial,
} from '../../testes/fakes';
import { AtualizarPersonagem } from './atualizar-personagem';
import { CriarPersonagem } from './criar-personagem';
import { DuplicarPersonagem } from './duplicar-personagem';
import { ListarPersonagens } from './listar-personagens';
import { RemoverPersonagem } from './remover-personagem';

const AGORA = new Date('2026-08-09T12:00:00.000Z');
const MESA_ID = '00000000-0000-4000-9000-000000000001';
const THORIN = '00000000-0000-4000-9000-0000000000b1';

const ATRIBUTOS: Atributos = {
  forca: 16,
  destreza: 16,
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
  criar: CriarPersonagem;
  listar: ListarPersonagens;
  atualizar: AtualizarPersonagem;
  remover: RemoverPersonagem;
  duplicar: DuplicarPersonagem;
}

/** Mesa do "mestre" com o jogador "bruno", dono de Thorin (30/30 PV). */
async function montarCenario(sistema: SistemaRpg = 'dnd5e'): Promise<Cenario> {
  const usuarios = new FakeUsuarioRepository();
  const mesas = new FakeMesaRepository(usuarios);
  const personagens = new FakePersonagemRepository(usuarios);
  const publicador = new FakePublicadorEventosMesa();
  const geradorId = new GeradorIdSequencial();

  for (const [id, nome] of [
    ['mestre', 'Mestre'],
    ['bruno', 'Bruno'],
    ['carla', 'Carla'],
    ['intruso', 'Intruso'],
  ] as const) {
    await usuarios.salvar(usuario(id, nome));
  }

  const criada = Mesa.criar({
    id: MESA_ID,
    nome: 'A Maldição de Strahd',
    descricao: '',
    sistema,
    mestreId: 'mestre',
    agora: AGORA,
  });
  if (!criada.ok) throw new Error(criada.erro.mensagem);
  for (const [usuarioId, email, token] of [
    ['bruno', 'bruno@ex.com', 'tok-1'],
    ['carla', 'carla@ex.com', 'tok-2'],
  ] as const) {
    criada.valor.convidar({
      solicitanteId: 'mestre',
      nomeSolicitante: 'Mestre',
      emailConvidado: email,
      conviteId: `convite-${token}`,
      tokenConvite: token,
      agora: AGORA,
    });
    criada.valor.aceitarConvite({ token, usuarioId, emailUsuario: email, agora: AGORA });
  }
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
      anotacoes: 'Machado do pai.',
    },
    sistema,
  );
  if (!thorin.ok) throw new Error(thorin.erro.mensagem);
  await personagens.salvar(thorin.valor);

  return {
    mesas,
    personagens,
    criar: new CriarPersonagem(personagens, mesas, usuarios, geradorId),
    listar: new ListarPersonagens(personagens, mesas),
    atualizar: new AtualizarPersonagem(personagens, mesas, usuarios, publicador),
    remover: new RemoverPersonagem(personagens, mesas),
    duplicar: new DuplicarPersonagem(personagens, mesas, usuarios, geradorId),
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

describe('ficha por sistema no caso de uso (RV-091)', () => {
  it('o DTO carrega o sistema da mesa e a ficha validada', async () => {
    const r = await c.criar.executar('bruno', MESA_ID, {
      nome: 'Balin',
      classe: 'Clérigo',
      nivel: 1,
      pvMax: 8,
      atributos: ATRIBUTOS,
      anotacoes: '',
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.sistema).toBe('dnd5e');
    expect(r.valor.dados).toEqual(dadosIniciaisDaFicha('dnd5e'));
  });

  it('campo fora da definição do sistema é recusado na criação, com validação', async () => {
    const r = await c.criar.executar('bruno', MESA_ID, {
      nome: 'Balin',
      classe: '',
      nivel: 1,
      pvMax: 8,
      atributos: ATRIBUTOS,
      anotacoes: '',
      dados: { mana: 20 },
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('validacao');
    expect(r.erro.mensagem).toContain('mana');
  });

  it('campo fora da definição também é recusado na edição, e nada é gravado', async () => {
    const r = await c.atualizar.executar('bruno', THORIN, { dados: { mana: 20 } });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('validacao');
    expect((await c.personagens.buscarPorId(THORIN))?.dados).toEqual(dadosIniciaisDaFicha('dnd5e'));
  });

  it('a listagem completa o sistema em todas as fichas', async () => {
    const r = await c.listar.executar('bruno', MESA_ID);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.length).toBeGreaterThan(0);
    expect(r.valor.every((p) => p.sistema === 'dnd5e')).toBe(true);
  });

  it('numa mesa genérica a ficha continua sendo a de sempre: `dados` vazio', async () => {
    const generica = await montarCenario('generico');

    const r = await generica.listar.executar('bruno', MESA_ID);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor[0]).toMatchObject({ sistema: 'generico', dados: {}, nome: 'Thorin' });
  });

  it('mesa genérica recusa qualquer campo de sistema', async () => {
    const generica = await montarCenario('generico');

    const r = await generica.atualizar.executar('bruno', THORIN, { dados: { ca: 15 } });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('validacao');
  });

  it('a ficha salva sobrevive à ida e volta pelo repositório', async () => {
    const dados = { ...dadosIniciaisDaFicha('dnd5e'), ca: 18, inspiracao: true };

    await c.atualizar.executar('bruno', THORIN, { dados });
    const r = await c.listar.executar('bruno', MESA_ID);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.find((p) => p.id === THORIN)?.dados).toEqual(dados);
  });
});

describe('RemoverPersonagem (RV-093)', () => {
  it('o dono exclui a própria ficha e ela some da listagem', async () => {
    const r = await c.remover.executar('bruno', THORIN);

    expect(r.ok).toBe(true);
    expect(await c.personagens.buscarPorId(THORIN)).toBeNull();
    const lista = await c.listar.executar('bruno', MESA_ID);
    expect(lista.ok && lista.valor.some((p) => p.id === THORIN)).toBe(false);
  });

  it('o mestre exclui a ficha de qualquer um da mesa', async () => {
    const r = await c.remover.executar('mestre', THORIN);

    expect(r.ok).toBe(true);
    expect(c.personagens.total).toBe(0);
  });

  it('outro jogador da mesa recebe não-autorizado e a ficha continua lá', async () => {
    const r = await c.remover.executar('carla', THORIN);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('nao-autorizado');
    expect(await c.personagens.buscarPorId(THORIN)).not.toBeNull();
  });

  it('quem nem participa da mesa recebe não-autorizado', async () => {
    const r = await c.remover.executar('intruso', THORIN);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('nao-autorizado');
    expect(c.personagens.total).toBe(1);
  });

  it('ficha inexistente devolve não-encontrado', async () => {
    const r = await c.remover.executar('mestre', 'nao-existe');

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('nao-encontrado');
  });

  it('mesa encerrada congela também a exclusão (RV-027)', async () => {
    await encerrarMesa();

    const r = await c.remover.executar('mestre', THORIN);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('conflito');
    expect(c.personagens.total).toBe(1);
  });
});

describe('DuplicarPersonagem (RV-093)', () => {
  it('cria uma cópia com id novo, nome sufixado e PV cheio', async () => {
    await c.atualizar.executar('bruno', THORIN, { pvAtual: 4 });

    const r = await c.duplicar.executar('bruno', THORIN);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.id).not.toBe(THORIN);
    expect(r.valor.nome).toBe('Thorin (cópia)');
    expect(r.valor.pvAtual).toBe(30);
    expect(r.valor.pvMax).toBe(30);
    expect(r.valor.anotacoes).toBe('Machado do pai.');
    expect(c.personagens.total).toBe(2);
  });

  it('a cópia leva a ficha do sistema junto', async () => {
    const dados = { ...dadosIniciaisDaFicha('dnd5e'), ca: 18 };
    await c.atualizar.executar('bruno', THORIN, { dados });

    const r = await c.duplicar.executar('bruno', THORIN);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.dados).toEqual(dados);
    expect(r.valor.sistema).toBe('dnd5e');
  });

  it('o mestre duplica a ficha do jogador, e a cópia continua sendo do jogador', async () => {
    const r = await c.duplicar.executar('mestre', THORIN);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.donoId).toBe('bruno');
    expect(r.valor.donoNome).toBe('Bruno');
  });

  it('outro jogador não duplica ficha alheia', async () => {
    const r = await c.duplicar.executar('carla', THORIN);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('nao-autorizado');
    expect(c.personagens.total).toBe(1);
  });

  it('mesa encerrada congela também a duplicação', async () => {
    await encerrarMesa();

    const r = await c.duplicar.executar('bruno', THORIN);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('conflito');
    expect(c.personagens.total).toBe(1);
  });

  it('duplicar duas vezes gera dois ids distintos', async () => {
    const a = await c.duplicar.executar('bruno', THORIN);
    const b = await c.duplicar.executar('bruno', THORIN);

    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.valor.id).not.toBe(b.valor.id);
    expect(c.personagens.total).toBe(3);
  });
});
