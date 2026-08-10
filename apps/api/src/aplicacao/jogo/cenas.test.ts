import { beforeEach, describe, expect, it } from 'vitest';
import {
  criarCenaSchema,
  MENSAGEM_TAMANHO_CELULA,
  MENSAGEM_TAMANHO_IMAGEM_FUNDO,
  MENSAGEM_TIPO_IMAGEM_FUNDO,
  TAMANHO_MAXIMO_IMAGEM_FUNDO_BYTES,
  type CenaDTO,
} from '@rolavinte/shared';
import { Mesa } from '../../dominio/mesas/mesa';
import { Token } from '../../dominio/jogo/token';
import { Usuario } from '../../dominio/contas/usuario';
import {
  FakeArmazenamentoArquivos,
  FakeCenaRepository,
  FakeMesaRepository,
  FakePublicadorEventosMesa,
  FakeUsuarioRepository,
  GeradorIdSequencial,
} from '../../testes/fakes';
import { AtivarCena } from './ativar-cena';
import { AtualizarCena, mensagemTokensForaDoGrid } from './atualizar-cena';
import { CriarCena } from './criar-cena';
import { DefinirImagemFundoCena } from './definir-imagem-fundo-cena';
import { APENAS_MESTRE_LISTA_CENAS, ListarCenas } from './listar-cenas';
import { CENA_ATIVA_NAO_EXCLUI, RemoverCena, UNICA_CENA_DA_MESA } from './remover-cena';

const AGORA = new Date('2026-08-09T12:00:00.000Z');
const MESA_ID = '00000000-0000-4000-9000-000000000001';
const OUTRA_MESA_ID = '00000000-0000-4000-9000-000000000002';

function usuario(id: string, nome: string): Usuario {
  const r = Usuario.criar({ id, nome, email: `${id}@ex.com`, senhaHash: 'hash', agora: AGORA });
  if (!r.ok) throw new Error(r.erro.mensagem);
  return r.valor;
}

interface Cenario {
  cenas: FakeCenaRepository;
  mesas: FakeMesaRepository;
  usuarios: FakeUsuarioRepository;
  publicador: FakePublicadorEventosMesa;
  armazenamento: FakeArmazenamentoArquivos;
  /** Bucket das artes de token (RV-047) — separado do de mapas, como no main.ts. */
  armazenamentoTokens: FakeArmazenamentoArquivos;
  geradorId: GeradorIdSequencial;
  criarCena: CriarCena;
  listarCenas: ListarCenas;
  atualizarCena: AtualizarCena;
  removerCena: RemoverCena;
  ativarCena: AtivarCena;
  definirFundo: DefinirImagemFundoCena;
}

