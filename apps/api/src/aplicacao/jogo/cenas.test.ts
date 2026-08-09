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
import { AtualizarCena } from './atualizar-cena';
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
    geradorId,
    criarCena: new CriarCena(cenas, mesas, geradorId, publicador),
    listarCenas: new ListarCenas(cenas, mesas),
    atualizarCena: new AtualizarCena(cenas, mesas, publicador),
    removerCena: new RemoverCena(cenas, mesas, armazenamento),
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
