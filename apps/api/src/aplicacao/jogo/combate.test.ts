import { beforeEach, describe, expect, it } from 'vitest';
import {
  CONDICAO_INCONSCIENTE,
  criarCenaSchema,
  criarTokenSchema,
  MENSAGEM_PARTICIPANTES_COMBATE,
  type CombateDTO,
} from '@rolavinte/shared';
import { Mesa, MESA_ENCERRADA } from '../../dominio/mesas/mesa';
import { Personagem } from '../../dominio/personagens/personagem';
import { Usuario } from '../../dominio/contas/usuario';
import { COMBATE_ENCERRADO, COMBATE_SEM_PARTICIPANTES } from '../../dominio/jogo/combate';
import { ServicoRolagemDados } from '../../dominio/jogo/servico-rolagem';
import {
  FakeCenaRepository,
  FakeCombateRepository,
  FakeMensagemRepository,
  FakeMesaRepository,
  FakePersonagemRepository,
  FakePublicadorEventosMesa,
  FakeUsuarioRepository,
  GeradorIdSequencial,
  RelogioFixo,
} from '../../testes/fakes';
import { AtualizarPersonagem } from '../personagens/atualizar-personagem';
import { CriarCena } from './criar-cena';
import { CriarToken } from './criar-token';
import { RolarDados } from './rolar-dados';
import { textoAlteracaoPv, textoNovaRodada, type DependenciasAviso } from './aviso-de-combate';
import {
  APENAS_MESTRE_INICIA_COMBATE,
  COMBATE_ATIVO_EXISTE,
  IniciarCombate,
  SEM_CENA_ATIVA,
  mensagemTokensForaDaCena,
} from './iniciar-combate';
import {
  INICIATIVA_DE_TERCEIRO,
  INICIATIVA_INFORMADA_E_DO_MESTRE,
  RolarIniciativa,
  motivoIniciativa,
} from './rolar-iniciativa';
import { APENAS_MESTRE_PASSA_TURNO, PassarTurno } from './passar-turno';
import { APENAS_MESTRE_ENCERRA_COMBATE, EncerrarCombate } from './encerrar-combate';
import { ObterCombate } from './obter-combate';
import { APENAS_MESTRE_APLICA_DANO, AplicarDano, TOKEN_SEM_FICHA } from './aplicar-dano';

/**
 * Casos de uso do combate (RV-060 … RV-065) com os fakes em memória.
 *
 * O que este arquivo mede, e o domínio não: **autorização** (cada operação com o
 * seu 403/409), o reuso do `RolarDados` (um total só, gravado e exibido), o reuso
 * do `AtualizarPersonagem` (nenhum segundo caminho de escrita de PV) e as linhas
 * que vão para o chat.
 *
 * Nada aqui usa mock de framework: se precisasse, a arquitetura teria vazado.
 */

const AGORA = new Date('2026-08-09T12:00:00.000Z');
const MESA_ID = '00000000-0000-4000-9000-000000000001';
const OUTRA_MESA_ID = '00000000-0000-4000-9000-000000000002';
const PERSONAGEM_BRUNO = '00000000-0000-4000-9000-0000000000b1';
const PERSONAGEM_ANA = '00000000-0000-4000-9000-0000000000a1';

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

function mesaComJogadores(mesaId: string, mestreId: string, jogadores: readonly string[]): Mesa {
  const criada = Mesa.criar({
    id: mesaId,
    nome: 'A Maldição de Strahd',
    descricao: '',
    sistema: 'dnd5e',
    mestreId,
    agora: AGORA,
  });
  if (!criada.ok) throw new Error(criada.erro.mensagem);
  for (const jogadorId of jogadores) {
    criada.valor.convidar({
      solicitanteId: mestreId,
      nomeSolicitante: 'Mestre',
      emailConvidado: `${jogadorId}@ex.com`,
      conviteId: `convite-${mesaId}-${jogadorId}`,
      tokenConvite: `tok-${mesaId}-${jogadorId}`,
      agora: AGORA,
    });
    criada.valor.aceitarConvite({
      token: `tok-${mesaId}-${jogadorId}`,
      usuarioId: jogadorId,
      emailUsuario: `${jogadorId}@ex.com`,
      agora: AGORA,
    });
  }
  return criada.valor;
}

function personagem(id: string, donoId: string, nome: string, pvMax: number): Personagem {
  const r = Personagem.criar(
    {
      id,
      mesaId: MESA_ID,
      donoId,
      nome,
      classe: 'Guerreiro',
      nivel: 3,
      pvMax,
      atributos: ATRIBUTOS,
      anotacoes: '',
    },
    'dnd5e',
  );
  if (!r.ok) throw new Error(r.erro.mensagem);
  return r.valor;
}

interface Cenario {
  mesas: FakeMesaRepository;
  cenas: FakeCenaRepository;
  combates: FakeCombateRepository;
  mensagens: FakeMensagemRepository;
  personagens: FakePersonagemRepository;
  publicador: FakePublicadorEventosMesa;
  iniciarCombate: IniciarCombate;
  rolarIniciativa: RolarIniciativa;
  passarTurno: PassarTurno;
  encerrarCombate: EncerrarCombate;
  obterCombate: ObterCombate;
  aplicarDano: AplicarDano;
  cenaId: string;
  outraCenaId: string;
  /** Token de Thorin (ficha do Bruno), token da Ana e um NPC sem ficha. */
  tokenThorin: string;
  tokenAna: string;
  tokenNpc: string;
  /** Token da outra mesa — o forasteiro. */
  tokenForasteiro: string;
}

