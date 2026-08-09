import { beforeEach, describe, expect, it } from 'vitest';
import {
  criarCenaSchema,
  criarTokenSchema,
  MENSAGEM_TAMANHO_IMAGEM_TOKEN,
  MENSAGEM_TIPO_IMAGEM_TOKEN,
  TAMANHO_MAXIMO_IMAGEM_TOKEN_BYTES,
  type TokenDTO,
} from '@rolavinte/shared';
import { Mesa } from '../../dominio/mesas/mesa';
import { Personagem } from '../../dominio/personagens/personagem';
import { Usuario } from '../../dominio/contas/usuario';
import { MENSAGEM_COR_TOKEN, MENSAGEM_NOME_TOKEN } from '../../dominio/jogo/token';
import {
  FakeArmazenamentoArquivos,
  FakeCenaRepository,
  FakeMesaRepository,
  FakePersonagemRepository,
  FakePublicadorEventosMesa,
  FakeUsuarioRepository,
  GeradorIdSequencial,
} from '../../testes/fakes';
import { CriarCena } from './criar-cena';
import { CriarToken } from './criar-token';
import { MoverToken } from './mover-token';
import { APENAS_MESTRE_EDITA_TOKEN, AtualizarToken } from './atualizar-token';
import { APENAS_MESTRE_DEFINE_ARTE_TOKEN, DefinirImagemToken } from './definir-imagem-token';
import { RemoverToken } from './remover-token';

const AGORA = new Date('2026-08-09T12:00:00.000Z');
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
  personagens: FakePersonagemRepository;
  publicador: FakePublicadorEventosMesa;
  armazenamento: FakeArmazenamentoArquivos;
  criarToken: CriarToken;
  moverToken: MoverToken;
  atualizarToken: AtualizarToken;
  definirImagem: DefinirImagemToken;
  removerToken: RemoverToken;
  cenaId: string;
  outraCenaId: string;
}

/** Mesa do "mestre" com o jogador "bruno" (dono de um personagem) e uma segunda mesa de "outro". */
async function montarCenario(): Promise<Cenario> {
  const usuarios = new FakeUsuarioRepository();
  const mesas = new FakeMesaRepository(usuarios);
  const personagens = new FakePersonagemRepository(usuarios);
  const cenas = new FakeCenaRepository();
  const publicador = new FakePublicadorEventosMesa();
  const armazenamento = new FakeArmazenamentoArquivos();
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

  const thorin = Personagem.criar({
    id: PERSONAGEM_BRUNO,
    mesaId: MESA_ID,
    donoId: 'bruno',
    nome: 'Thorin',
    classe: 'Guerreiro',
    nivel: 3,
    pvMax: 30,
    atributos: ATRIBUTOS,
    anotacoes: '',
  });
  if (!thorin.ok) throw new Error(thorin.erro.mensagem);
  await personagens.salvar(thorin.valor);

  const criarCena = new CriarCena(cenas, mesas, geradorId, publicador);
  const primeira = await criarCena.executar(
    'mestre',
    criarCenaSchema.parse({ mesaId: MESA_ID, nome: 'Cripta' }),
  );
  const segunda = await criarCena.executar(
    'outro',
    criarCenaSchema.parse({ mesaId: OUTRA_MESA_ID, nome: 'Taverna' }),
  );
  if (!primeira.ok || !segunda.ok) throw new Error('falha ao montar as cenas de teste');

  publicador.limpar();

  return {
    cenas,
    mesas,
    personagens,
    publicador,
    armazenamento,
    criarToken: new CriarToken(cenas, mesas, geradorId, publicador),
    moverToken: new MoverToken(cenas, mesas, personagens, publicador),
    atualizarToken: new AtualizarToken(cenas, mesas, publicador),
    definirImagem: new DefinirImagemToken(cenas, mesas, armazenamento, geradorId, publicador),
    // Mesmo armazenamento do upload: neste arquivo `armazenamento` É o bucket
    // de tokens, como o `armazenamentoTokens` do composition root (RV-047).
    removerToken: new RemoverToken(cenas, mesas, publicador, armazenamento),
    cenaId: primeira.valor.id,
    outraCenaId: segunda.valor.id,
  };
}

let c: Cenario;

beforeEach(async () => {
  c = await montarCenario();
});

