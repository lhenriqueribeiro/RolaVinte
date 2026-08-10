import { beforeEach, describe, expect, it } from 'vitest';
import {
  atributosIniciais,
  chaveDeIniciativaPor,
  criarCenaSchema,
  criarTokenSchema,
  dadosIniciaisDaFicha,
  definicaoDoSistema,
  iniciativaEscolhida,
  rolarIniciativaSchema,
  SISTEMAS_RPG,
  type Atributos,
  type DadosFicha,
  type SistemaRpg,
} from '@rolavinte/shared';
import { Mesa } from '../../dominio/mesas/mesa';
import { Personagem } from '../../dominio/personagens/personagem';
import { Usuario } from '../../dominio/contas/usuario';
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
import { CriarCena } from './criar-cena';
import { CriarToken } from './criar-token';
import { IniciarCombate } from './iniciar-combate';
import { RolarDados } from './rolar-dados';
import {
  INICIATIVA_DE_TERCEIRO,
  INICIATIVA_NAO_DECLARADA,
  INICIATIVA_SEM_FICHA,
  RolarIniciativa,
  mensagemIniciativaDesconhecida,
  motivoIniciativa,
} from './rolar-iniciativa';

/**
 * Iniciativa derivada do sistema da mesa (RV-158) — o **consumidor de produção**
 * de `DefinicaoSistema.rolagensPadrao`.
 *
 * ## O que só este arquivo mede
 *
 * `packages/shared/src/sistemas/iniciativa.test.ts` prova que toda rolagem padrão
 * declarada é oferecida como opção. Isso não prova que **alguém em produção
 * pergunte** — e era exatamente esse o buraco: quatro sistemas declaravam a
 * iniciativa e nenhuma linha de produção a lia (F2, medido na v0.7.0).
 *
 * Aqui a pergunta é feita de fora, pelo caso de uso, para **todo** sistema do
 * registro: rola-se a iniciativa sem informar expressão e compara-se o que foi ao
 * chat com o que a definição declara. Se `RolarIniciativa` voltar a aceitar só o
 * que o cliente manda, ou passar a inventar `1d20`, esta suíte fica vermelha
 * nomeando o sistema.
 *
 * A lista de sistemas vem de `SISTEMAS_RPG`, e o número esperado de
 * `iniciativaEscolhida` — nada aqui é uma lista escrita à mão do que "deveria
 * existir", que é a forma de verificação que já derrubou o chat deste projeto.
 */

const AGORA = new Date('2026-08-10T12:00:00.000Z');

/** RNG travado no topo: `1d20` sai 20, então o total é 20 + bônus. */
const D20_MAXIMO = 20;

/** Cenário de uma mesa: quem é quem, e as peças em combate. */
interface CenarioMesa {
  mesaId: string;
  combateId: string;
  /** Peça do Bruno, vinculada à ficha dele. */
  tokenHeroi: string;
  /** Peça da Ana, vinculada à ficha dela. */
  tokenDaAna: string;
  /** Peça sem ficha — o NPC, que é o caso comum e não pode travar a luta. */
  tokenNpc: string;
  nomeHeroi: string;
}

interface Fabrica {
  mesas: FakeMesaRepository;
  rolarIniciativa: RolarIniciativa;
  /** Monta mesa + cena + fichas + combate para aquele sistema. */
  montar(sistema: SistemaRpg, ficha: FichaDeTeste): Promise<CenarioMesa>;
}

interface FichaDeTeste {
  nivel: number;
  atributos: Atributos;
  dados: DadosFicha;
}

function usuario(id: string, nome: string): Usuario {
  const r = Usuario.criar({ id, nome, email: `${id}@ex.com`, senhaHash: 'hash', agora: AGORA });
  if (!r.ok) throw new Error(r.erro.mensagem);
  return r.valor;
}