/** Mesa com o mestre "mestre" e o jogador "bruno"; e uma segunda mesa de "outro". */
async function montarCenario(): Promise<Cenario> {
  const usuarios = new FakeUsuarioRepository();
  const mesas = new FakeMesaRepository(usuarios);
  const cenas = new FakeCenaRepository();
  const publicador = new FakePublicadorEventosMesa();
  const armazenamento = new FakeArmazenamentoArquivos();
  const armazenamentoTokens = new FakeArmazenamentoArquivos();
  const geradorId = new GeradorIdSequencial();

  for (const [id, nome] of [
    ['mestre', 'Mestre'],
    ['bruno', 'Bruno'],
    ['outro', 'Outro Mestre'],
  ]) {
    await usuarios.salvar(usuario(id ?? '', nome ?? ''));
  }

  await mesas.salvar(mesaComJogador(MESA_ID, 'mestre', 'bruno'));
  await mesas.salvar(mesaComJogador(OUTRA_MESA_ID, 'outro', null));

  return {
    cenas,
    mesas,
    usuarios,
    publicador,
    armazenamento,
    armazenamentoTokens,
    geradorId,
    criarCena: new CriarCena(cenas, mesas, geradorId, publicador),
    listarCenas: new ListarCenas(cenas, mesas),
    atualizarCena: new AtualizarCena(cenas, mesas, publicador),
    removerCena: new RemoverCena(cenas, mesas, armazenamento, armazenamentoTokens),
    ativarCena: new AtivarCena(cenas, mesas, publicador),
    definirFundo: new DefinirImagemFundoCena(cenas, mesas, armazenamento, geradorId, publicador),
  };
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

let c: Cenario;

beforeEach(async () => {
  c = await montarCenario();
});

/** Cria a cena pelo caso de uso, com os defaults do contrato Zod aplicados. */
async function criar(nome: string, mesaId = MESA_ID, mestreId = 'mestre'): Promise<CenaDTO> {
  const entrada = criarCenaSchema.parse({ mesaId, nome });
  const r = await c.criarCena.executar(mestreId, entrada);
  if (!r.ok) throw new Error(r.erro.mensagem);
  return r.valor;
}

async function encerrarMesa(): Promise<void> {
  const mesa = await c.mesas.buscarPorId(MESA_ID);
  if (!mesa) throw new Error('mesa de teste ausente');
  const r = mesa.encerrar('mestre', AGORA);
  if (!r.ok) throw new Error(r.erro.mensagem);
  await c.mesas.salvar(mesa);
}

describe('ListarCenas', () => {
  it('devolve as cenas da mesa com apenas a última marcada como ativa', async () => {
    await criar('Taverna');
    await criar('Cripta');

    const r = await c.listarCenas.executar('mestre', MESA_ID);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.map((cena) => cena.nome)).toEqual(['Taverna', 'Cripta']);
    expect(r.valor.filter((cena) => cena.ativa).map((cena) => cena.nome)).toEqual(['Cripta']);
  });

  it('nega a lista ao jogador — ele só enxerga a cena ativa', async () => {
    await criar('Cripta');

    const r = await c.listarCenas.executar('bruno', MESA_ID);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('nao-autorizado');
    expect(r.erro.mensagem).toBe(APENAS_MESTRE_LISTA_CENAS);
  });

  it('continua listando depois de a mesa ser encerrada (leitura é liberada)', async () => {
    await criar('Cripta');
    await encerrarMesa();

    const r = await c.listarCenas.executar('mestre', MESA_ID);

    expect(r.ok).toBe(true);
  });
});

