import { describe, expect, it } from 'vitest';
import {
  atributosIniciais,
  dadosIniciaisDaFicha,
  definicaoDoSistema,
  SISTEMAS_RPG,
  type CombateDTO,
  type PersonagemDTO,
  type SistemaRpg,
  type TokenDTO,
} from '@rolavinte/shared';
import {
  ehMinhaVez,
  linhaDoTurno,
  linhasDeCombate,
  pedidoDeIniciativa,
  podeRolarIniciativa,
  type LinhaDeCombate,
} from './painel-iniciativa';

/**
 * As contas do painel de iniciativa (RV-063).
 *
 * O que este arquivo protege, e por que cada guarda existe:
 *
 * 1. **A ordem é a que veio.** O agregado `Combate` ordena com um desempate que
 *    não sai no DTO. Reordenar no cliente seria uma segunda implementação da
 *    regra, e a frase `REGRA_DESEMPATE_INICIATIVA` que o painel mostra passaria a
 *    descrever algo que a tela não faz (F6). A asserção é a **sequência exata**,
 *    e não "o primeiro é o de maior iniciativa": com essa segunda redação, uma
 *    ordenação por iniciativa introduzida no cliente passaria verde.
 * 2. **O turno vem de `tokenIdDoTurno`, não do índice.** O caso montado abaixo
 *    põe `indiceTurno` apontando para outro participante de propósito.
 * 3. **A iniciativa é resposta do sistema.** A linha de uma ficha de PF2e oferece
 *    a Percepção e as alternativas; a de D&D 5e oferece uma opção só. Uma lista
 *    escrita à mão no painel não consegue produzir as duas.
 * 4. **Com ficha, o cliente manda a chave — nunca a expressão.** Mandar
 *    `expressao` é aceito pelo servidor e anula a derivação do RV-158, devolvendo
 *    ao navegador o poder de escolher a iniciativa do jogador. A asserção é de
 *    **objeto inteiro** (`toEqual`), porque um `expressao` extra passaria por uma
 *    asserção de campo a campo.
 */

const MESA_ID = 'mesa-1';
const CENA_ID = 'cena-1';

function token(campos: Partial<TokenDTO> = {}): TokenDTO {
  return {
    id: 'token-1',
    cenaId: CENA_ID,
    nome: 'Thorin',
    cor: '#c9a227',
    x: 1,
    y: 1,
    personagemId: null,
    imagemUrl: null,
    condicoes: [],
    ...campos,
  };
}

function personagem(campos: Partial<PersonagemDTO> = {}): PersonagemDTO {
  const sistema: SistemaRpg = campos.sistema ?? 'pathfinder2e';
  return {
    id: 'p1',
    mesaId: MESA_ID,
    donoId: 'u1',
    donoNome: 'Bruno',
    nome: 'Thorin',
    classe: 'Guerreiro',
    nivel: 3,
    pvAtual: 30,
    pvMax: 30,
    atributos: atributosIniciais(sistema),
    anotacoes: '',
    sistema,
    dados: dadosIniciaisDaFicha(sistema),
    ...campos,
  };
}

/** Thorin de PF2e com Percepção +9: perito no nível 3 (3 + 4) mais Sabedoria +2. */
function thorinPf2e(): PersonagemDTO {
  return personagem({
    sistema: 'pathfinder2e',
    nivel: 3,
    atributos: { ...atributosIniciais('pathfinder2e'), sabedoria: 2, destreza: 3 },
    dados: {
      ...dadosIniciaisDaFicha('pathfinder2e'),
      grauPercepcao: 'perito',
      treinamentos: { furtividade: 'treinado' },
    },
  });
}

/** Thorin de D&D 5e com Destreza 16 — na escala do d20 clássico, +3. */
function thorinDnd(): PersonagemDTO {
  return personagem({
    id: 'p-dnd',
    sistema: 'dnd5e',
    atributos: { ...atributosIniciais('dnd5e'), destreza: 16 },
    dados: dadosIniciaisDaFicha('dnd5e'),
  });
}

function combate(campos: Partial<CombateDTO> = {}): CombateDTO {
  return {
    id: 'combate-1',
    mesaId: MESA_ID,
    cenaId: CENA_ID,
    rodada: 1,
    indiceTurno: 0,
    ativo: true,
    participantes: [
      { tokenId: 'token-1', nome: 'Thorin', iniciativa: 18 },
      { tokenId: 'token-2', nome: 'Chefe Goblin', iniciativa: 18 },
      { tokenId: 'token-3', nome: 'Goblin', iniciativa: null },
    ],
    tokenIdDoTurno: 'token-1',
    ...campos,
  };
}