/**
 * Mesa do "mestre" com os jogadores "bruno" e "ana", uma cena ativa com três
 * tokens (Thorin do Bruno, Sombra da Ana, um NPC sem ficha) e uma segunda mesa,
 * de "outro", com um token que não deveria entrar em combate nenhum daqui.
 *
 * O RNG é fixo no máximo (`0.999`), então `1d20` sai 20 — determinismo exigido
 * pelo card para provar "total registrado = total exibido".
 */
async function montarCenario(): Promise<Cenario> {
  const usuarios = new FakeUsuarioRepository();
  const mesas = new FakeMesaRepository(usuarios);
  const personagens = new FakePersonagemRepository(usuarios);
  const cenas = new FakeCenaRepository();
  const combates = new FakeCombateRepository();
  const mensagens = new FakeMensagemRepository();
  const publicador = new FakePublicadorEventosMesa();
  const geradorId = new GeradorIdSequencial();
  const relogio = new RelogioFixo(AGORA);
  const servicoRolagem = new ServicoRolagemDados(() => 0.999);

  for (const [id, nome] of [
    ['mestre', 'Mestre'],
    ['bruno', 'Bruno'],
    ['ana', 'Ana'],
    ['outro', 'Outro Mestre'],
  ] as const) {
    await usuarios.salvar(usuario(id, nome));
  }
  await mesas.salvar(mesaComJogadores(MESA_ID, 'mestre', ['bruno', 'ana']));
  await mesas.salvar(mesaComJogadores(OUTRA_MESA_ID, 'outro', []));
  await personagens.salvar(personagem(PERSONAGEM_BRUNO, 'bruno', 'Thorin', 30));
  await personagens.salvar(personagem(PERSONAGEM_ANA, 'ana', 'Sombra', 20));

  const criarCena = new CriarCena(cenas, mesas, geradorId, publicador);
  const daMesa = await criarCena.executar(
    'mestre',
    criarCenaSchema.parse({ mesaId: MESA_ID, nome: 'Cripta' }),
  );
  const daOutra = await criarCena.executar(
    'outro',
    criarCenaSchema.parse({ mesaId: OUTRA_MESA_ID, nome: 'Taverna' }),
  );
  if (!daMesa.ok || !daOutra.ok) throw new Error('falha ao montar as cenas de teste');

  const criarToken = new CriarToken(cenas, mesas, geradorId, publicador);
  async function token(
    cenaId: string,
    dono: string,
    nome: string,
    x: number,
    personagemId: string | null,
  ): Promise<string> {
    const criado = await criarToken.executar(
      dono,
      criarTokenSchema.parse({ cenaId, nome, x, y: 0, personagemId }),
    );
    if (!criado.ok) throw new Error(`token de teste inválido: ${criado.erro.mensagem}`);
    return criado.valor.id;
  }

  const tokenThorin = await token(daMesa.valor.id, 'mestre', 'Thorin', 1, PERSONAGEM_BRUNO);
  const tokenAna = await token(daMesa.valor.id, 'mestre', 'Sombra', 2, PERSONAGEM_ANA);
  const tokenNpc = await token(daMesa.valor.id, 'mestre', 'Goblin', 3, null);
  const tokenForasteiro = await token(daOutra.valor.id, 'outro', 'Bêbado', 1, null);

  const rolarDados = new RolarDados(
    mensagens,
    mesas,
    usuarios,
    servicoRolagem,
    geradorId,
    relogio,
    publicador,
  );
  const atualizarPersonagem = new AtualizarPersonagem(personagens, mesas, usuarios, publicador);
  const aviso: DependenciasAviso = { mensagens, geradorId, relogio, publicador };

  publicador.limpar();

  return {
    mesas,
    cenas,
    combates,
    mensagens,
    personagens,
    publicador,
    iniciarCombate: new IniciarCombate(combates, cenas, mesas, geradorId, publicador),
    rolarIniciativa: new RolarIniciativa(
      combates,
      cenas,
      mesas,
      personagens,
      rolarDados,
      publicador,
    ),
    passarTurno: new PassarTurno(combates, mesas, publicador, aviso),
    encerrarCombate: new EncerrarCombate(combates, mesas, publicador),
    obterCombate: new ObterCombate(combates, mesas),
    aplicarDano: new AplicarDano(
      combates,
      cenas,
      mesas,
      personagens,
      atualizarPersonagem,
      publicador,
      aviso,
    ),
    cenaId: daMesa.valor.id,
    outraCenaId: daOutra.valor.id,
    tokenThorin,
    tokenAna,
    tokenNpc,
    tokenForasteiro,
  };
}

let c: Cenario;

beforeEach(async () => {
  c = await montarCenario();
});