/** Mesa daquele sistema com "mestre" no comando e "bruno"/"ana" como jogadores. */
function mesaDe(mesaId: string, sistema: SistemaRpg): Mesa {
  const criada = Mesa.criar({
    id: mesaId,
    nome: `Mesa de ${sistema}`,
    descricao: '',
    sistema,
    mestreId: 'mestre',
    agora: AGORA,
  });
  if (!criada.ok) throw new Error(criada.erro.mensagem);
  for (const jogadorId of ['bruno', 'ana']) {
    criada.valor.convidar({
      solicitanteId: 'mestre',
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

/**
 * A ficha "cheia" daquele sistema: os atributos no **teto da escala declarada**.
 *
 * O teto, e não o padrão, porque o padrão daria bônus 0 em quase todo sistema — e
 * uma iniciativa fixa em `1d20+0` passaria verde mesmo se o caso de uso tivesse
 * a expressão escrita à mão. Com o teto, cada sistema produz um número diferente
 * e derivado da sua própria escala.
 */
function fichaCheiaDe(sistema: SistemaRpg): FichaDeTeste {
  const { maximo } = definicaoDoSistema(sistema).atributos;
  return {
    nivel: 3,
    atributos: { ...atributosIniciais(sistema), destreza: maximo, sabedoria: maximo },
    dados: dadosIniciaisDaFicha(sistema),
  };
}

/** O que a definição do sistema diz que esta ficha rola de iniciativa. */
function expressaoDeclarada(sistema: SistemaRpg, ficha: FichaDeTeste, chave?: string): string {
  const opcao = iniciativaEscolhida(definicaoDoSistema(sistema), ficha, chave);
  if (!opcao) throw new Error(`o sistema "${sistema}" não declara iniciativa`);
  return opcao.expressao;
}

async function montarFabrica(): Promise<Fabrica> {
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
  ] as const) {
    await usuarios.salvar(usuario(id, nome));
  }

  const criarCena = new CriarCena(cenas, mesas, geradorId, publicador);
  const criarToken = new CriarToken(cenas, mesas, geradorId, publicador);
  const iniciarCombate = new IniciarCombate(combates, cenas, mesas, geradorId, publicador);
  const rolarDados = new RolarDados(
    mensagens,
    mesas,
    usuarios,
    servicoRolagem,
    geradorId,
    relogio,
    publicador,
  );

  let sequencia = 0;

  async function montar(sistema: SistemaRpg, ficha: FichaDeTeste): Promise<CenarioMesa> {
    sequencia += 1;
    const mesaId = `00000000-0000-4000-9000-c${String(sequencia).padStart(11, '0')}`;
    await mesas.salvar(mesaDe(mesaId, sistema));

    async function fichaDe(dono: string, nome: string, sufixo: string): Promise<string> {
      const id = `00000000-0000-4000-9000-${sufixo}${String(sequencia).padStart(11, '0')}`;
      const criada = Personagem.criar(
        {
          id,
          mesaId,
          donoId: dono,
          nome,
          classe: 'Explorador',
          nivel: ficha.nivel,
          pvMax: 30,
          atributos: ficha.atributos,
          anotacoes: '',
          dados: ficha.dados,
        },
        sistema,
      );
      if (!criada.ok) throw new Error(`ficha de teste inválida: ${criada.erro.mensagem}`);
      await personagens.salvar(criada.valor);
      return id;
    }

    const fichaHeroi = await fichaDe('bruno', 'Thorin', 'a');
    const fichaDaAna = await fichaDe('ana', 'Sombra', 'b');

    const cena = await criarCena.executar(
      'mestre',
      criarCenaSchema.parse({ mesaId, nome: 'Emboscada' }),
    );
    if (!cena.ok) throw new Error(cena.erro.mensagem);
    // O id sai do `Result` **antes** do closure: dentro dele o narrowing de `cena.ok`
    // não sobrevive, e o `any` resultante é erro de lint (proibido no monorepo).
    const cenaId = cena.valor.id;

    async function token(nome: string, x: number, personagemId: string | null): Promise<string> {
      const criado = await criarToken.executar(
        'mestre',
        criarTokenSchema.parse({ cenaId, nome, x, y: 0, personagemId }),
      );
      if (!criado.ok) throw new Error(`token de teste inválido: ${criado.erro.mensagem}`);
      return criado.valor.id;
    }

    const tokenHeroi = await token('Thorin', 1, fichaHeroi);
    const tokenDaAna = await token('Sombra', 2, fichaDaAna);
    const tokenNpc = await token('Goblin', 3, null);

    const combate = await iniciarCombate.executar('mestre', {
      mesaId,
      tokenIds: [tokenHeroi, tokenDaAna, tokenNpc],
    });
    if (!combate.ok) throw new Error(combate.erro.mensagem);

    publicador.limpar();
    return {
      mesaId,
      combateId: combate.valor.id,
      tokenHeroi,
      tokenDaAna,
      tokenNpc,
      nomeHeroi: 'Thorin',
    };
  }

  return {
    mesas,
    montar,
    rolarIniciativa: new RolarIniciativa(
      combates,
      cenas,
      mesas,
      personagens,
      rolarDados,
      publicador,
    ),
  };
}

let f: Fabrica;

beforeEach(async () => {
  f = await montarFabrica();
});

/** Pedido de iniciativa como a borda HTTP o entrega — sem expressão informada. */
function pedido(tokenId: string, rolagem?: string) {
  return rolarIniciativaSchema.parse(rolagem === undefined ? { tokenId } : { tokenId, rolagem });
}

describe('RolarIniciativa deriva o bônus do sistema da mesa (RV-158)', () => {
  it('a lista de sistemas não está vazia', () => {
    // Rede de segurança do próprio arquivo: sem sistemas, o teste abaixo passaria
    // sem exercitar nada.
    expect(SISTEMAS_RPG.length).toBeGreaterThan(0);
  });

  it.each([...SISTEMAS_RPG])(
    'em %s a iniciativa rolada é a que a definição declara',
    async (sistema) => {
      const ficha = fichaCheiaDe(sistema);
      const mesa = await f.montar(sistema, ficha);
      const esperada = expressaoDeclarada(sistema, ficha);

      const rolada = await f.rolarIniciativa.executar(
        'mestre',
        mesa.combateId,
        pedido(mesa.tokenHeroi),
      );

      expect(rolada.ok, sistema).toBe(true);
      if (!rolada.ok) return;
      // A expressão que foi ao motor de dados é a do sistema, e o total gravado na
      // ordem é o total que a mesa viu no chat.
      expect(rolada.valor.mensagem.rolagem?.expressao).toBe(esperada);
      const bonus = Number(esperada.replace(/^\d*d\d+/, ''));
      const total = D20_MAXIMO + bonus;
      expect(rolada.valor.mensagem.rolagem?.total).toBe(total);
      expect(
        rolada.valor.combate.participantes.find((p) => p.tokenId === mesa.tokenHeroi)?.iniciativa,
      ).toBe(total);
    },
  );

  it('em Pathfinder 2e a iniciativa é a Percepção da ficha: +9 rola 1d20+9', async () => {
    // O cenário do card, ponta a ponta: perito em Percepção no nível 3 (3 + 4 = 7)
    // com Sabedoria +2 → +9, e o chat diz de onde saiu o número.
    const ficha: FichaDeTeste = {
      nivel: 3,
      atributos: { ...atributosIniciais('pathfinder2e'), sabedoria: 2, destreza: 3 },
      dados: {
        ...dadosIniciaisDaFicha('pathfinder2e'),
        grauPercepcao: 'perito',
        treinamentos: { furtividade: 'treinado' },
      },
    };
    const mesa = await f.montar('pathfinder2e', ficha);

    const rolada = await f.rolarIniciativa.executar(
      'mestre',
      mesa.combateId,
      pedido(mesa.tokenHeroi),
    );

    expect(rolada.ok).toBe(true);
    if (!rolada.ok) return;
    expect(rolada.valor.mensagem.rolagem?.expressao).toBe('1d20+9');
    expect(rolada.valor.mensagem.rolagem?.total).toBe(29);
    expect(rolada.valor.mensagem.motivo).toBe('Iniciativa (Percepção) — Thorin');
  });

  it('a emboscada: o mestre escolhe Furtividade e a rolagem usa o bônus dela', async () => {
    const ficha: FichaDeTeste = {
      nivel: 3,
      atributos: { ...atributosIniciais('pathfinder2e'), sabedoria: 2, destreza: 3 },
      dados: {
        ...dadosIniciaisDaFicha('pathfinder2e'),
        grauPercepcao: 'perito',
        treinamentos: { furtividade: 'treinado' },
      },
    };
    const mesa = await f.montar('pathfinder2e', ficha);

    const rolada = await f.rolarIniciativa.executar(
      'mestre',
      mesa.combateId,
      pedido(mesa.tokenHeroi, chaveDeIniciativaPor('furtividade')),
    );

    expect(rolada.ok).toBe(true);
    if (!rolada.ok) return;
    // Treinado no nível 3 (3 + 2 = 5) com Destreza +3 → +8. E o chat diz Furtividade,
    // não Percepção: a linha do chat prova qual regra foi aplicada.
    expect(rolada.valor.mensagem.rolagem?.expressao).toBe('1d20+8');
    expect(rolada.valor.mensagem.motivo).toBe('Iniciativa (Furtividade) — Thorin');
  });

  it('uma mesa de D&D 5e não passa a rolar Percepção — a iniciativa continua a Destreza', async () => {
    const ficha: FichaDeTeste = {
      nivel: 3,
      atributos: { ...atributosIniciais('dnd5e'), destreza: 16, sabedoria: 20 },
      dados: dadosIniciaisDaFicha('dnd5e'),
    };
    const mesa = await f.montar('dnd5e', ficha);

    const rolada = await f.rolarIniciativa.executar(
      'mestre',
      mesa.combateId,
      pedido(mesa.tokenHeroi),
    );

    expect(rolada.ok).toBe(true);
    if (!rolada.ok) return;
    // Destreza 16 → +3. Se a Percepção do PF2e tivesse escapado para cá, a Sabedoria
    // 20 (+5) apareceria no número.
    expect(rolada.valor.mensagem.rolagem?.expressao).toBe('1d20+3');
    expect(rolada.valor.mensagem.motivo).toBe(motivoIniciativa('Thorin'));
  });

  it('a alternativa de PF2e não existe numa mesa de D&D 5e', async () => {
    const ficha = fichaCheiaDe('dnd5e');
    const mesa = await f.montar('dnd5e', ficha);

    const recusa = await f.rolarIniciativa.executar(
      'mestre',
      mesa.combateId,
      pedido(mesa.tokenHeroi, chaveDeIniciativaPor('furtividade')),
    );

    expect(recusa.ok).toBe(false);
    if (recusa.ok) return;
    expect(recusa.erro.tipo).toBe('validacao');
    expect(recusa.erro.mensagem).toBe(
      mensagemIniciativaDesconhecida('iniciativa:furtividade', 'D&D 5e'),
    );
  });

  it('a iniciativa do jogador não é um número que o cliente escolhe', async () => {
    // O jogador rola pela própria peça **sem** informar expressão: o bônus vem da
    // ficha dele, no servidor. É o que impede um `1d20+99` autenticado.
    const ficha: FichaDeTeste = {
      nivel: 3,
      atributos: { ...atributosIniciais('pathfinder2e'), sabedoria: 1 },
      dados: { ...dadosIniciaisDaFicha('pathfinder2e'), grauPercepcao: 'treinado' },
    };
    const mesa = await f.montar('pathfinder2e', ficha);

    const rolada = await f.rolarIniciativa.executar(
      'bruno',
      mesa.combateId,
      pedido(mesa.tokenHeroi),
    );

    expect(rolada.ok).toBe(true);
    if (!rolada.ok) return;
    // Treinado no nível 3 (3 + 2 = 5) com Sabedoria +1 → +6.
    expect(rolada.valor.mensagem.rolagem?.expressao).toBe('1d20+6');
    expect(rolada.valor.mensagem.autorNome).toBe('Bruno');
  });

  it('o jogador continua sem poder rolar pela peça de outro, mesmo sem expressão', async () => {
    const mesa = await f.montar('pathfinder2e', fichaCheiaDe('pathfinder2e'));

    const recusa = await f.rolarIniciativa.executar(
      'bruno',
      mesa.combateId,
      pedido(mesa.tokenDaAna),
    );

    expect(recusa.ok).toBe(false);
    if (recusa.ok) return;
    expect(recusa.erro.tipo).toBe('nao-autorizado');
    expect(recusa.erro.mensagem).toBe(INICIATIVA_DE_TERCEIRO);
  });

  it('o jogador não deriva a iniciativa do NPC — recusa é 403, e não 400', async () => {
    // A ordem das guardas importa: quem não é dono da peça é barrado antes de o
    // servidor cogitar de onde tirar o bônus.
    const mesa = await f.montar('pathfinder2e', fichaCheiaDe('pathfinder2e'));

    const recusa = await f.rolarIniciativa.executar('bruno', mesa.combateId, pedido(mesa.tokenNpc));

    expect(recusa.ok).toBe(false);
    if (recusa.ok) return;
    expect(recusa.erro.tipo).toBe('nao-autorizado');
  });
});

describe('RolarIniciativa — o NPC sem ficha e a expressão informada (RV-158)', () => {
  it('peça sem ficha e sem expressão é recusada dizendo o que fazer', async () => {
    const mesa = await f.montar('pathfinder2e', fichaCheiaDe('pathfinder2e'));

    const recusa = await f.rolarIniciativa.executar(
      'mestre',
      mesa.combateId,
      pedido(mesa.tokenNpc),
    );

    expect(recusa.ok).toBe(false);
    if (recusa.ok) return;
    expect(recusa.erro.tipo).toBe('validacao');
    expect(recusa.erro.mensagem).toBe(INICIATIVA_SEM_FICHA);
  });

  it('o mestre informa a iniciativa do NPC na mão e a luta começa', async () => {
    const mesa = await f.montar('pathfinder2e', fichaCheiaDe('pathfinder2e'));

    const rolada = await f.rolarIniciativa.executar(
      'mestre',
      mesa.combateId,
      rolarIniciativaSchema.parse({ tokenId: mesa.tokenNpc, expressao: '15' }),
    );

    expect(rolada.ok).toBe(true);
    if (!rolada.ok) return;
    // Constante é expressão válida no motor de dados: o mestre digita o número que
    // já tem no bloco de notas, sem inventar um `1d0+15`.
    expect(rolada.valor.mensagem.rolagem?.total).toBe(15);
    expect(
      rolada.valor.combate.participantes.find((p) => p.tokenId === mesa.tokenNpc)?.iniciativa,
    ).toBe(15);
    expect(rolada.valor.mensagem.motivo).toBe(motivoIniciativa('Goblin'));
  });

  it('a expressão informada manda, mesmo com ficha e opção disponíveis', async () => {
    // Compatibilidade com o RV-061: quem já mandava a expressão continua mandando, e
    // ela não é substituída pela do sistema em silêncio.
    const ficha: FichaDeTeste = {
      nivel: 3,
      atributos: { ...atributosIniciais('pathfinder2e'), sabedoria: 2 },
      dados: { ...dadosIniciaisDaFicha('pathfinder2e'), grauPercepcao: 'perito' },
    };
    const mesa = await f.montar('pathfinder2e', ficha);

    const rolada = await f.rolarIniciativa.executar(
      'mestre',
      mesa.combateId,
      rolarIniciativaSchema.parse({ tokenId: mesa.tokenHeroi, expressao: '1d20+1' }),
    );

    expect(rolada.ok).toBe(true);
    if (!rolada.ok) return;
    expect(rolada.valor.mensagem.rolagem?.expressao).toBe('1d20+1');
    expect(rolada.valor.mensagem.motivo).toBe(motivoIniciativa('Thorin'));
  });

  it('o motivo informado por quem chama continua vencendo o rótulo do sistema', async () => {
    const mesa = await f.montar('pathfinder2e', fichaCheiaDe('pathfinder2e'));

    const rolada = await f.rolarIniciativa.executar(
      'mestre',
      mesa.combateId,
      rolarIniciativaSchema.parse({ tokenId: mesa.tokenHeroi, motivo: 'Surpresa na ponte' }),
    );

    expect(rolada.ok).toBe(true);
    if (rolada.ok) expect(rolada.valor.mensagem.motivo).toBe('Surpresa na ponte');
  });

  it('a mensagem de sistema sem iniciativa declarada existe e é distinta da do NPC', () => {
    // Nenhum sistema do registro está nessa situação hoje — e é justamente por isso
    // que a frase precisa existir escrita: o próximo sistema pode declarar
    // `rolagensPadrao: []`, e a recusa dele não é "esta peça não tem ficha".
    expect(INICIATIVA_NAO_DECLARADA).not.toBe(INICIATIVA_SEM_FICHA);
    expect(INICIATIVA_NAO_DECLARADA).toContain('Informe a expressão');
  });
});