describe('linhasDeCombate — a ordem é a do servidor', () => {
  it('renderiza os participantes na sequência exata em que vieram, sem reordenar', () => {
    // Iniciativas fora de ordem decrescente de propósito: se o painel ordenasse
    // por conta própria, a sequência abaixo mudaria.
    const linhas = linhasDeCombate({
      combate: combate({
        participantes: [
          { tokenId: 't-b', nome: 'B', iniciativa: 5 },
          { tokenId: 't-a', nome: 'A', iniciativa: 22 },
          { tokenId: 't-c', nome: 'C', iniciativa: null },
        ],
        tokenIdDoTurno: 't-b',
      }),
      tokens: [],
      personagens: [],
      meusPersonagemIds: new Set(),
    });

    expect(linhas.map((l) => l.tokenId)).toEqual(['t-b', 't-a', 't-c']);
    expect(linhas.map((l) => l.posicao)).toEqual([1, 2, 3]);
    expect(linhas.map((l) => l.iniciativa)).toEqual([5, 22, null]);
  });

  it('o turno sai de tokenIdDoTurno, e não do indiceTurno', () => {
    // `indiceTurno: 0` aponta para `token-1`; `tokenIdDoTurno` diz `token-2`. O
    // contrato manda usar o segundo — recalcular pelo índice realçaria a peça
    // errada em qualquer divergência.
    const linhas = linhasDeCombate({
      combate: combate({ indiceTurno: 0, tokenIdDoTurno: 'token-2' }),
      tokens: [],
      personagens: [],
      meusPersonagemIds: new Set(),
    });

    expect(linhas.filter((l) => l.noTurno).map((l) => l.tokenId)).toEqual(['token-2']);
    expect(linhaDoTurno(linhas)?.tokenId).toBe('token-2');
  });

  it('combate sem participante nenhum não tem linha do turno', () => {
    const linhas = linhasDeCombate({
      combate: combate({ participantes: [], tokenIdDoTurno: null }),
      tokens: [],
      personagens: [],
      meusPersonagemIds: new Set(),
    });

    expect(linhas).toEqual([]);
    expect(linhaDoTurno(linhas)).toBeNull();
    expect(ehMinhaVez(linhas)).toBe(false);
  });
});

describe('linhasDeCombate — cruzamento com a cena e com as fichas', () => {
  it('a ficha vem do token, e o PV não é copiado para a linha', () => {
    const ficha = thorinPf2e();
    const linhas = linhasDeCombate({
      combate: combate(),
      tokens: [token({ id: 'token-1', personagemId: ficha.id })],
      personagens: [ficha],
      meusPersonagemIds: new Set(),
    });

    // A linha guarda a **referência** à ficha do cache: o PV lido na tela é o que
    // o `personagem:atualizado` acabou de gravar, nunca uma cópia congelada.
    expect(linhas[0]?.personagem).toBe(ficha);
    expect(linhas[0]?.token?.id).toBe('token-1');
  });

  it('peça que saiu da cena continua na ordem, sem ficha e sem opção de rolagem', () => {
    // O participante é do servidor; o token pode ter sido apagado do mapa. A linha
    // não pode desaparecer por conta do cliente — nem quebrar.
    const linhas = linhasDeCombate({
      combate: combate(),
      tokens: [],
      personagens: [thorinPf2e()],
      meusPersonagemIds: new Set(['p1']),
    });

    expect(linhas).toHaveLength(3);
    expect(linhas[0]?.token).toBeNull();
    expect(linhas[0]?.personagem).toBeNull();
    expect(linhas[0]?.opcoes).toEqual([]);
    expect(linhas[0]?.minha).toBe(false);
  });

  it('token sem ficha (o NPC) fica sem personagem e sem opção declarada', () => {
    const linhas = linhasDeCombate({
      combate: combate(),
      tokens: [token({ id: 'token-2', nome: 'Chefe Goblin', personagemId: null })],
      personagens: [thorinPf2e()],
      meusPersonagemIds: new Set(['p1']),
    });

    const goblin = linhas.find((l) => l.tokenId === 'token-2');
    expect(goblin?.personagem).toBeNull();
    expect(goblin?.opcoes).toEqual([]);
  });

  it('"minha" é verdadeiro só na peça cuja ficha é minha', () => {
    const minha = thorinPf2e();
    const alheia = personagem({ id: 'p2', donoId: 'u2', nome: 'Aria' });
    const linhas = linhasDeCombate({
      combate: combate(),
      tokens: [
        token({ id: 'token-1', personagemId: minha.id }),
        token({ id: 'token-2', personagemId: alheia.id }),
      ],
      personagens: [minha, alheia],
      meusPersonagemIds: new Set([minha.id]),
    });

    expect(linhas.map((l) => [l.tokenId, l.minha])).toEqual([
      ['token-1', true],
      ['token-2', false],
      ['token-3', false],
    ]);
  });
});