/** Inicia o combate com os três tokens da cena e devolve o DTO. */
async function combateDosTres(): Promise<CombateDTO> {
  const iniciado = await c.iniciarCombate.executar('mestre', {
    mesaId: MESA_ID,
    tokenIds: [c.tokenThorin, c.tokenAna, c.tokenNpc],
  });
  if (!iniciado.ok) throw new Error(`falha ao iniciar combate: ${iniciado.erro.mensagem}`);
  c.publicador.limpar();
  return iniciado.valor;
}

/** Conteúdos das mensagens de sistema gravadas, na ordem. */
async function avisosNoChat(): Promise<string[]> {
  const lista = await c.mensagens.listarDaMesa(MESA_ID, 'mestre', { limite: 100, antesDe: null });
  return lista.filter((m) => m.tipo === 'sistema').map((m) => m.conteudo);
}

describe('IniciarCombate (RV-061)', () => {
  it('cria o combate na rodada 1 com os participantes na ordem informada e avisa a mesa', async () => {
    const iniciado = await c.iniciarCombate.executar('mestre', {
      mesaId: MESA_ID,
      tokenIds: [c.tokenThorin, c.tokenAna, c.tokenNpc],
    });

    expect(iniciado.ok).toBe(true);
    if (!iniciado.ok) return;
    expect(iniciado.valor.rodada).toBe(1);
    expect(iniciado.valor.ativo).toBe(true);
    expect(iniciado.valor.cenaId).toBe(c.cenaId);
    expect(iniciado.valor.participantes.map((p) => p.nome)).toEqual(['Thorin', 'Sombra', 'Goblin']);
    expect(iniciado.valor.participantes.every((p) => p.iniciativa === null)).toBe(true);
    expect(iniciado.valor.tokenIdDoTurno).toBe(c.tokenThorin);

    const publicados = c.publicador.doTipo('combate:atualizado');
    expect(publicados).toHaveLength(1);
    expect(publicados[0]?.mesaId).toBe(MESA_ID);
    expect(publicados[0]?.dados.id).toBe(iniciado.valor.id);
  });

  it('jogador recebe 403 e nada é gravado', async () => {
    const recusa = await c.iniciarCombate.executar('bruno', {
      mesaId: MESA_ID,
      tokenIds: [c.tokenThorin],
    });

    expect(recusa.ok).toBe(false);
    if (!recusa.ok) {
      expect(recusa.erro.tipo).toBe('nao-autorizado');
      expect(recusa.erro.mensagem).toBe(APENAS_MESTRE_INICIA_COMBATE);
    }
    expect(c.combates.total).toBe(0);
    expect(c.publicador.publicados).toHaveLength(0);
  });

  it('mesa encerrada congela a abertura de combate, com a mensagem única do agregado', async () => {
    const mesa = await c.mesas.buscarPorId(MESA_ID);
    expect(mesa?.encerrar('mestre', AGORA).ok).toBe(true);
    if (mesa) await c.mesas.salvar(mesa);

    const recusa = await c.iniciarCombate.executar('mestre', {
      mesaId: MESA_ID,
      tokenIds: [c.tokenThorin],
    });

    expect(recusa.ok).toBe(false);
    if (!recusa.ok) {
      expect(recusa.erro.tipo).toBe('conflito');
      expect(recusa.erro.mensagem).toBe(MESA_ENCERRADA);
    }
    expect(c.combates.total).toBe(0);
  });

  it('segundo combate na mesma mesa é conflito enquanto o primeiro está ativo', async () => {
    await combateDosTres();

    const segundo = await c.iniciarCombate.executar('mestre', {
      mesaId: MESA_ID,
      tokenIds: [c.tokenNpc],
    });

    expect(segundo.ok).toBe(false);
    if (!segundo.ok) {
      expect(segundo.erro.tipo).toBe('conflito');
      expect(segundo.erro.mensagem).toBe(COMBATE_ATIVO_EXISTE);
    }
    expect(c.combates.total).toBe(1);
  });

  it('depois de encerrar, um combate novo é aceito', async () => {
    const primeiro = await combateDosTres();
    expect((await c.encerrarCombate.executar('mestre', primeiro.id)).ok).toBe(true);

    const segundo = await c.iniciarCombate.executar('mestre', {
      mesaId: MESA_ID,
      tokenIds: [c.tokenNpc],
    });

    expect(segundo.ok).toBe(true);
    if (segundo.ok) expect(segundo.valor.id).not.toBe(primeiro.id);
    // O encerrado continua no banco: histórico da luta, não exclusão.
    expect(c.combates.total).toBe(2);
  });

  it('token de outra mesa é recusado nomeando o id, e nada é gravado', async () => {
    const recusa = await c.iniciarCombate.executar('mestre', {
      mesaId: MESA_ID,
      tokenIds: [c.tokenThorin, c.tokenForasteiro],
    });

    expect(recusa.ok).toBe(false);
    if (!recusa.ok) {
      expect(recusa.erro.tipo).toBe('validacao');
      // A asserção é a mensagem inteira: um 400 genérico não diria ao mestre qual
      // peça está sobrando na seleção.
      expect(recusa.erro.mensagem).toBe(mensagemTokensForaDaCena([c.tokenForasteiro]));
    }
    expect(c.combates.total).toBe(0);
  });

  it('lista vazia é recusada pelo agregado, com a mesma mensagem do schema', async () => {
    const recusa = await c.iniciarCombate.executar('mestre', { mesaId: MESA_ID, tokenIds: [] });

    expect(recusa.ok).toBe(false);
    if (!recusa.ok) expect(recusa.erro.mensagem).toBe(MENSAGEM_PARTICIPANTES_COMBATE);
  });

  it('sem cena ativa não há onde lutar', async () => {
    await c.cenas.desativarTodasDaMesa(MESA_ID);

    const recusa = await c.iniciarCombate.executar('mestre', {
      mesaId: MESA_ID,
      tokenIds: [c.tokenThorin],
    });

    expect(recusa.ok).toBe(false);
    if (!recusa.ok) {
      expect(recusa.erro.tipo).toBe('validacao');
      expect(recusa.erro.mensagem).toBe(SEM_CENA_ATIVA);
    }
  });
});