async function criarToken(
  nome: string,
  opcoes: { cenaId?: string; mestreId?: string; personagemId?: string | null } = {},
): Promise<TokenDTO> {
  const entrada = criarTokenSchema.parse({
    cenaId: opcoes.cenaId ?? c.cenaId,
    nome,
    x: 2,
    y: 3,
    personagemId: opcoes.personagemId ?? null,
  });
  const r = await c.criarToken.executar(opcoes.mestreId ?? 'mestre', entrada);
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

describe('AtualizarToken (RV-040)', () => {
  it('o mestre renomeia e a mesa recebe token:atualizado com o nome novo', async () => {
    const token = await criarToken('Gob1');

    const r = await c.atualizarToken.executar('mestre', token.id, { nome: 'Chefe Goblin' });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.nome).toBe('Chefe Goblin');

    const eventos = c.publicador.doTipo('token:atualizado');
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.mesaId).toBe(MESA_ID);
    expect(eventos[0]?.dados.nome).toBe('Chefe Goblin');

    const persistido = await c.cenas.buscarTokenPorId(token.id);
    expect(persistido?.nome).toBe('Chefe Goblin');
  });

  it('o mestre recolore sem mexer no nome nem na posição', async () => {
    const token = await criarToken('Gob1');

    const r = await c.atualizarToken.executar('mestre', token.id, { cor: '#2ecc71' });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor).toMatchObject({ cor: '#2ecc71', nome: 'Gob1', x: 2, y: 3 });
  });

  it('edição parcial não redefine o campo ausente', async () => {
    const token = await criarToken('Gob1');
    await c.atualizarToken.executar('mestre', token.id, { cor: '#2ecc71' });

    const r = await c.atualizarToken.executar('mestre', token.id, { nome: 'Chefe Goblin' });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.cor).toBe('#2ecc71');
  });

  it('jogador dono do personagem vinculado NÃO renomeia — move, mas não edita', async () => {
    const token = await criarToken('Thorin', { personagemId: PERSONAGEM_BRUNO });

    const r = await c.atualizarToken.executar('bruno', token.id, { nome: 'Thorin, o Bravo' });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('nao-autorizado');
    expect(r.erro.mensagem).toBe(APENAS_MESTRE_EDITA_TOKEN);
    expect((await c.cenas.buscarTokenPorId(token.id))?.nome).toBe('Thorin');
    expect(c.publicador.publicados).toHaveLength(0);
  });

  it('nome inválido devolve validacao com a mensagem do domínio', async () => {
    const token = await criarToken('Gob1');

    const r = await c.atualizarToken.executar('mestre', token.id, { nome: '   ' });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('validacao');
    expect(r.erro.mensagem).toBe(MENSAGEM_NOME_TOKEN);
    expect(c.publicador.publicados).toHaveLength(0);
  });

  it('cor inválida devolve validacao mesmo passando por baixo do Zod', async () => {
    const token = await criarToken('Gob1');

    const r = await c.atualizarToken.executar('mestre', token.id, { cor: 'roxo' });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.mensagem).toBe(MENSAGEM_COR_TOKEN);
  });

  it('mestre de outra mesa não edita o token — nao-autorizado', async () => {
    const token = await criarToken('Gob1');

    const r = await c.atualizarToken.executar('outro', token.id, { nome: 'Meu agora' });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('nao-autorizado');
  });

  it('token inexistente devolve nao-encontrado', async () => {
    const r = await c.atualizarToken.executar('mestre', 'token-fantasma', { nome: 'Nada' });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('nao-encontrado');
  });

  it('mesa encerrada bloqueia a edição com conflito', async () => {
    const token = await criarToken('Gob1');
    await encerrarMesa();

    const r = await c.atualizarToken.executar('mestre', token.id, { nome: 'Chefe Goblin' });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('conflito');
    expect(r.erro.mensagem).toBe('Esta mesa foi encerrada.');
  });
});

describe('MoverToken — autorização inalterada pelo RV-040', () => {
  it('o jogador continua movendo o token do próprio personagem', async () => {
    const token = await criarToken('Thorin', { personagemId: PERSONAGEM_BRUNO });

    const r = await c.moverToken.executar('bruno', { tokenId: token.id, x: 7, y: 9 });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([r.valor.x, r.valor.y]).toEqual([7, 9]);
  });

  it('o jogador continua sem mover token solto de NPC', async () => {
    const token = await criarToken('Gob1');

    const r = await c.moverToken.executar('bruno', { tokenId: token.id, x: 7, y: 9 });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('nao-autorizado');
    expect(r.erro.mensagem).toBe('Apenas o mestre move este token.');
  });
});