describe('linhasDeCombate — com o que se rola iniciativa é resposta do sistema (RV-158)', () => {
  function linhaCom(ficha: PersonagemDTO): LinhaDeCombate {
    const [linha] = linhasDeCombate({
      combate: combate({
        participantes: [{ tokenId: 'token-1', nome: 'Thorin', iniciativa: null }],
      }),
      tokens: [token({ id: 'token-1', personagemId: ficha.id })],
      personagens: [ficha],
      meusPersonagemIds: new Set([ficha.id]),
    });
    if (!linha) throw new Error('a linha do participante deveria existir');
    return linha;
  }

  it('a ficha de PF2e oferece a Percepção como padrão, com o bônus da ficha', () => {
    const padrao = linhaCom(thorinPf2e()).opcoes[0];

    // Números escritos à mão, como um jogador os somaria: perito no nível 3 são
    // 3 + 4 = 7, mais Sabedoria +2 → +9. Se a interface passar a fazer aritmética
    // de proficiência, é aqui que aparece.
    expect(padrao?.chave).toBe('iniciativa');
    expect(padrao?.rotulo).toBe('Iniciativa (Percepção)');
    expect(padrao?.expressao).toBe('1d20+9');
    expect(padrao?.padrao).toBe(true);
  });

  it('a ficha de PF2e oferece alternativas por perícia; a de D&D 5e, uma opção só', () => {
    const pf2e = linhaCom(thorinPf2e()).opcoes;
    const dnd = linhaCom(thorinDnd()).opcoes;

    // O par é a guarda de verdade: uma lista escrita à mão dentro do painel não
    // consegue devolver dezessete opções numa mesa e uma na outra.
    expect(pf2e.length).toBeGreaterThan(1);
    expect(pf2e.some((o) => o.chave === 'iniciativa:furtividade')).toBe(true);
    expect(dnd.map((o) => [o.chave, o.rotulo, o.expressao])).toEqual([
      ['iniciativa', 'Iniciativa', '1d20+3'],
    ]);
  });

  it('toda mesa da plataforma oferece iniciativa na peça com ficha', () => {
    // Derivado de `SISTEMAS_RPG`: um sistema novo que esqueça de declarar como se
    // rola iniciativa deixa este teste vermelho **nomeando o sistema**, em vez de
    // produzir uma aba de combate em que o botão de rolar nunca funciona.
    const semIniciativa = SISTEMAS_RPG.filter((sistema) => {
      const ficha = personagem({ id: `p-${sistema}`, sistema });
      return linhaCom(ficha).opcoes.length === 0;
    });

    expect(
      semIniciativa,
      `Sistema(s) cuja mesa não oferece nenhuma forma de rolar iniciativa: ` +
        `${semIniciativa.join(', ')}. Declare a rolagem em DefinicaoSistema.rolagensPadrao ` +
        `(packages/shared/src/sistemas), com a chave CHAVE_INICIATIVA.`,
    ).toEqual([]);
    expect(SISTEMAS_RPG.length).toBeGreaterThan(0);
  });

  it('as opções são as do registro, para o sistema da ficha daquela peça', () => {
    // Cruzamento com a fonte: se o painel deixar de perguntar ao registro, os
    // rótulos param de casar com o que a definição declara.
    const definicao = definicaoDoSistema('pathfinder2e');
    const declarados = definicao.rolagensPadrao
      .filter((r) => r.chave.startsWith('iniciativa'))
      .map((r) => r.rotulo);

    expect(linhaCom(thorinPf2e()).opcoes.map((o) => o.rotulo)).toEqual(declarados);
  });
});