describe('RolarIniciativa (RV-061)', () => {
  it('o total gravado na ordem é o mesmo total que foi para o chat', async () => {
    const combate = await combateDosTres();

    const rolada = await c.rolarIniciativa.executar('mestre', combate.id, {
      tokenId: c.tokenThorin,
      expressao: '1d20+3',
      motivo: '',
    });

    expect(rolada.ok).toBe(true);
    if (!rolada.ok) return;
    // RNG fixo em 0.999 → d20 sai 20, então o total é 23.
    expect(rolada.valor.mensagem.rolagem?.total).toBe(23);
    const thorin = rolada.valor.combate.participantes.find((p) => p.tokenId === c.tokenThorin);
    expect(thorin?.iniciativa).toBe(23);
    expect(rolada.valor.mensagem.motivo).toBe(motivoIniciativa('Thorin'));
    expect(rolada.valor.mensagem.tipo).toBe('rolagem');
  });

  it('a ordem passa a ser decrescente pela iniciativa, e o combate é transmitido', async () => {
    const combate = await combateDosTres();
    const rolar = (tokenId: string, expressao: string) =>
      c.rolarIniciativa.executar('mestre', combate.id, { tokenId, expressao, motivo: '' });

    await rolar(c.tokenThorin, '1d20');
    await rolar(c.tokenAna, '1d20+5');
    const ultima = await rolar(c.tokenNpc, '1d4');

    expect(ultima.ok).toBe(true);
    if (!ultima.ok) return;
    expect(ultima.valor.combate.participantes.map((p) => p.iniciativa)).toEqual([25, 20, 4]);
    expect(ultima.valor.combate.participantes.map((p) => p.nome)).toEqual([
      'Sombra',
      'Thorin',
      'Goblin',
    ]);
    // Ninguém agiu ainda, então a vez é de quem lidera a ordem — a Sombra, e não
    // o Thorin, que foi só o primeiro token que o mestre selecionou.
    expect(ultima.valor.combate.tokenIdDoTurno).toBe(c.tokenAna);
    expect(c.publicador.doTipo('combate:atualizado')).toHaveLength(3);
  });

  it('o jogador rola pelo próprio personagem, com a expressão derivada da ficha', async () => {
    const combate = await combateDosTres();

    // Sem `expressao`: é o único caminho que sobrou para o jogador, e é o certo —
    // quem rola é o sistema da mesa a partir da ficha (RV-158).
    const rolada = await c.rolarIniciativa.executar('bruno', combate.id, {
      tokenId: c.tokenThorin,
      motivo: '',
    });

    expect(rolada.ok).toBe(true);
    if (!rolada.ok) return;
    expect(rolada.valor.mensagem.autorNome).toBe('Bruno');
    expect(
      rolada.valor.combate.participantes.find((p) => p.tokenId === c.tokenThorin)?.iniciativa,
    ).toEqual(rolada.valor.mensagem.rolagem?.total);
  });

  /**
   * F4 — a proteção que morava só na interface (RV-066).
   *
   * O painel de combate só oferece o campo de expressão ao mestre, e o caso de uso
   * aceitava de qualquer participante: o dono da peça mandava `1d20+99` pela rota e
   * o número entrava na ordem, com a mesa vendo no chat uma rolagem que ninguém
   * poderia contestar. Vermelho conferido antes do conserto — a rolagem passava e
   * gravava 119.
   */
  it('o jogador NÃO informa a própria iniciativa: 403, sem rolagem e sem número na ordem', async () => {
    const combate = await combateDosTres();

    const recusa = await c.rolarIniciativa.executar('bruno', combate.id, {
      tokenId: c.tokenThorin,
      expressao: '1d20+99',
      motivo: '',
    });

    expect(recusa.ok).toBe(false);
    if (!recusa.ok) {
      expect(recusa.erro.tipo).toBe('nao-autorizado');
      expect(recusa.erro.mensagem).toBe(INICIATIVA_INFORMADA_E_DO_MESTRE);
    }
    // Nada no chat e nada na ordem: a recusa vem antes de `RolarDados`.
    expect(await avisosNoChat()).toEqual([]);
    expect(c.publicador.publicados).toHaveLength(0);
    const lido = await c.obterCombate.executar('bruno', MESA_ID);
    expect(lido.ok).toBe(true);
    if (lido.ok) {
      expect(
        lido.valor.combate?.participantes.find((p) => p.tokenId === c.tokenThorin)?.iniciativa,
      ).toBeNull();
    }
  });

  it('o mestre continua informando a iniciativa de qualquer peça', async () => {
    const combate = await combateDosTres();

    const rolada = await c.rolarIniciativa.executar('mestre', combate.id, {
      tokenId: c.tokenThorin,
      expressao: '1d20+99',
      motivo: '',
    });

    expect(rolada.ok).toBe(true);
    if (rolada.ok) expect(rolada.valor.mensagem.rolagem?.total).toBe(119);
  });

  it('rolar pelo token de outro jogador é 403, e a iniciativa dele não muda', async () => {
    const combate = await combateDosTres();

    const recusa = await c.rolarIniciativa.executar('bruno', combate.id, {
      tokenId: c.tokenAna,
      expressao: '1d20',
      motivo: '',
    });

    expect(recusa.ok).toBe(false);
    if (!recusa.ok) {
      expect(recusa.erro.tipo).toBe('nao-autorizado');
      expect(recusa.erro.mensagem).toBe(INICIATIVA_DE_TERCEIRO);
    }
    const lido = await c.obterCombate.executar('bruno', MESA_ID);
    expect(lido.ok).toBe(true);
    if (lido.ok) {
      expect(
        lido.valor.combate?.participantes.find((p) => p.tokenId === c.tokenAna)?.iniciativa,
      ).toBeNull();
    }
    // Nem mensagem no chat: a recusa vem antes de rolar.
    expect(c.publicador.publicados).toHaveLength(0);
  });

  it('token sem ficha é do mestre: o jogador não rola pelo NPC', async () => {
    const combate = await combateDosTres();

    const recusa = await c.rolarIniciativa.executar('bruno', combate.id, {
      tokenId: c.tokenNpc,
      expressao: '1d20',
      motivo: '',
    });

    expect(recusa.ok).toBe(false);
    if (!recusa.ok) expect(recusa.erro.mensagem).toBe(INICIATIVA_DE_TERCEIRO);
  });

  it('expressão inválida não grava iniciativa nem mensagem', async () => {
    const combate = await combateDosTres();

    const recusa = await c.rolarIniciativa.executar('mestre', combate.id, {
      tokenId: c.tokenThorin,
      expressao: 'banana',
      motivo: '',
    });

    expect(recusa.ok).toBe(false);
    if (!recusa.ok) expect(recusa.erro.tipo).toBe('validacao');
    expect(await avisosNoChat()).toEqual([]);
    expect(c.publicador.publicados).toHaveLength(0);
  });

  it('participante fora do combate é nao-encontrado', async () => {
    const combate = await combateDosTres();
    expect((await c.encerrarCombate.executar('mestre', combate.id)).ok).toBe(true);
    const outro = await c.iniciarCombate.executar('mestre', {
      mesaId: MESA_ID,
      tokenIds: [c.tokenNpc],
    });
    expect(outro.ok).toBe(true);
    if (!outro.ok) return;

    const recusa = await c.rolarIniciativa.executar('mestre', outro.valor.id, {
      tokenId: c.tokenThorin,
      expressao: '1d20',
      motivo: '',
    });

    expect(recusa.ok).toBe(false);
    if (!recusa.ok) expect(recusa.erro.tipo).toBe('nao-encontrado');
  });

  it('combate encerrado recusa ANTES de rolar: nenhum dado vai para o chat', async () => {
    const combate = await combateDosTres();
    expect((await c.encerrarCombate.executar('mestre', combate.id)).ok).toBe(true);
    c.publicador.limpar();

    const recusa = await c.rolarIniciativa.executar('mestre', combate.id, {
      tokenId: c.tokenThorin,
      expressao: '1d20+3',
      motivo: '',
    });

    expect(recusa.ok).toBe(false);
    if (!recusa.ok) {
      expect(recusa.erro.tipo).toBe('conflito');
      expect(recusa.erro.mensagem).toBe(COMBATE_ENCERRADO);
    }
    // A ordem das guardas é o ponto: `definirIniciativa` já recusaria, mas só
    // depois de `RolarDados` ter gravado e transmitido a rolagem. O resultado
    // seria uma linha "Iniciativa — Thorin: 23" no chat de todo mundo, com a
    // requisição respondendo 409 e nenhuma iniciativa registrada — um número que
    // a mesa viu e que a ordem de iniciativa não tem.
    const rolagens = await c.mensagens.listarDaMesa(MESA_ID, 'mestre', {
      limite: 100,
      antesDe: null,
    });
    expect(rolagens.filter((m) => m.tipo === 'rolagem')).toEqual([]);
    expect(c.publicador.publicados).toHaveLength(0);
  });

  it('motivo informado pelo chamador prevalece sobre o rótulo padrão', async () => {
    const combate = await combateDosTres();

    const rolada = await c.rolarIniciativa.executar('mestre', combate.id, {
      tokenId: c.tokenThorin,
      expressao: '1d20',
      motivo: 'Iniciativa por Percepção',
    });

    expect(rolada.ok).toBe(true);
    if (rolada.ok) expect(rolada.valor.mensagem.motivo).toBe('Iniciativa por Percepção');
  });
});

