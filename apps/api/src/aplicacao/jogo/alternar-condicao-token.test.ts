import { beforeEach, describe, expect, it } from 'vitest';
import {
  CONDICAO_INCONSCIENTE,
  CONDICOES_DISPONIVEIS,
  criarCenaSchema,
  criarTokenSchema,
  MENSAGEM_CONDICAO_DESCONHECIDA,
  type TokenDTO,
} from '@rolavinte/shared';
import { Mesa } from '../../dominio/mesas/mesa';
import { Personagem } from '../../dominio/personagens/personagem';
import { Usuario } from '../../dominio/contas/usuario';
import {
  FakeCenaRepository,
  FakeMesaRepository,
  FakePersonagemRepository,
  FakePublicadorEventosMesa,
  FakeUsuarioRepository,
  GeradorIdSequencial,
} from '../../testes/fakes';
import { CriarCena } from './criar-cena';
import { CriarToken } from './criar-token';
import { carregarTokenParaEscritaDoMestre } from './acesso-token';
import {
  APENAS_MESTRE_MARCA_CONDICAO,
  AlternarCondicaoToken,
  marcarCondicaoNoToken,
} from './alternar-condicao-token';

const AGORA = new Date('2026-08-10T12:00:00.000Z');
const MESA_ID = '00000000-0000-4000-9000-000000000001';
const OUTRA_MESA_ID = '00000000-0000-4000-9000-000000000002';
const PERSONAGEM_BRUNO = '00000000-0000-4000-9000-0000000000b1';

const ATRIBUTOS = {
  forca: 10,
  destreza: 10,
  constituicao: 10,
  inteligencia: 10,
  sabedoria: 10,
  carisma: 10,
};

function usuario(id: string, nome: string): Usuario {
  const r = Usuario.criar({ id, nome, email: `${id}@ex.com`, senhaHash: 'hash', agora: AGORA });
  if (!r.ok) throw new Error(r.erro.mensagem);
  return r.valor;
}

function mesaComJogador(mesaId: string, mestreId: string, jogadorId: string | null): Mesa {
  const criada = Mesa.criar({
    id: mesaId,
    nome: 'A Maldição de Strahd',
    descricao: '',
    sistema: 'dnd5e',
    mestreId,
    agora: AGORA,
  });
  if (!criada.ok) throw new Error(criada.erro.mensagem);
  if (jogadorId) {
    criada.valor.convidar({
      solicitanteId: mestreId,
      nomeSolicitante: 'Mestre',
      emailConvidado: `${jogadorId}@ex.com`,
      conviteId: `convite-${mesaId}`,
      tokenConvite: `tok-${mesaId}`,
      agora: AGORA,
    });
    criada.valor.aceitarConvite({
      token: `tok-${mesaId}`,
      usuarioId: jogadorId,
      emailUsuario: `${jogadorId}@ex.com`,
      agora: AGORA,
    });
  }
  return criada.valor;
}

interface Cenario {
  cenas: FakeCenaRepository;
  mesas: FakeMesaRepository;
  publicador: FakePublicadorEventosMesa;
  criarToken: CriarToken;
  alternar: AlternarCondicaoToken;
  cenaId: string;
}