describe('ehMinhaVez — o gatilho do aviso destacado', () => {
  function comTurnoEm(tokenIdDoTurno: string, meus: string[]): LinhaDeCombate[] {
    const minha = thorinPf2e();
    const alheia = personagem({ id: 'p2', donoId: 'u2', nome: 'Aria' });
    return linhasDeCombate({
      combate: combate({ tokenIdDoTurno }),
      tokens: [
        token({ id: 'token-1', personagemId: minha.id }),
        token({ id: 'token-2', personagemId: alheia.id }),
        token({ id: 'token-3', personagemId: null }),
      ],
      personagens: [minha, alheia],
      meusPersonagemIds: new Set(meus),
    });
  }

  it('é a minha vez quando a peça do turno tem a minha ficha', () => {
    expect(ehMinhaVez(comTurnoEm('token-1', ['p1']))).toBe(true);
  });

  it('não é a minha vez quando o turno é da peça de outro jogador', () => {
    expect(ehMinhaVez(comTurnoEm('token-2', ['p1']))).toBe(false);
  });

  it('não é a minha vez quando o turno é de um NPC sem ficha', () => {
    expect(ehMinhaVez(comTurnoEm('token-3', ['p1']))).toBe(false);
  });
});

describe('podeRolarIniciativa — a mesma regra do 403 do servidor', () => {
  const linha = (minha: boolean): LinhaDeCombate => ({
    tokenId: 'token-1',
    nome: 'Thorin',
    iniciativa: null,
    posicao: 1,
    noTurno: false,
    token: null,
    personagem: null,
    minha,
    opcoes: [],
  });

  it('o mestre rola por qualquer peça', () => {
    expect(podeRolarIniciativa(linha(false), true)).toBe(true);
  });

  it('o jogador rola pela própria e não pela de terceiro', () => {
    expect(podeRolarIniciativa(linha(true), false)).toBe(true);
    expect(podeRolarIniciativa(linha(false), false)).toBe(false);
  });
});

describe('pedidoDeIniciativa — com ficha vai a chave, nunca a expressão', () => {
  function comFicha(): LinhaDeCombate {
    const ficha = thorinPf2e();
    const [linha] = linhasDeCombate({
      combate: combate({
        participantes: [{ tokenId: 'token-1', nome: 'Thorin', iniciativa: null }],
      }),
      tokens: [token({ id: 'token-1', personagemId: ficha.id })],
      personagens: [ficha],
      meusPersonagemIds: new Set([ficha.id]),
    });
    if (!linha) throw new Error('a linha do participante deveria existir');
    return linha;
  }

  const semFicha: LinhaDeCombate = {
    tokenId: 'token-2',
    nome: 'Chefe Goblin',
    iniciativa: null,
    posicao: 2,
    noTurno: false,
    token: null,
    personagem: null,
    minha: false,
    opcoes: [],
  };

  it('peça com ficha e nenhuma escolha manda só o tokenId — o servidor deriva', () => {
    // `toEqual` do objeto inteiro: um `expressao` calculado no navegador que
    // vazasse para cá passaria por qualquer asserção campo a campo, e o servidor
    // o aceitaria em silêncio.
    expect(pedidoDeIniciativa(comFicha(), '', '')).toEqual({ tokenId: 'token-1' });
  });

  it('alternativa escolhida viaja como `rolagem`, e sem expressão', () => {
    expect(pedidoDeIniciativa(comFicha(), 'iniciativa:furtividade', '')).toEqual({
      tokenId: 'token-1',
      rolagem: 'iniciativa:furtividade',
    });
  });

  it('peça com ficha ignora expressão digitada: a derivação do servidor manda', () => {
    expect(pedidoDeIniciativa(comFicha(), '', '1d20+99')).toEqual({ tokenId: 'token-1' });
  });

  it('peça sem ficha manda a expressão digitada, trimada', () => {
    expect(pedidoDeIniciativa(semFicha, '', '  17  ')).toEqual({
      tokenId: 'token-2',
      expressao: '17',
    });
  });

  it('peça sem ficha e sem expressão não tem pedido — o botão fica travado', () => {
    expect(pedidoDeIniciativa(semFicha, '', '')).toBeNull();
    expect(pedidoDeIniciativa(semFicha, '', '   ')).toBeNull();
  });
});