/**
 * F5 da taxonomia, varrida nas **quatro** escritas do combate.
 *
 * `IniciarCombate` tem o seu caso acima; as outras três passam por
 * `carregarCombateParaEscritaDoMestre`, que é o ponto único onde "só o mestre" e
 * "mesa encerrada" vivem juntas. Os testes de 403 provam que o helper está no
 * caminho, mas nenhum deles provava a **segunda** condição que ele cobre — e foi
 * exatamente essa metade que furou nas fichas na v0.3.0, com a UI prometendo
 * "somente leitura para todo mundo".
 *
 * Experimento que mediu estes casos (verificação da sprint): trocar
 * `autorizarEscritaDoMestre` por `ehMestre` cru em
 * `carregarCombateParaEscritaDoMestre` deixa **passar turno** e **encerrar
 * combate** vermelhos. `aplicar dano` continua verde, e isso é informação: o PV
 * só é escrito pelo `AtualizarPersonagem`, que aplica a guarda de participante
 * por conta própria. Ele fica aqui como a rede da combinação que ninguém veria de
 * outra forma — guarda do combate reimplementada **e** um segundo caminho de
 * escrita de PV nascendo neste caso de uso (F5 + F12 juntas).
 */
describe('Mesa encerrada congela todas as escritas do combate (F5)', () => {
  async function encerrarMesa(): Promise<void> {
    const mesa = await c.mesas.buscarPorId(MESA_ID);
    expect(mesa?.encerrar('mestre', AGORA).ok).toBe(true);
    if (mesa) await c.mesas.salvar(mesa);
  }

  it.each([
    ['passar turno', (id: string) => c.passarTurno.executar('mestre', id)],
    ['encerrar combate', (id: string) => c.encerrarCombate.executar('mestre', id)],
    ['aplicar dano', (id: string) => c.aplicarDano.executar('mestre', id, c.tokenThorin, -5)],
  ] as const)(
    '%s numa mesa encerrada é 409, com a mensagem única do agregado',
    async (_nome, escrever) => {
      const combate = await combateDosTres();
      await encerrarMesa();

      const recusa = await escrever(combate.id);

      expect(recusa.ok).toBe(false);
      if (!recusa.ok) {
        expect(recusa.erro.tipo).toBe('conflito');
        expect(recusa.erro.mensagem).toBe(MESA_ENCERRADA);
      }
      expect(c.publicador.publicados).toHaveLength(0);
    },
  );
});