describe('DefinirImagemToken (RV-041)', () => {
  const png = () => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  it('grava a arte num caminho gerado pela aplicação e avisa a mesa', async () => {
    const token = await criarToken('Chefe Goblin');

    const r = await c.definirImagem.executar('mestre', token.id, {
      tipo: 'image/png',
      conteudo: png(),
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.imagemUrl).toBeTruthy();
    // A cor continua no DTO: a borda mantém a cor definida mesmo com arte.
    expect(r.valor.cor).toBe('#e74c3c');

    const salvo = c.armazenamento.salvos[0];
    expect(c.armazenamento.salvos).toHaveLength(1);
    expect(salvo?.caminho.startsWith(`tokens/${token.id}/`)).toBe(true);
    expect(salvo?.caminho.endsWith('.png')).toBe(true);
    expect(salvo?.tipo).toBe('image/png');

    const eventos = c.publicador.doTipo('token:atualizado');
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.dados.imagemUrl).toBe(r.valor.imagemUrl);
  });

  it.each([['image/jpeg', 'jpg'] as const, ['image/webp', 'webp'] as const])(
    'deriva a extensão de %s, ignorando o nome do cliente',
    async (tipo, extensao) => {
      const token = await criarToken('Chefe Goblin');

      const r = await c.definirImagem.executar('mestre', token.id, { tipo, conteudo: png() });

      expect(r.ok).toBe(true);
      expect(c.armazenamento.salvos[0]?.caminho.endsWith(`.${extensao}`)).toBe(true);
    },
  );

  it.each(['application/pdf', 'image/gif', 'text/html', ''])(
    'recusa o tipo %s sem gravar nada',
    async (tipo) => {
      const token = await criarToken('Chefe Goblin');

      const r = await c.definirImagem.executar('mestre', token.id, { tipo, conteudo: png() });

      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.erro.tipo).toBe('validacao');
      expect(r.erro.mensagem).toBe(MENSAGEM_TIPO_IMAGEM_TOKEN);
      expect(c.armazenamento.salvos).toHaveLength(0);
      expect(c.publicador.publicados).toHaveLength(0);
    },
  );

  it('recusa arquivo acima do limite sem gravar nada', async () => {
    const token = await criarToken('Chefe Goblin');

    const r = await c.definirImagem.executar('mestre', token.id, {
      tipo: 'image/png',
      conteudo: new Uint8Array(TAMANHO_MAXIMO_IMAGEM_TOKEN_BYTES + 1),
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.mensagem).toBe(MENSAGEM_TAMANHO_IMAGEM_TOKEN);
    expect(c.armazenamento.salvos).toHaveLength(0);
  });

  it('recusa arquivo vazio', async () => {
    const token = await criarToken('Chefe Goblin');

    const r = await c.definirImagem.executar('mestre', token.id, {
      tipo: 'image/png',
      conteudo: new Uint8Array(0),
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.mensagem).toBe('A imagem enviada está vazia.');
    expect(c.armazenamento.salvos).toHaveLength(0);
  });

  it('trocar a arte apaga a anterior e deixa um arquivo só', async () => {
    const token = await criarToken('Chefe Goblin');
    const primeira = await c.definirImagem.executar('mestre', token.id, {
      tipo: 'image/png',
      conteudo: png(),
    });
    if (!primeira.ok) throw new Error(primeira.erro.mensagem);
    const caminhoAntigo = c.armazenamento.salvos[0]?.caminho ?? '';

    const segunda = await c.definirImagem.executar('mestre', token.id, {
      tipo: 'image/webp',
      conteudo: png(),
    });

    expect(segunda.ok).toBe(true);
    if (!segunda.ok) return;
    expect(segunda.valor.imagemUrl).not.toBe(primeira.valor.imagemUrl);
    expect(c.armazenamento.salvos).toHaveLength(1);
    expect(c.armazenamento.caminhosRemovidos).toEqual([caminhoAntigo]);
  });

  it('falha ao apagar a arte antiga não derruba a troca', async () => {
    const token = await criarToken('Chefe Goblin');
    await c.definirImagem.executar('mestre', token.id, { tipo: 'image/png', conteudo: png() });
    c.armazenamento.falharAoRemover = true;

    const r = await c.definirImagem.executar('mestre', token.id, {
      tipo: 'image/png',
      conteudo: png(),
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await c.cenas.buscarTokenPorId(token.id))?.imagemUrl).toBe(r.valor.imagemUrl);
  });

  it('jogador não sobe arte, nem para o token do próprio personagem', async () => {
    const token = await criarToken('Thorin', { personagemId: PERSONAGEM_BRUNO });

    const r = await c.definirImagem.executar('bruno', token.id, {
      tipo: 'image/png',
      conteudo: png(),
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('nao-autorizado');
    expect(r.erro.mensagem).toBe(APENAS_MESTRE_DEFINE_ARTE_TOKEN);
    expect(c.armazenamento.salvos).toHaveLength(0);
  });

  it('mesa encerrada bloqueia a troca de arte', async () => {
    const token = await criarToken('Chefe Goblin');
    await encerrarMesa();

    const r = await c.definirImagem.executar('mestre', token.id, {
      tipo: 'image/png',
      conteudo: png(),
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('conflito');
    expect(c.armazenamento.salvos).toHaveLength(0);
  });
});

describe('RemoverToken — a arte some do Storage junto com a peça (RV-047)', () => {
  const png = () => new Uint8Array([137, 80, 78, 71]);

  /** Cria o token e sobe uma arte, devolvendo o caminho gravado no bucket. */
  async function tokenComArte(nome = 'Chefe Goblin'): Promise<{ id: string; caminho: string }> {
    const token = await criarToken(nome);
    const r = await c.definirImagem.executar('mestre', token.id, {
      tipo: 'image/png',
      conteudo: png(),
    });
    if (!r.ok) throw new Error(r.erro.mensagem);
    const caminho = c.armazenamento.salvos.at(-1)?.caminho ?? '';
    c.publicador.limpar();
    return { id: token.id, caminho };
  }

  it('apaga o arquivo da arte e avisa a mesa', async () => {
    const { id, caminho } = await tokenComArte();

    const r = await c.removerToken.executar('mestre', id);

    expect(r.ok).toBe(true);
    expect(await c.cenas.buscarTokenPorId(id)).toBeNull();
    expect(c.armazenamento.caminhosRemovidos).toEqual([caminho]);
    expect(c.armazenamento.contem(caminho)).toBe(false);
    expect(c.armazenamento.salvos).toHaveLength(0);
    expect(c.publicador.doTipo('token:removido').map((e) => e.dados.tokenId)).toEqual([id]);
  });

  it('token sem arte não chama o armazenamento nenhuma vez', async () => {
    const token = await criarToken('Gob1');

    const r = await c.removerToken.executar('mestre', token.id);

    expect(r.ok).toBe(true);
    expect(c.armazenamento.caminhosRemovidos).toEqual([]);
  });

  it('remove só a arte da peça excluída, não a das vizinhas', async () => {
    const alvo = await tokenComArte('Chefe Goblin');
    const vizinho = await tokenComArte('Goblin Arqueiro');

    const r = await c.removerToken.executar('mestre', alvo.id);

    expect(r.ok).toBe(true);
    expect(c.armazenamento.caminhosRemovidos).toEqual([alvo.caminho]);
    expect(c.armazenamento.contem(vizinho.caminho)).toBe(true);
  });

  it('Storage indisponível não impede a exclusão nem o broadcast', async () => {
    const { id } = await tokenComArte();
    c.armazenamento.falharAoRemover = true;

    const r = await c.removerToken.executar('mestre', id);

    // Best-effort: o registro já saiu do banco, e o arquivo teimoso é lixo,
    // não motivo para desfazer uma exclusão pedida pelo mestre.
    expect(r.ok).toBe(true);
    expect(await c.cenas.buscarTokenPorId(id)).toBeNull();
    expect(c.publicador.doTipo('token:removido')).toHaveLength(1);
  });

  it('jogador dono do personagem vinculado não remove — 403 e nada sai do Storage', async () => {
    const token = await criarToken('Thorin', { personagemId: PERSONAGEM_BRUNO });
    const arte = await c.definirImagem.executar('mestre', token.id, {
      tipo: 'image/png',
      conteudo: png(),
    });
    if (!arte.ok) throw new Error(arte.erro.mensagem);
    const caminho = c.armazenamento.salvos[0]?.caminho ?? '';
    c.publicador.limpar();

    const r = await c.removerToken.executar('bruno', token.id);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('nao-autorizado');
    expect(r.erro.mensagem).toBe('Apenas o mestre remove tokens.');
    expect(await c.cenas.buscarTokenPorId(token.id)).not.toBeNull();
    expect(c.armazenamento.caminhosRemovidos).toEqual([]);
    expect(c.armazenamento.contem(caminho)).toBe(true);
    expect(c.publicador.publicados).toHaveLength(0);
  });

  it('mesa encerrada bloqueia a remoção e preserva o arquivo', async () => {
    const { id, caminho } = await tokenComArte();
    await encerrarMesa();

    const r = await c.removerToken.executar('mestre', id);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('conflito');
    expect(c.armazenamento.contem(caminho)).toBe(true);
  });

  it('token inexistente devolve nao-encontrado sem tocar no armazenamento', async () => {
    const r = await c.removerToken.executar('mestre', 'token-fantasma');

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('nao-encontrado');
    expect(c.armazenamento.caminhosRemovidos).toEqual([]);
  });
});

describe('Token continua sem pontos de vida (RV-042)', () => {
  it('o DTO do token não carrega PV — a barra lê a ficha pelo personagemId', async () => {
    const token = await criarToken('Thorin', { personagemId: PERSONAGEM_BRUNO });

    expect(token.personagemId).toBe(PERSONAGEM_BRUNO);
    expect(Object.keys(token).sort()).toEqual([
      'cenaId',
      'cor',
      'id',
      'imagemUrl',
      'nome',
      'personagemId',
      'x',
      'y',
    ]);
  });
});