async function montarCenario(): Promise<Cenario> {
  const usuarios = new FakeUsuarioRepository();
  const mesas = new FakeMesaRepository(usuarios);
  const personagens = new FakePersonagemRepository(usuarios);
  const cenas = new FakeCenaRepository();
  const publicador = new FakePublicadorEventosMesa();
  const geradorId = new GeradorIdSequencial();

  for (const [id, nome] of [
    ['mestre', 'Mestre'],
    ['bruno', 'Bruno'],
    ['outro', 'Outro Mestre'],
  ] as const) {
    await usuarios.salvar(usuario(id, nome));
  }
  await mesas.salvar(mesaComJogador(MESA_ID, 'mestre', 'bruno'));
  await mesas.salvar(mesaComJogador(OUTRA_MESA_ID, 'outro', null));

  const thorin = Personagem.criar(
    {
      id: PERSONAGEM_BRUNO,
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

  const criarCena = new CriarCena(cenas, mesas, geradorId, publicador);
  const cena = await criarCena.executar(
    'mestre',
    criarCenaSchema.parse({ mesaId: MESA_ID, nome: 'Cripta' }),
  );
  if (!cena.ok) throw new Error('falha ao montar a cena de teste');
  publicador.limpar();

  return {
    cenas,
    mesas,
    publicador,
    criarToken: new CriarToken(cenas, mesas, geradorId, publicador),
    alternar: new AlternarCondicaoToken(cenas, mesas, publicador),
    cenaId: cena.valor.id,
  };
}

let c: Cenario;

beforeEach(async () => {
  c = await montarCenario();
});

async function criarToken(
  nome: string,
  opcoes: { personagemId?: string | null } = {},
): Promise<TokenDTO> {
  const r = await c.criarToken.executar(
    'mestre',
    criarTokenSchema.parse({
      cenaId: c.cenaId,
      nome,
      x: 2,
      y: 3,
      personagemId: opcoes.personagemId ?? null,
    }),
  );
  if (!r.ok) throw new Error(r.erro.mensagem);
  c.publicador.limpar();
  return r.valor;
}

async function encerrarMesa(): Promise<void> {
  const mesa = await c.mesas.buscarPorId(MESA_ID);
  if (!mesa) throw new Error('mesa de teste ausente');
  const r = mesa.encerrar('mestre', AGORA);
  if (!r.ok) throw new Error(r.erro.mensagem);
  await c.mesas.salvar(mesa);
}

/** Condições persistidas — releitura pelo repositório, não o DTO devolvido. */
async function condicoesPersistidas(tokenId: string): Promise<readonly string[]> {
  const token = await c.cenas.buscarTokenPorId(tokenId);
  if (!token) throw new Error('token ausente no repositório');
  return token.condicoes;
}

describe('AlternarCondicaoToken (RV-064)', () => {
  it('o mestre marca e a mesa recebe token:atualizado com a condição', async () => {
    const token = await criarToken('Gob1');

    const r = await c.alternar.executar('mestre', token.id, {
      condicao: 'envenenado',
      aplicada: true,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.condicoes).toEqual(['envenenado']);

    const eventos = c.publicador.doTipo('token:atualizado');
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.mesaId).toBe(MESA_ID);
    expect(eventos[0]?.dados.condicoes).toEqual(['envenenado']);

    // Ida e volta: o que a rota devolveu é o que o repositório guardou (F12).
    expect(await condicoesPersistidas(token.id)).toEqual(['envenenado']);
  });

  it('marcar "caido" duas vezes deixa a condição uma única vez, e persistida uma vez', async () => {
    const token = await criarToken('Gob1');

    await c.alternar.executar('mestre', token.id, { condicao: 'caido', aplicada: true });
    const segunda = await c.alternar.executar('mestre', token.id, {
      condicao: 'caido',
      aplicada: true,
    });

    expect(segunda.ok).toBe(true);
    if (!segunda.ok) return;
    expect(segunda.valor.condicoes).toEqual(['caido']);
    expect(await condicoesPersistidas(token.id)).toEqual(['caido']);
  });

  it('desmarca a condição e avisa a mesa de novo', async () => {
    const token = await criarToken('Gob1');
    await c.alternar.executar('mestre', token.id, { condicao: 'caido', aplicada: true });
    await c.alternar.executar('mestre', token.id, { condicao: 'envenenado', aplicada: true });
    c.publicador.limpar();

    const r = await c.alternar.executar('mestre', token.id, {
      condicao: 'caido',
      aplicada: false,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.condicoes).toEqual(['envenenado']);
    expect(c.publicador.doTipo('token:atualizado')).toHaveLength(1);
    expect(await condicoesPersistidas(token.id)).toEqual(['envenenado']);
  });

  it('desmarcar o que não está marcado é 200 sem efeito', async () => {
    const token = await criarToken('Gob1');

    const r = await c.alternar.executar('mestre', token.id, {
      condicao: 'cego',
      aplicada: false,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.condicoes).toEqual([]);
  });

  it('condição desconhecida é recusada com validacao, sem persistir nem publicar', async () => {
    const token = await criarToken('Gob1');

    // Passa por baixo do Zod de propósito: a proteção não pode morar só na borda.
    const r = await c.alternar.executar('mestre', token.id, {
      condicao: 'banana' as never,
      aplicada: true,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('validacao');
    expect(r.erro.mensagem).toBe(MENSAGEM_CONDICAO_DESCONHECIDA);
    expect(await condicoesPersistidas(token.id)).toEqual([]);
    expect(c.publicador.publicados).toHaveLength(0);
  });

  it('as condições não se atropelam: marcar uma não apaga a outra', async () => {
    const token = await criarToken('Gob1');

    await c.alternar.executar('mestre', token.id, { condicao: 'envenenado', aplicada: true });
    await c.alternar.executar('mestre', token.id, { condicao: 'atordoado', aplicada: true });
    const r = await c.alternar.executar('mestre', token.id, {
      condicao: 'caido',
      aplicada: true,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Ordem do catálogo, não a de chegada.
    expect(r.valor.condicoes).toEqual(['atordoado', 'caido', 'envenenado']);
  });

  it('o jogador dono do personagem vinculado NÃO marca condição — 403', async () => {
    const token = await criarToken('Thorin', { personagemId: PERSONAGEM_BRUNO });

    const r = await c.alternar.executar('bruno', token.id, {
      condicao: 'caido',
      aplicada: true,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('nao-autorizado');
    expect(r.erro.mensagem).toBe(APENAS_MESTRE_MARCA_CONDICAO);
    expect(await condicoesPersistidas(token.id)).toEqual([]);
    expect(c.publicador.publicados).toHaveLength(0);
  });

  it('mestre de outra mesa não marca condição na peça alheia', async () => {
    const token = await criarToken('Gob1');

    const r = await c.alternar.executar('outro', token.id, {
      condicao: 'caido',
      aplicada: true,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('nao-autorizado');
  });

  it('token inexistente devolve nao-encontrado', async () => {
    const r = await c.alternar.executar('mestre', 'token-fantasma', {
      condicao: 'caido',
      aplicada: true,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('nao-encontrado');
  });

  it('mesa encerrada bloqueia a marcação com conflito', async () => {
    const token = await criarToken('Gob1');
    await encerrarMesa();

    const r = await c.alternar.executar('mestre', token.id, {
      condicao: 'caido',
      aplicada: true,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('conflito');
    expect(r.erro.mensagem).toBe('Esta mesa foi encerrada.');
    expect(await condicoesPersistidas(token.id)).toEqual([]);
  });

  it('toda condição do catálogo passa pelo caso de uso — extensão por acréscimo', async () => {
    const token = await criarToken('Gob1');

    for (const chave of CONDICOES_DISPONIVEIS) {
      const r = await c.alternar.executar('mestre', token.id, { condicao: chave, aplicada: true });
      expect(r.ok, `condição "${chave}" recusada pelo caso de uso`).toBe(true);
    }

    expect(await condicoesPersistidas(token.id)).toEqual([...CONDICOES_DISPONIVEIS]);
  });
});

/**
 * O ponto de reuso que o RV-065 vai chamar (aplicar "inconsciente" ao zerar o
 * PV). O teste percorre exatamente a sequência documentada na função — carregar
 * com a guarda do mestre, marcar — para que ela não seja só uma promessa em
 * comentário.
 */
describe('marcarCondicaoNoToken — reuso pelo painel de combate (RV-065)', () => {
  it('aplica CONDICAO_INCONSCIENTE, persiste e publica sem duplicar regra', async () => {
    const token = await criarToken('Thorin', { personagemId: PERSONAGEM_BRUNO });

    const acesso = await carregarTokenParaEscritaDoMestre(
      c.cenas,
      c.mesas,
      'mestre',
      token.id,
      'Apenas o mestre aplica dano.',
    );
    expect(acesso.ok).toBe(true);
    if (!acesso.ok) return;

    const r = await marcarCondicaoNoToken(
      c.cenas,
      c.publicador,
      acesso.valor.mesa.id,
      acesso.valor.token,
      { condicao: CONDICAO_INCONSCIENTE, aplicada: true },
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.condicoes).toEqual(['inconsciente']);
    expect(await condicoesPersistidas(token.id)).toEqual(['inconsciente']);
    // O ícone aparece para a mesa sem F5 — é o esquecimento mais provável de
    // quem reimplementasse isto no caso de uso de dano.
    expect(c.publicador.doTipo('token:atualizado')).toHaveLength(1);
  });

  it('zerar o PV duas vezes não empilha "inconsciente"', async () => {
    const token = await criarToken('Thorin', { personagemId: PERSONAGEM_BRUNO });

    for (let i = 0; i < 2; i += 1) {
      const acesso = await carregarTokenParaEscritaDoMestre(
        c.cenas,
        c.mesas,
        'mestre',
        token.id,
        'Apenas o mestre aplica dano.',
      );
      if (!acesso.ok) throw new Error(acesso.erro.mensagem);
      const r = await marcarCondicaoNoToken(
        c.cenas,
        c.publicador,
        acesso.valor.mesa.id,
        acesso.valor.token,
        { condicao: CONDICAO_INCONSCIENTE, aplicada: true },
      );
      expect(r.ok).toBe(true);
    }

    expect(await condicoesPersistidas(token.id)).toEqual(['inconsciente']);
  });
});