describe('PassarTurno (RV-062)', () => {
  it('avança o turno sem tocar na rodada e transmite o combate', async () => {
    const combate = await combateDosTres();

    const passo = await c.passarTurno.executar('mestre', combate.id);

    expect(passo.ok).toBe(true);
    if (passo.ok) {
      expect(passo.valor.rodada).toBe(1);
      expect(passo.valor.indiceTurno).toBe(1);
      expect(passo.valor.tokenIdDoTurno).toBe(c.tokenAna);
    }
    expect(c.publicador.doTipo('combate:atualizado')).toHaveLength(1);
    expect(await avisosNoChat()).toEqual([]);
  });

  it('a volta ao primeiro vira a rodada e escreve "Rodada 2" no chat, para a sala inteira', async () => {
    const combate = await combateDosTres();

    await c.passarTurno.executar('mestre', combate.id);
    await c.passarTurno.executar('mestre', combate.id);
    const virada = await c.passarTurno.executar('mestre', combate.id);

    expect(virada.ok).toBe(true);
    if (virada.ok) {
      expect(virada.valor.rodada).toBe(2);
      expect(virada.valor.tokenIdDoTurno).toBe(c.tokenThorin);
    }
    expect(await avisosNoChat()).toEqual([textoNovaRodada(2)]);
    // Aviso de sistema é público: vai pela sala da mesa, nunca por entrega privada.
    const publicadas = c.publicador.doTipo('mensagem:nova');
    expect(publicadas).toHaveLength(1);
    expect(publicadas[0]?.dados.tipo).toBe('sistema');
    expect(publicadas[0]?.dados.autorId).toBeNull();
    expect(c.publicador.doTipo('mensagem:privada')).toHaveLength(0);
  });

  it('jogador recebe 403 e o turno não anda', async () => {
    const combate = await combateDosTres();

    const recusa = await c.passarTurno.executar('bruno', combate.id);

    expect(recusa.ok).toBe(false);
    if (!recusa.ok) {
      expect(recusa.erro.tipo).toBe('nao-autorizado');
      expect(recusa.erro.mensagem).toBe(APENAS_MESTRE_PASSA_TURNO);
    }
    const lido = await c.obterCombate.executar('bruno', MESA_ID);
    if (lido.ok) expect(lido.valor.combate?.tokenIdDoTurno).toBe(c.tokenThorin);
    expect(c.publicador.publicados).toHaveLength(0);
  });

  it('combate encerrado recusa com 409 e a mensagem única do agregado', async () => {
    const combate = await combateDosTres();
    expect((await c.encerrarCombate.executar('mestre', combate.id)).ok).toBe(true);
    c.publicador.limpar();

    const recusa = await c.passarTurno.executar('mestre', combate.id);

    expect(recusa.ok).toBe(false);
    if (!recusa.ok) {
      expect(recusa.erro.tipo).toBe('conflito');
      expect(recusa.erro.mensagem).toBe(COMBATE_ENCERRADO);
    }
  });

  it('combate que ficou sem ninguém recusa em vez de quebrar', async () => {
    const iniciado = await c.iniciarCombate.executar('mestre', {
      mesaId: MESA_ID,
      tokenIds: [c.tokenNpc],
    });
    if (!iniciado.ok) throw new Error('falha ao iniciar');
    // A cascata de `token_id` é o caminho real: apagar o token some com o
    // participante. Aqui o mesmo estado é montado removendo do agregado.
    const combate = await c.combates.buscarPorId(iniciado.valor.id);
    expect(combate?.remover(c.tokenNpc).ok).toBe(true);
    if (combate) await c.combates.salvar(combate);

    const recusa = await c.passarTurno.executar('mestre', iniciado.valor.id);

    expect(recusa.ok).toBe(false);
    if (!recusa.ok) {
      expect(recusa.erro.tipo).toBe('conflito');
      expect(recusa.erro.mensagem).toBe(COMBATE_SEM_PARTICIPANTES);
    }
  });

  it('combate inexistente é nao-encontrado', async () => {
    const recusa = await c.passarTurno.executar('mestre', '00000000-0000-4000-8000-00000000ffff');

    expect(recusa.ok).toBe(false);
    if (!recusa.ok) expect(recusa.erro.tipo).toBe('nao-encontrado');
  });
});