describe('AtualizarCena', () => {
  it('ajusta a célula ao mapa e avisa a mesa quando a cena está ativa', async () => {
    const cena = await criar('Cripta');
    c.publicador.limpar();

    const r = await c.atualizarCena.executar('mestre', cena.id, {
      nome: 'Cripta Inferior',
      tamanhoCelula: 64,
      gridVisivel: false,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.tamanhoCelula).toBe(64);
    expect(r.valor.gridVisivel).toBe(false);
    expect(r.valor.nome).toBe('Cripta Inferior');
    expect(c.publicador.doTipo('cena:ativada').map((e) => e.dados.tamanhoCelula)).toEqual([64]);
  });

  it('não avisa a mesa ao editar cena de bastidores', async () => {
    const taverna = await criar('Taverna');
    await criar('Cripta');
    c.publicador.limpar();

    const r = await c.atualizarCena.executar('mestre', taverna.id, { nome: 'Taverna Velha' });

    expect(r.ok).toBe(true);
    expect(c.publicador.doTipo('cena:ativada')).toHaveLength(0);
  });

  it('recusa tamanho de célula fora dos limites', async () => {
    const cena = await criar('Cripta');

    const r = await c.atualizarCena.executar('mestre', cena.id, { tamanhoCelula: 5 });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('validacao');
    expect(r.erro.mensagem).toBe(MENSAGEM_TAMANHO_CELULA);
  });

  it('nega a edição ao jogador', async () => {
    const cena = await criar('Cripta');

    const r = await c.atualizarCena.executar('bruno', cena.id, { nome: 'Cripta do Bruno' });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('nao-autorizado');
    expect(r.erro.mensagem).toBe('Apenas o mestre edita cenas.');
  });

  it('vira conflito depois de a mesa ser encerrada', async () => {
    const cena = await criar('Cripta');
    await encerrarMesa();

    const r = await c.atualizarCena.executar('mestre', cena.id, { nome: 'Cripta' });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('conflito');
    expect(r.erro.mensagem).toBe('Esta mesa foi encerrada.');
  });
});

describe('AtualizarCena — encolher o grid não abandona tokens (RV-036)', () => {
  /** Cena nasce 25x15 pelos defaults do contrato. */
  async function cenaComTokens(...posicoes: readonly { x: number; y: number }[]) {
    const cena = await criar('Cripta');
    let indice = 0;
    for (const posicao of posicoes) {
      indice += 1;
      await c.cenas.salvarToken(
        Token.reconstituir({
          id: `token-${indice}`,
          cenaId: cena.id,
          nome: `Goblin ${indice}`,
          cor: '#e74c3c',
          x: posicao.x,
          y: posicao.y,
          personagemId: null,
          imagemUrl: null,
          imagemCaminho: null,
          condicoes: [],
        }),
      );
    }
    c.publicador.limpar();
    c.cenas.chamadasListarTokensDaCena = 0;
    return cena;
  }

  it('recusa com conflito e não persiste nada quando uma peça ficaria fora', async () => {
    const cena = await cenaComTokens({ x: 20, y: 5 });

    const r = await c.atualizarCena.executar('mestre', cena.id, {
      nome: 'Cripta Apertada',
      larguraGrid: 10,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('conflito');
    expect(r.erro.mensagem).toBe(mensagemTokensForaDoGrid(1));
    // Nem a cena nem o token mudaram: a API não move peça que ninguém mandou mover.
    const persistida = await c.cenas.buscarPorId(cena.id);
    expect([persistida?.larguraGrid, persistida?.alturaGrid, persistida?.nome]).toEqual([
      25,
      15,
      'Cripta',
    ]);
    const token = await c.cenas.buscarTokenPorId('token-1');
    expect([token?.x, token?.y]).toEqual([20, 5]);
    expect(c.publicador.publicados).toHaveLength(0);
  });

  it('a mensagem diz quantas peças estão no caminho', async () => {
    const cena = await cenaComTokens({ x: 20, y: 5 }, { x: 2, y: 12 }, { x: 24, y: 14 });

    const r = await c.atualizarCena.executar('mestre', cena.id, {
      larguraGrid: 10,
      alturaGrid: 10,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.mensagem).toBe(mensagemTokensForaDoGrid(3));
    expect(r.erro.mensagem).toContain('3 peças');
  });

  it('permite encolher quando a área removida está vazia', async () => {
    const cena = await cenaComTokens({ x: 0, y: 0 }, { x: 9, y: 9 });

    const r = await c.atualizarCena.executar('mestre', cena.id, {
      larguraGrid: 10,
      alturaGrid: 10,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([r.valor.larguraGrid, r.valor.alturaGrid]).toEqual([10, 10]);
    // Nenhum token foi tocado pelo redimensionamento.
    const token = await c.cenas.buscarTokenPorId('token-2');
    expect([token?.x, token?.y]).toEqual([9, 9]);
  });

  it('aumentar o grid nunca é barrado e nem consulta os tokens', async () => {
    const cena = await cenaComTokens({ x: 24, y: 14 });

    const r = await c.atualizarCena.executar('mestre', cena.id, {
      larguraGrid: 100,
      alturaGrid: 100,
    });

    expect(r.ok).toBe(true);
    expect(c.cenas.chamadasListarTokensDaCena).toBe(0);
  });

  it('PATCH que não mexe em largura nem altura não lê os tokens', async () => {
    const cena = await cenaComTokens({ x: 20, y: 5 });

    const r = await c.atualizarCena.executar('mestre', cena.id, {
      corGrid: '#ff0000',
      gridVisivel: false,
    });

    expect(r.ok).toBe(true);
    expect(c.cenas.chamadasListarTokensDaCena).toBe(0);
  });

  it('repetir o mesmo tamanho não é redução e passa mesmo com peça na borda', async () => {
    const cena = await cenaComTokens({ x: 24, y: 14 });

    const r = await c.atualizarCena.executar('mestre', cena.id, {
      larguraGrid: 25,
      alturaGrid: 15,
    });

    expect(r.ok).toBe(true);
    expect(c.cenas.chamadasListarTokensDaCena).toBe(0);
  });

  it('encolher um mapa sem nenhuma peça é permitido', async () => {
    const cena = await cenaComTokens();

    const r = await c.atualizarCena.executar('mestre', cena.id, {
      larguraGrid: 5,
      alturaGrid: 5,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([r.valor.larguraGrid, r.valor.alturaGrid]).toEqual([5, 5]);
  });

  it('o jogador não redimensiona — 403 antes de qualquer leitura de tokens', async () => {
    const cena = await cenaComTokens({ x: 20, y: 5 });

    const r = await c.atualizarCena.executar('bruno', cena.id, { larguraGrid: 10 });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('nao-autorizado');
    expect(c.cenas.chamadasListarTokensDaCena).toBe(0);
    expect((await c.cenas.buscarPorId(cena.id))?.larguraGrid).toBe(25);
  });
});

describe('AtivarCena', () => {
  it('mantém exatamente uma cena ativa na mesa', async () => {
    const taverna = await criar('Taverna');
    await criar('Cripta');

    const r = await c.ativarCena.executar('mestre', taverna.id);

    expect(r.ok).toBe(true);
    const daMesa = await c.cenas.listarDaMesa(MESA_ID);
    expect(daMesa.filter((cena) => cena.ativa).map((cena) => cena.nome)).toEqual(['Taverna']);
  });

  it('devolve os tokens da cena ativada e publica cena:ativada', async () => {
    const taverna = await criar('Taverna');
    await c.cenas.salvarToken(
      Token.reconstituir({
        id: 'token-1',
        cenaId: taverna.id,
        nome: 'Goblin',
        cor: '#e74c3c',
        x: 2,
        y: 3,
        personagemId: null,
        imagemUrl: null,
        imagemCaminho: null,
        condicoes: [],
      }),
    );
    await criar('Cripta');
    c.publicador.limpar();

    const r = await c.ativarCena.executar('mestre', taverna.id);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.cena?.nome).toBe('Taverna');
    expect(r.valor.tokens.map((t) => t.nome)).toEqual(['Goblin']);
    expect(c.publicador.doTipo('cena:ativada').map((e) => e.dados.nome)).toEqual(['Taverna']);
  });

  it('nega ativar cena de outra mesa', async () => {
    const daOutraMesa = await criar('Masmorra', OUTRA_MESA_ID, 'outro');

    const r = await c.ativarCena.executar('mestre', daOutraMesa.id);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('nao-autorizado');
  });

  it('devolve não-encontrado para cena inexistente', async () => {
    const r = await c.ativarCena.executar('mestre', '00000000-0000-4000-9000-00000000dead');

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('nao-encontrado');
  });
});

describe('RemoverCena', () => {
  it('recusa excluir a única cena da mesa', async () => {
    const cena = await criar('Cripta');

    const r = await c.removerCena.executar('mestre', cena.id);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('conflito');
    expect(r.erro.mensagem).toBe(UNICA_CENA_DA_MESA);
    expect(await c.cenas.buscarPorId(cena.id)).not.toBeNull();
  });

  it('recusa excluir a cena ativa mesmo havendo outras', async () => {
    await criar('Taverna');
    const cripta = await criar('Cripta');

    const r = await c.removerCena.executar('mestre', cripta.id);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('conflito');
    expect(r.erro.mensagem).toBe(CENA_ATIVA_NAO_EXCLUI);
  });

  it('leva os tokens da cena inativa junto e não toca nos da cena ativa', async () => {
    const taverna = await criar('Taverna');
    for (const indice of [1, 2, 3]) {
      await c.cenas.salvarToken(
        Token.reconstituir({
          id: `taverna-${indice}`,
          cenaId: taverna.id,
          nome: `Aldeão ${indice}`,
          cor: '#c9a227',
          x: indice,
          y: 0,
          personagemId: null,
          imagemUrl: null,
          imagemCaminho: null,
          condicoes: [],
        }),
      );
    }
    const cripta = await criar('Cripta');
    await c.cenas.salvarToken(
      Token.reconstituir({
        id: 'cripta-1',
        cenaId: cripta.id,
        nome: 'Strahd',
        cor: '#8e44ad',
        x: 0,
        y: 0,
        personagemId: null,
        imagemUrl: null,
        imagemCaminho: null,
        condicoes: [],
      }),
    );

    const r = await c.removerCena.executar('mestre', taverna.id);

    expect(r.ok).toBe(true);
    expect(await c.cenas.buscarPorId(taverna.id)).toBeNull();
    expect(await c.cenas.listarTokensDaCena(taverna.id)).toHaveLength(0);
    expect(await c.cenas.listarTokensDaCena(cripta.id)).toHaveLength(1);
  });

  it('apaga o mapa da cena excluída do armazenamento', async () => {
    const taverna = await criar('Taverna');
    await c.definirFundo.executar('mestre', taverna.id, {
      tipo: 'image/png',
      conteudo: new Uint8Array([1, 2, 3]),
    });
    await criar('Cripta');
    const caminho = c.armazenamento.salvos[0]?.caminho ?? '';

    const r = await c.removerCena.executar('mestre', taverna.id);

    expect(r.ok).toBe(true);
    expect(c.armazenamento.caminhosRemovidos).toEqual([caminho]);
  });

  it('nega excluir cena de outra mesa', async () => {
    const daOutraMesa = await criar('Masmorra', OUTRA_MESA_ID, 'outro');

    const r = await c.removerCena.executar('mestre', daOutraMesa.id);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('nao-autorizado');
  });

  it('nega a exclusão ao jogador', async () => {
    await criar('Taverna');
    const cripta = await criar('Cripta');

    const r = await c.removerCena.executar('bruno', cripta.id);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('nao-autorizado');
    expect(r.erro.mensagem).toBe('Apenas o mestre remove cenas.');
  });
});

describe('RemoverCena — as artes dos tokens somem do Storage (RV-047)', () => {
  /**
   * A cascata de FK apaga a linha do token, mas não alcança o bucket: sem esta
   * limpeza, toda arte enviada pelo RV-041 fica órfã para sempre.
   */
  async function tokenComArte(
    cenaId: string,
    id: string,
    caminho: string | null,
  ): Promise<string | null> {
    if (caminho) {
      await c.armazenamentoTokens.salvar(caminho, new Uint8Array([1, 2, 3]), 'image/png');
    }
    await c.cenas.salvarToken(
      Token.reconstituir({
        id,
        cenaId,
        nome: id,
        cor: '#e74c3c',
        x: 0,
        y: 0,
        personagemId: null,
        imagemUrl: caminho ? `https://storage.teste.local/tokens/${caminho}` : null,
        imagemCaminho: caminho,
        condicoes: [],
      }),
    );
    return caminho;
  }

  /** Taverna inativa com 3 tokens (2 com arte) e mapa; Cripta ativa com 1 token com arte. */
  async function duasCenas() {
    const taverna = await criar('Taverna');
    await c.definirFundo.executar('mestre', taverna.id, {
      tipo: 'image/png',
      conteudo: new Uint8Array([1, 2, 3]),
    });
    const mapa = c.armazenamento.salvos[0]?.caminho ?? '';
    const arte1 = await tokenComArte(taverna.id, 'taverna-1', `tokens/taverna-1/a.png`);
    const arte2 = await tokenComArte(taverna.id, 'taverna-2', `tokens/taverna-2/b.webp`);
    await tokenComArte(taverna.id, 'taverna-3', null);

    const cripta = await criar('Cripta');
    const arteDaAtiva = await tokenComArte(cripta.id, 'cripta-1', `tokens/cripta-1/c.png`);

    return { taverna, mapa, arte1, arte2, arteDaAtiva };
  }

  it('apaga o mapa no bucket de mapas e as artes no bucket de tokens', async () => {
    const { taverna, mapa, arte1, arte2, arteDaAtiva } = await duasCenas();

    const r = await c.removerCena.executar('mestre', taverna.id);

    expect(r.ok).toBe(true);
    expect(c.armazenamento.caminhosRemovidos).toEqual([mapa]);
    expect([...c.armazenamentoTokens.caminhosRemovidos].sort()).toEqual([arte1, arte2].sort());
    // A arte da cena que continua ativa não foi tocada.
    expect(c.armazenamentoTokens.contem(arteDaAtiva ?? '')).toBe(true);
    expect(c.armazenamentoTokens.salvos.map((a) => a.caminho)).toEqual([arteDaAtiva]);
  });

  it('não tenta apagar arte de token sem imagem', async () => {
    const taverna = await criar('Taverna');
    await tokenComArte(taverna.id, 'taverna-1', null);
    await tokenComArte(taverna.id, 'taverna-2', null);
    await criar('Cripta');

    const r = await c.removerCena.executar('mestre', taverna.id);

    expect(r.ok).toBe(true);
    expect(c.armazenamentoTokens.caminhosRemovidos).toEqual([]);
  });

  it('Storage indisponível não impede a exclusão da cena', async () => {
    const { taverna } = await duasCenas();
    c.armazenamento.falharAoRemover = true;
    c.armazenamentoTokens.falharAoRemover = true;

    const r = await c.removerCena.executar('mestre', taverna.id);

    expect(r.ok).toBe(true);
    expect(await c.cenas.buscarPorId(taverna.id)).toBeNull();
  });

  it('exclusão recusada não apaga arquivo nenhum', async () => {
    const { arte1, arte2 } = await duasCenas();
    const cripta = await c.cenas.buscarAtivaDaMesa(MESA_ID);

    // A cena ativa é recusada com 409 — nada pode sair do Storage.
    const r = await c.removerCena.executar('mestre', cripta?.id ?? '');

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.mensagem).toBe(CENA_ATIVA_NAO_EXCLUI);
    expect(c.armazenamento.caminhosRemovidos).toEqual([]);
    expect(c.armazenamentoTokens.caminhosRemovidos).toEqual([]);
    expect(c.armazenamentoTokens.contem(arte1 ?? '')).toBe(true);
    expect(c.armazenamentoTokens.contem(arte2 ?? '')).toBe(true);
  });
});

describe('DefinirImagemFundoCena', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

  it('grava o mapa com caminho gerado pela aplicação e devolve a URL no DTO', async () => {
    const cena = await criar('Cripta');
    c.publicador.limpar();

    const r = await c.definirFundo.executar('mestre', cena.id, {
      tipo: 'image/png',
      conteudo: PNG,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const salvo = c.armazenamento.salvos[0];
    expect(salvo?.caminho.startsWith(`cenas/${cena.id}/`)).toBe(true);
    expect(salvo?.caminho.endsWith('.png')).toBe(true);
    expect(salvo?.tipo).toBe('image/png');
    expect(r.valor.imagemFundoUrl).toContain(salvo?.caminho ?? 'inexistente');
    // A cena ativa mudou de aparência: a mesa é avisada.
    expect(c.publicador.doTipo('cena:ativada')).toHaveLength(1);
  });

  it('nunca usa o nome enviado pelo cliente — só o tipo decide a extensão', async () => {
    const cena = await criar('Cripta');

    const r = await c.definirFundo.executar('mestre', cena.id, {
      tipo: 'image/webp',
      conteudo: PNG,
    });

    expect(r.ok).toBe(true);
    const salvo = c.armazenamento.salvos[0];
    expect(salvo?.caminho.endsWith('.webp')).toBe(true);
    expect(salvo?.caminho).not.toContain('..');
  });

  it.each(['application/pdf', 'image/gif', 'text/html', ''])(
    'recusa o tipo %s sem gravar nada no armazenamento',
    async (tipo) => {
      const cena = await criar('Cripta');

      const r = await c.definirFundo.executar('mestre', cena.id, { tipo, conteudo: PNG });

      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.erro.tipo).toBe('validacao');
      expect(r.erro.mensagem).toBe(MENSAGEM_TIPO_IMAGEM_FUNDO);
      expect(c.armazenamento.salvos).toHaveLength(0);
    },
  );

  it('recusa imagem acima de 8 MB sem gravar nada no armazenamento', async () => {
    const cena = await criar('Cripta');

    const r = await c.definirFundo.executar('mestre', cena.id, {
      tipo: 'image/png',
      conteudo: new Uint8Array(TAMANHO_MAXIMO_IMAGEM_FUNDO_BYTES + 1),
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('validacao');
    expect(r.erro.mensagem).toBe(MENSAGEM_TAMANHO_IMAGEM_FUNDO);
    expect(c.armazenamento.salvos).toHaveLength(0);
  });

  it('recusa imagem vazia', async () => {
    const cena = await criar('Cripta');

    const r = await c.definirFundo.executar('mestre', cena.id, {
      tipo: 'image/png',
      conteudo: new Uint8Array(0),
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('validacao');
    expect(c.armazenamento.salvos).toHaveLength(0);
  });

  it('trocar o fundo remove o arquivo anterior e mantém só o novo', async () => {
    const cena = await criar('Cripta');
    const primeiro = await c.definirFundo.executar('mestre', cena.id, {
      tipo: 'image/png',
      conteudo: PNG,
    });
    if (!primeiro.ok) throw new Error(primeiro.erro.mensagem);
    const caminhoAntigo = c.armazenamento.salvos[0]?.caminho ?? '';

    const segundo = await c.definirFundo.executar('mestre', cena.id, {
      tipo: 'image/jpeg',
      conteudo: PNG,
    });

    expect(segundo.ok).toBe(true);
    if (!segundo.ok) return;
    expect(c.armazenamento.caminhosRemovidos).toEqual([caminhoAntigo]);
    expect(c.armazenamento.contem(caminhoAntigo)).toBe(false);
    expect(c.armazenamento.salvos).toHaveLength(1);
    expect(segundo.valor.imagemFundoUrl).not.toBe(primeiro.valor.imagemFundoUrl);
  });

  it('mantém o fundo trocado mesmo se a limpeza do arquivo antigo falhar', async () => {
    const cena = await criar('Cripta');
    await c.definirFundo.executar('mestre', cena.id, { tipo: 'image/png', conteudo: PNG });
    c.armazenamento.falharAoRemover = true;

    const r = await c.definirFundo.executar('mestre', cena.id, {
      tipo: 'image/png',
      conteudo: PNG,
    });

    expect(r.ok).toBe(true);
  });

  it('nega o upload ao jogador', async () => {
    const cena = await criar('Cripta');

    const r = await c.definirFundo.executar('bruno', cena.id, {
      tipo: 'image/png',
      conteudo: PNG,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('nao-autorizado');
    expect(r.erro.mensagem).toBe('Apenas o mestre define o fundo da cena.');
    expect(c.armazenamento.salvos).toHaveLength(0);
  });
});