describe('EncerrarCombate (RV-062)', () => {
  it('encerra, transmite com ativo=false e a leitura passa a devolver null', async () => {
    const combate = await combateDosTres();

    const encerrado = await c.encerrarCombate.executar('mestre', combate.id);

    expect(encerrado.ok).toBe(true);
    if (encerrado.ok) expect(encerrado.valor.ativo).toBe(false);
    const publicados = c.publicador.doTipo('combate:atualizado');
    expect(publicados).toHaveLength(1);
    // É este `false` que esvazia o painel de todo mundo sem F5.
    expect(publicados[0]?.dados.ativo).toBe(false);

    const lido = await c.obterCombate.executar('bruno', MESA_ID);
    expect(lido.ok).toBe(true);
    if (lido.ok) expect(lido.valor.combate).toBeNull();
  });

  it('jogador recebe 403', async () => {
    const combate = await combateDosTres();

    const recusa = await c.encerrarCombate.executar('ana', combate.id);

    expect(recusa.ok).toBe(false);
    if (!recusa.ok) {
      expect(recusa.erro.tipo).toBe('nao-autorizado');
      expect(recusa.erro.mensagem).toBe(APENAS_MESTRE_ENCERRA_COMBATE);
    }
  });
});

describe('ObterCombate (RV-063)', () => {
  it('todo participante lê a ordem, e ela vem ordenada', async () => {
    const combate = await combateDosTres();
    await c.rolarIniciativa.executar('mestre', combate.id, {
      tokenId: c.tokenAna,
      expressao: '1d20+5',
      motivo: '',
    });

    const lido = await c.obterCombate.executar('ana', MESA_ID);

    expect(lido.ok).toBe(true);
    if (lido.ok) {
      expect(lido.valor.combate?.participantes[0]?.nome).toBe('Sombra');
      expect(lido.valor.combate?.participantes[0]?.iniciativa).toBe(25);
    }
  });

  it('sem combate ativo devolve null, e não 404', async () => {
    const lido = await c.obterCombate.executar('bruno', MESA_ID);

    expect(lido.ok).toBe(true);
    if (lido.ok) expect(lido.valor.combate).toBeNull();
  });

  it('quem não participa da mesa não lê', async () => {
    await combateDosTres();

    const recusa = await c.obterCombate.executar('outro', MESA_ID);

    expect(recusa.ok).toBe(false);
    if (!recusa.ok) expect(recusa.erro.tipo).toBe('nao-autorizado');
  });

  it('mesa encerrada continua legível: o histórico da última luta não desaparece', async () => {
    await combateDosTres();
    const mesa = await c.mesas.buscarPorId(MESA_ID);
    expect(mesa?.encerrar('mestre', AGORA).ok).toBe(true);
    if (mesa) await c.mesas.salvar(mesa);

    const lido = await c.obterCombate.executar('bruno', MESA_ID);

    expect(lido.ok).toBe(true);
    if (lido.ok) expect(lido.valor.combate?.participantes).toHaveLength(3);
  });
});

describe('AplicarDano (RV-065)', () => {
  interface CasoPv {
    nome: string;
    pvInicial: number;
    delta: number;
    esperado: number;
    inconsciente: boolean;
  }

  const CASOS: CasoPv[] = [
    { nome: 'dano comum', pvInicial: 30, delta: -7, esperado: 23, inconsciente: false },
    {
      nome: 'dano acima do PV para em 0, não em negativo',
      pvInicial: 3,
      delta: -10,
      esperado: 0,
      inconsciente: true,
    },
    { nome: 'dano exato deixa em 0', pvInicial: 5, delta: -5, esperado: 0, inconsciente: true },
    { nome: 'cura respeita o máximo', pvInicial: 28, delta: 10, esperado: 30, inconsciente: false },
    { nome: 'cura comum', pvInicial: 10, delta: 5, esperado: 15, inconsciente: false },
  ];

  it.each(CASOS)('$nome', async ({ pvInicial, delta, esperado, inconsciente }) => {
    const combate = await combateDosTres();
    // O PV de partida é ajustado pela ficha, que é o único caminho de escrita.
    await c.personagens.salvar(
      Personagem.reconstituir({
        id: PERSONAGEM_BRUNO,
        mesaId: MESA_ID,
        donoId: 'bruno',
        nome: 'Thorin',
        classe: 'Guerreiro',
        nivel: 3,
        pvAtual: pvInicial,
        pvMax: 30,
        atributos: ATRIBUTOS,
        anotacoes: '',
        dados: {},
      }),
    );

    const aplicado = await c.aplicarDano.executar('mestre', combate.id, c.tokenThorin, delta);

    expect(aplicado.ok).toBe(true);
    if (!aplicado.ok) return;
    expect(aplicado.valor.pvAtual).toBe(esperado);
    expect(aplicado.valor.pvMax).toBe(30);
    // A ficha gravada tem o mesmo valor: o retorno não é uma projeção otimista.
    const relido = await c.personagens.buscarPorId(PERSONAGEM_BRUNO);
    expect(relido?.pvAtual).toBe(esperado);

    // A barra de vida sobre o token vive deste evento (RV-042).
    const fichas = c.publicador.doTipo('personagem:atualizado');
    expect(fichas).toHaveLength(1);
    expect(fichas[0]?.dados.pvAtual).toBe(esperado);

    expect(await avisosNoChat()).toEqual([textoAlteracaoPv('Thorin', delta, esperado, 30)]);

    const token = await c.cenas.buscarTokenPorId(c.tokenThorin);
    expect(token?.temCondicao(CONDICAO_INCONSCIENTE)).toBe(inconsciente);
  });

  it('curar quem estava inconsciente remove a condição da peça', async () => {
    const combate = await combateDosTres();
    expect((await c.aplicarDano.executar('mestre', combate.id, c.tokenThorin, -999)).ok).toBe(true);
    const caido = await c.cenas.buscarTokenPorId(c.tokenThorin);
    expect(caido?.temCondicao(CONDICAO_INCONSCIENTE)).toBe(true);
    c.publicador.limpar();

    const curado = await c.aplicarDano.executar('mestre', combate.id, c.tokenThorin, 8);

    expect(curado.ok).toBe(true);
    if (curado.ok) expect(curado.valor.pvAtual).toBe(8);
    const token = await c.cenas.buscarTokenPorId(c.tokenThorin);
    expect(token?.temCondicao(CONDICAO_INCONSCIENTE)).toBe(false);
    // O ícone só some da tela porque o token é retransmitido.
    expect(c.publicador.doTipo('token:atualizado')).toHaveLength(1);
  });

  it('dano em quem já está de pé não gasta broadcast de token', async () => {
    const combate = await combateDosTres();

    expect((await c.aplicarDano.executar('mestre', combate.id, c.tokenThorin, -1)).ok).toBe(true);

    expect(c.publicador.doTipo('token:atualizado')).toHaveLength(0);
    // E o combate não é retransmitido: nada nele mudou, o PV nunca esteve lá.
    expect(c.publicador.doTipo('combate:atualizado')).toHaveLength(0);
  });

  it('token sem ficha vinculada é 400 em PT-BR, e nada é gravado', async () => {
    const combate = await combateDosTres();

    const recusa = await c.aplicarDano.executar('mestre', combate.id, c.tokenNpc, -5);

    expect(recusa.ok).toBe(false);
    if (!recusa.ok) {
      expect(recusa.erro.tipo).toBe('validacao');
      expect(recusa.erro.mensagem).toBe(TOKEN_SEM_FICHA);
    }
    expect(await avisosNoChat()).toEqual([]);
    expect(c.publicador.publicados).toHaveLength(0);
  });

  it('jogador recebe 403, inclusive no próprio personagem', async () => {
    const combate = await combateDosTres();

    const recusa = await c.aplicarDano.executar('bruno', combate.id, c.tokenThorin, -7);

    expect(recusa.ok).toBe(false);
    if (!recusa.ok) {
      expect(recusa.erro.tipo).toBe('nao-autorizado');
      expect(recusa.erro.mensagem).toBe(APENAS_MESTRE_APLICA_DANO);
    }
    const relido = await c.personagens.buscarPorId(PERSONAGEM_BRUNO);
    expect(relido?.pvAtual).toBe(30);
  });

  it('token que não está neste combate é nao-encontrado', async () => {
    const combate = await combateDosTres();

    const recusa = await c.aplicarDano.executar('mestre', combate.id, c.tokenForasteiro, -5);

    expect(recusa.ok).toBe(false);
    if (!recusa.ok) expect(recusa.erro.tipo).toBe('nao-encontrado');
  });

  it('combate encerrado não aceita mais dano', async () => {
    const combate = await combateDosTres();
    expect((await c.encerrarCombate.executar('mestre', combate.id)).ok).toBe(true);

    const recusa = await c.aplicarDano.executar('mestre', combate.id, c.tokenThorin, -7);

    expect(recusa.ok).toBe(false);
    if (!recusa.ok) {
      expect(recusa.erro.tipo).toBe('conflito');
      expect(recusa.erro.mensagem).toBe(COMBATE_ENCERRADO);
    }
  });
});
