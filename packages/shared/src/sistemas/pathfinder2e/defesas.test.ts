import { describe, expect, it } from 'vitest';
import { ATRIBUTOS, type Atributos } from '../../schemas/personagens';
import { defesasDoPersonagem, type PersonagemCalculavel } from '../calculo';
import { atributosIniciais, dadosIniciaisDaFicha, validarDadosDaFicha } from '../registro';
import type { DadosFicha } from '../tipos';
import {
  atributoChaveDaClasse,
  BASE_DEFESA,
  BONUS_ITEM_MAXIMO,
  calcularCa,
  calcularCdClasse,
  calcularPercepcao,
  calcularSalvaguarda,
  CAMPOS_DEFESAS,
  chaveDoGrauDaDefesa,
  CHAVE_CA,
  CHAVE_CD_CLASSE,
  CHAVE_PERCEPCAO,
  CHAVE_PV_SUGERIDO,
  DEFESAS_PF2E,
  destrezaNaCa,
  grauDaDefesa,
  LIMITE_DESTREZA_MAXIMO,
  limiteDestrezaDe,
  pvSugerido,
  pvSugeridoDaFicha,
  SALVAGUARDAS_PF2E,
  SEM_ATRIBUTO_CHAVE,
} from './defesas';
import { PERICIAS_PF2E } from './pericias';
import { bonusProficiencia, CDS_SIMPLES, GRAUS_TREINAMENTO, type GrauTreinamento } from './regras';
import { SISTEMA_PATHFINDER2E } from './definicao';

/**
 * Defesas de Pathfinder 2e (RV-155).
 *
 * **Todo número esperado está escrito à mão**, como um jogador o somaria na mesa.
 * Um teste que refaz a conta do código concorda com o bug — e o bug que este card
 * mais arrisca é o do limite de Destreza, que dá um número plausível.
 *
 * A cobertura genérica (schema estrito, campos das seções existindo na ficha
 * inicial, limites da interface iguais aos do schema, opções de `selecao` aceitas
 * pelo schema) vem de `registro.test.ts`, que percorre `SISTEMAS_RPG` e cobre este
 * sistema sem uma linha de alteração. Aqui ficam as regras que são **destas**
 * defesas.
 */

function fichaInicial(): DadosFicha {
  return dadosIniciaisDaFicha('pathfinder2e');
}

function comModificadores(parciais: Partial<Atributos>): Atributos {
  return { ...atributosIniciais('pathfinder2e'), ...parciais };
}

/** Uma ficha calculável de PF2e, com os graus e os campos de armadura pedidos. */
function ficha(
  nivel: number,
  atributos: Partial<Atributos>,
  dados: Partial<Record<string, unknown>> = {},
): PersonagemCalculavel {
  return {
    sistema: 'pathfinder2e',
    nivel,
    atributos: comModificadores(atributos),
    dados: { ...fichaInicial(), ...dados },
  };
}

function defesa(personagem: PersonagemCalculavel, chave: string) {
  const encontrada = defesasDoPersonagem(personagem, 'Seelah').find((d) => d.chave === chave);
  expect(encontrada, `a defesa "${chave}" não está na lista`).toBeDefined();
  return encontrada as NonNullable<typeof encontrada>;
}

describe('defesas de PF2e — os cenários do card, somados à mão', () => {
  it('CA com o limite de Destreza aplicado: nível 3, perito, Destreza +4, meia-armadura → 22', () => {
    // 10 + (3 + 4 de perito) + 1 (a Destreza +4 limitada ao teto +1) + 4 de item.
    // Sem o teto sairia 25, que é o erro clássico deste card.
    expect(
      calcularCa({
        nivel: 3,
        grau: 'perito',
        modificadorDestreza: 4,
        bonusItemArmadura: 4,
        limiteDes: 1,
      }),
    ).toBe(22);
  });

  it('as três salvaguardas: nível 3, perito em Fortitude e treinado nas outras', () => {
    expect(calcularSalvaguarda({ nivel: 3, grau: 'perito', modificador: 3 })).toBe(10);
    expect(calcularSalvaguarda({ nivel: 3, grau: 'treinado', modificador: 1 })).toBe(6);
    expect(calcularSalvaguarda({ nivel: 3, grau: 'treinado', modificador: 0 })).toBe(5);
  });

  it('CD de classe: nível 1, treinado, atributo-chave +4 → 17', () => {
    expect(calcularCdClasse({ nivel: 1, grau: 'treinado', modificador: 4 })).toBe(17);
  });

  it('Percepção: nível 3, perito, Sabedoria +2 → +9', () => {
    expect(calcularPercepcao({ nivel: 3, grau: 'perito', modificador: 2 })).toBe(9);
  });
});

describe('defesas de PF2e — o limite de Destreza da armadura (F9)', () => {
  /**
   * Destreza +0..+5 × limite +0..+5, com o valor esperado escrito célula por
   * célula. A base é 13 (nível 1, treinado: 1 + 2, mais o 10) e o item é 0, então
   * cada célula é `13 + o que entrou da Destreza`.
   *
   * As linhas mostram os dois lados do teto: **abaixo** dele a Destreza entra
   * inteira (limite maior que a Destreza não a aumenta — é teto, não bônus) e
   * **acima** dele ela é cortada.
   */
  const CA_POR_DESTREZA_E_LIMITE: readonly (readonly number[])[] = [
    /* Des +0 */ [13, 13, 13, 13, 13, 13],
    /* Des +1 */ [13, 14, 14, 14, 14, 14],
    /* Des +2 */ [13, 14, 15, 15, 15, 15],
    /* Des +3 */ [13, 14, 15, 16, 16, 16],
    /* Des +4 */ [13, 14, 15, 16, 17, 17],
    /* Des +5 */ [13, 14, 15, 16, 17, 18],
  ];

  it('a tabela inteira: 6 modificadores × 6 tetos, inclusive teto maior que a Destreza', () => {
    for (const [destreza, esperados] of CA_POR_DESTREZA_E_LIMITE.entries()) {
      for (const [limiteDes, esperado] of esperados.entries()) {
        expect(
          calcularCa({
            nivel: 1,
            grau: 'treinado',
            modificadorDestreza: destreza,
            bonusItemArmadura: 0,
            limiteDes,
          }),
          `Destreza +${destreza} com teto +${limiteDes}`,
        ).toBe(esperado);
      }
    }
  });

  it('teto ausente é diferente de teto zero — e é o caso de quem não veste armadura', () => {
    // A borda do card: sem limite informado, a Destreza entra inteira. Tratar a
    // ausência como 0 apagaria a Destreza de todo personagem sem armadura.
    expect(destrezaNaCa(4, null)).toBe(4);
    expect(destrezaNaCa(4, 0)).toBe(0);
    expect(
      calcularCa({
        nivel: 1,
        grau: 'treinado',
        modificadorDestreza: 4,
        bonusItemArmadura: 0,
        limiteDes: null,
      }),
    ).toBe(17);
  });

  it('Destreza negativa penaliza a CA, e o teto não a resgata', () => {
    expect(destrezaNaCa(-1, 5)).toBe(-1);
    expect(
      calcularCa({
        nivel: 1,
        grau: 'treinado',
        modificadorDestreza: -1,
        bonusItemArmadura: 0,
        limiteDes: 5,
      }),
    ).toBe(12);
  });

  it('destreinado em armadura não soma o nível: nível 20 sem armadura dá 10 + Destreza', () => {
    // A armadilha nº 1 do épico aplicada à CA. Se algum dia isto virar 30 + …,
    // toda CA de personagem destreinado inflou em silêncio.
    expect(
      calcularCa({
        nivel: 20,
        grau: 'destreinado',
        modificadorDestreza: 3,
        bonusItemArmadura: 0,
        limiteDes: null,
      }),
    ).toBe(13);
  });

  it('a ficha lê o teto gravado, e a ausência dele, sem confiar no formato', () => {
    expect(limiteDestrezaDe(fichaInicial())).toBeNull();
    expect(limiteDestrezaDe({ limiteDestrezaArmadura: 2 })).toBe(2);
    expect(limiteDestrezaDe({ limiteDestrezaArmadura: 'nenhum' })).toBeNull();
  });
});

describe('defesas de PF2e — salvaguardas nos cinco graus e três níveis', () => {
  /**
   * Os 15 bônus de proficiência escritos à mão (o modificador de atributo entra
   * depois, e é somado no próprio caso). Destreinado é **0 em todos os níveis** —
   * é a linha que não segue o padrão, e é a que o épico mais persegue.
   */
  const PROFICIENCIA: Record<GrauTreinamento, readonly [number, number, number]> = {
    destreinado: [0, 0, 0],
    treinado: [3, 12, 22],
    perito: [5, 14, 24],
    mestre: [7, 16, 26],
    lendario: [9, 18, 28],
  };
  const NIVEIS = [1, 10, 20] as const;

  it('cada grau em cada nível, com Constituição +2 somada por cima', () => {
    for (const grau of GRAUS_TREINAMENTO) {
      for (const [indice, nivel] of NIVEIS.entries()) {
        const esperado = (PROFICIENCIA[grau][indice] as number) + 2;
        expect(
          calcularSalvaguarda({ nivel, grau, modificador: 2 }),
          `${grau} no nível ${nivel}`,
        ).toBe(esperado);
      }
    }
  });

  it('as três salvaguardas saem de Constituição, Destreza e Sabedoria', () => {
    expect(SALVAGUARDAS_PF2E.map((s) => [s.chave, s.atributo])).toEqual([
      ['fortitude', 'constituicao'],
      ['reflexos', 'destreza'],
      ['vontade', 'sabedoria'],
    ]);
  });

  it('Percepção usa a mesma proficiência da salvaguarda — e é ela que o RV-158 vai chamar', () => {
    for (const grau of GRAUS_TREINAMENTO) {
      expect(calcularPercepcao({ nivel: 7, grau, modificador: 1 })).toBe(
        calcularSalvaguarda({ nivel: 7, grau, modificador: 1 }),
      );
    }
    // A âncora escrita à mão, para o par acima não passar por serem os dois
    // errados do mesmo jeito: nível 7, mestre (7 + 6) e Sabedoria +1.
    expect(calcularPercepcao({ nivel: 7, grau: 'mestre', modificador: 1 })).toBe(14);
  });
});

describe('defesas de PF2e — CD de classe não é CD simples', () => {
  it('os cinco graus no nível 1, com atributo-chave +4', () => {
    // 10 + (1 + 2/4/6/8) + 4, e o destreinado sem o nível: 10 + 0 + 4.
    expect(calcularCdClasse({ nivel: 1, grau: 'destreinado', modificador: 4 })).toBe(14);
    expect(calcularCdClasse({ nivel: 1, grau: 'treinado', modificador: 4 })).toBe(17);
    expect(calcularCdClasse({ nivel: 1, grau: 'perito', modificador: 4 })).toBe(19);
    expect(calcularCdClasse({ nivel: 1, grau: 'mestre', modificador: 4 })).toBe(21);
    expect(calcularCdClasse({ nivel: 1, grau: 'lendario', modificador: 4 })).toBe(23);
  });

  it('atributo-chave negativo desce a CD, sem piso inventado', () => {
    expect(calcularCdClasse({ nivel: 5, grau: 'treinado', modificador: -1 })).toBe(16);
    expect(calcularCdClasse({ nivel: 1, grau: 'destreinado', modificador: -5 })).toBe(5);
  });

  it('a CD de classe não é a CD simples do grau — as duas existem e são diferentes', () => {
    // `CDS_SIMPLES` é 10/15/20/30/40 e não olha o nível nem o atributo; a CD de
    // classe sai da ficha. Trocá-las dá um número plausível: no nível 1, treinado
    // e +4, a CD de classe é 17 e a simples do treinado é 15.
    expect(CDS_SIMPLES.treinado).toBe(15);
    expect(calcularCdClasse({ nivel: 1, grau: 'treinado', modificador: 4 })).not.toBe(
      CDS_SIMPLES.treinado,
    );
    // E o salto de 20 para 30 da tabela simples não aparece na CD de classe, que
    // cresce de 2 em 2 com o grau.
    expect(CDS_SIMPLES.mestre - CDS_SIMPLES.perito).toBe(10);
    expect(
      calcularCdClasse({ nivel: 1, grau: 'mestre', modificador: 0 }) -
        calcularCdClasse({ nivel: 1, grau: 'perito', modificador: 0 }),
    ).toBe(2);
  });

  it('sem atributo-chave informado a CD não é calculada, e a ficha diz o que falta', () => {
    const semAtributo = defesa(ficha(5, { carisma: 4 }), CHAVE_CD_CLASSE);
    expect(semAtributo.valor).toBeNull();
    expect(semAtributo.valorFormatado).toBe('—');
    expect(semAtributo.detalhe).toContain('Informe o atributo-chave da classe');
    expect(atributoChaveDaClasse(fichaInicial())).toBeNull();
  });

  it('informado o atributo-chave, a CD aparece e usa o modificador daquele atributo', () => {
    const comAtributo = defesa(
      ficha(
        1,
        { carisma: 4, forca: -1 },
        { grauCdClasse: 'treinado', atributoChaveClasse: 'carisma' },
      ),
      CHAVE_CD_CLASSE,
    );
    expect(comAtributo.valor).toBe(17);
    expect(comAtributo.detalhe).toContain('Carisma +4');
  });
});

describe('defesas de PF2e — a proficiência é a de `regras.ts`, e não uma segunda soma', () => {
  it('nenhuma defesa se afasta de `bonusProficiencia` em nenhum grau nem nível', () => {
    // Não é recálculo da implementação: é a amarra que o card pede. Se alguém
    // escrever `+ nivel` numa das quatro contas, ela passa a divergir de
    // `bonusProficiencia` e este laço fica vermelho nomeando o grau e o nível.
    for (const grau of GRAUS_TREINAMENTO) {
      for (const nivel of [1, 3, 11, 20]) {
        const proficiencia = bonusProficiencia(nivel, grau);
        expect(calcularSalvaguarda({ nivel, grau, modificador: 0 }), `${grau}/${nivel}`).toBe(
          proficiencia,
        );
        expect(calcularPercepcao({ nivel, grau, modificador: 0 }), `${grau}/${nivel}`).toBe(
          proficiencia,
        );
        expect(calcularCdClasse({ nivel, grau, modificador: 0 }), `${grau}/${nivel}`).toBe(
          BASE_DEFESA + proficiencia,
        );
        expect(
          calcularCa({
            nivel,
            grau,
            modificadorDestreza: 0,
            bonusItemArmadura: 0,
            limiteDes: null,
          }),
          `${grau}/${nivel}`,
        ).toBe(BASE_DEFESA + proficiencia);
      }
    }
  });
});

describe('defesas de PF2e — Percepção é defesa, não perícia', () => {
  it('Percepção está nas defesas e não na lista de perícias', () => {
    expect(DEFESAS_PF2E.map((d) => d.chave)).toContain(CHAVE_PERCEPCAO);
    expect(PERICIAS_PF2E.map((p) => p.chave)).not.toContain(CHAVE_PERCEPCAO);
    expect(SISTEMA_PATHFINDER2E.pericias.map((p) => p.chave)).not.toContain(CHAVE_PERCEPCAO);
  });

  it('as seis defesas aparecem na ordem de exibição, com CA primeiro', () => {
    expect(DEFESAS_PF2E.map((d) => d.chave)).toEqual([
      'ca',
      'fortitude',
      'reflexos',
      'vontade',
      'percepcao',
      'cdClasse',
    ]);
  });
});

describe('defesas de PF2e — o que se rola em um clique, e o que não se rola', () => {
  /** Seelah do card: Reflexos +6 e Percepção +9. */
  function seelah(): PersonagemCalculavel {
    // Nível 3: Reflexos treinado (3 + 2) com Destreza +1 → +6; Percepção perita
    // (3 + 4) com Sabedoria +2 → +9.
    return ficha(
      3,
      { destreza: 1, sabedoria: 2 },
      { grauReflexos: 'treinado', grauPercepcao: 'perito' },
    );
  }

  it('Reflexos e Percepção viram expressão e motivo prontos', () => {
    expect(defesa(seelah(), 'reflexos')).toMatchObject({
      valor: 6,
      valorFormatado: '+6',
      expressao: '1d20+6',
      motivo: 'Reflexos — Seelah',
      rolavel: true,
    });
    expect(defesa(seelah(), CHAVE_PERCEPCAO)).toMatchObject({
      valor: 9,
      valorFormatado: '+9',
      expressao: '1d20+9',
      motivo: 'Percepção — Seelah',
      rolavel: true,
    });
  });

  it('CA e CD de classe não se rolam — são números-alvo', () => {
    for (const chave of [CHAVE_CA, CHAVE_CD_CLASSE]) {
      const alvo = defesa(seelah(), chave);
      expect(alvo.rolavel, chave).toBe(false);
      expect(alvo.expressao, chave).toBeNull();
      expect(alvo.motivo, chave).toBeNull();
    }
  });

  it('o alvo é exibido sem sinal e a checagem com sinal', () => {
    // A CA é 13 (10 + 3 de treinado… não: destreinado aqui, então 10 + 0 + 1 de
    // Destreza = 11) e ela aparece como "11", não "+11": somar a CA a um d20 é
    // erro de mesa, e o formato é o primeiro aviso.
    expect(defesa(seelah(), CHAVE_CA).valorFormatado).toBe('11');
    expect(defesa(seelah(), 'vontade').valorFormatado).toBe('+2');
  });

  it('o detalhe explica a composição do número, em PT-BR', () => {
    const ca = defesa(
      ficha(
        3,
        { destreza: 4 },
        { grauArmadura: 'perito', bonusItemArmadura: 4, limiteDestrezaArmadura: 1 },
      ),
      CHAVE_CA,
    );
    expect(ca.valor).toBe(22);
    expect(ca.detalhe).toBe('10 + proficiência +7 + Destreza +1 (teto +1 da armadura) + item +4');
  });

  it('sem limite informado, o detalhe diz isso em texto — não só some do cálculo', () => {
    // A borda do card exige que a interface **marque o campo como não informado**,
    // e a frase é do sistema para que a tela não a redija por conta própria.
    const ca = defesa(ficha(1, { destreza: 4 }), CHAVE_CA);
    expect(ca.detalhe).toContain('armadura sem limite informado');
    expect(ca.detalhe).toContain('Destreza +4');
  });

  it('sistema sem defesas devolve lista vazia, e a tela não desenha nada', () => {
    for (const sistema of ['dnd5e', 'generico'] as const) {
      expect(
        defesasDoPersonagem(
          {
            sistema,
            nivel: 3,
            atributos: atributosIniciais(sistema),
            dados: dadosIniciaisDaFicha(sistema),
          },
          'Thorin',
        ),
      ).toEqual([]);
    }
  });
});

describe('defesas de PF2e — o grau vem da ficha, com destreinado como piso', () => {
  it('cada defesa tem a sua chave de grau em `dados`, e a da CA é a da armadura', () => {
    expect(chaveDoGrauDaDefesa(CHAVE_CA)).toBe('grauArmadura');
    expect(chaveDoGrauDaDefesa('fortitude')).toBe('grauFortitude');
    expect(chaveDoGrauDaDefesa(CHAVE_CD_CLASSE)).toBe('grauCdClasse');
    for (const d of DEFESAS_PF2E) {
      expect(chaveDoGrauDaDefesa(d.chave) in fichaInicial(), d.chave).toBe(true);
    }
  });

  it('grau ausente ou estragado vale destreinado, e não o grau mais alto', () => {
    expect(grauDaDefesa({}, 'fortitude')).toBe('destreinado');
    expect(grauDaDefesa({ grauFortitude: 'genial' }, 'fortitude')).toBe('destreinado');
    expect(grauDaDefesa({ grauFortitude: 'lendario' }, 'fortitude')).toBe('lendario');
  });

  it('trocar o grau na ficha muda o número derivado, sem gravar o número', () => {
    const antes = defesa(ficha(5, { sabedoria: 2 }), CHAVE_PERCEPCAO);
    const depois = defesa(ficha(5, { sabedoria: 2 }, { grauPercepcao: 'mestre' }), CHAVE_PERCEPCAO);
    expect(antes.valor).toBe(2);
    expect(depois.valor).toBe(13);
  });
});

describe('defesas de PF2e — o schema cobra as faixas dos campos informados', () => {
  function erroAoSalvar(dados: DadosFicha): string {
    const r = validarDadosDaFicha('pathfinder2e', dados);
    expect(r.ok, `a ficha aceitou ${JSON.stringify(dados)}`).toBe(false);
    return r.ok ? '' : r.erro;
  }

  it('grau de defesa inválido é recusado em PT-BR', () => {
    expect(erroAoSalvar({ ...fichaInicial(), grauFortitude: 'quase-treinado' })).toContain(
      'Grau de treinamento inválido',
    );
  });

  it('bônus de item e limite de Destreza fora da faixa são recusados nomeando o campo', () => {
    expect(erroAoSalvar({ ...fichaInicial(), bonusItemArmadura: BONUS_ITEM_MAXIMO + 1 })).toContain(
      'Bônus de item da armadura',
    );
    expect(
      erroAoSalvar({ ...fichaInicial(), limiteDestrezaArmadura: LIMITE_DESTREZA_MAXIMO + 1 }),
    ).toContain('Limite de Destreza');
    expect(erroAoSalvar({ ...fichaInicial(), limiteDestrezaArmadura: -1 })).toContain(
      'Limite de Destreza',
    );
  });

  it('o campo de limite esvaziado na interface vira ausência, e não 400', () => {
    // A interface manda `''` quando o jogador limpa um campo numérico. Para o
    // limite de Destreza isso é a resposta normal da regra ("esta armadura não
    // limita"), e recusá-la obrigaria a digitar um número que não existe.
    const r = validarDadosDaFicha('pathfinder2e', {
      ...fichaInicial(),
      limiteDestrezaArmadura: '',
    });
    expect(r.ok).toBe(true);
    expect(r.ok && r.dados['limiteDestrezaArmadura']).toBeNull();
  });

  it('atributo-chave fora dos seis é recusado, e vazio é aceito como "não informado"', () => {
    expect(erroAoSalvar({ ...fichaInicial(), atributoChaveClasse: 'sorte' })).toContain(
      'Atributo-chave',
    );
    for (const valor of [SEM_ATRIBUTO_CHAVE, ...ATRIBUTOS]) {
      expect(
        validarDadosDaFicha('pathfinder2e', { ...fichaInicial(), atributoChaveClasse: valor }).ok,
        `atributoChaveClasse = "${valor}"`,
      ).toBe(true);
    }
  });
});

describe('defesas de PF2e — o PV continua tendo uma casa só', () => {
  it('o PV sugerido é ancestralidade + nível × (classe + Constituição)', () => {
    // Uma anã guerreira de nível 3, Constituição +3: 10 de ancestralidade e 10 de
    // classe por nível → 10 + 3 × 13 = 49.
    expect(
      pvSugerido({
        nivel: 3,
        pvDaAncestralidade: 10,
        pvDaClassePorNivel: 10,
        modificadorConstituicao: 3,
      }),
    ).toBe(49);
    // Nível 1, ancestralidade 8, classe 8, Constituição +2 → 8 + 10 = 18.
    expect(
      pvSugerido({
        nivel: 1,
        pvDaAncestralidade: 8,
        pvDaClassePorNivel: 8,
        modificadorConstituicao: 2,
      }),
    ).toBe(18);
  });

  it('nunca sugere PV negativo', () => {
    expect(
      pvSugerido({
        nivel: 4,
        pvDaAncestralidade: 0,
        pvDaClassePorNivel: 0,
        modificadorConstituicao: -3,
      }),
    ).toBe(0);
  });

  it('a sugestão é derivada: subir de nível a atualiza sem escrever nada na ficha', () => {
    const dados = { pvDaAncestralidade: 8, pvDaClassePorNivel: 8, modificadorConstituicao: 99 };
    const nivel1 = { nivel: 1, atributos: comModificadores({}), dados };
    const nivel2 = { nivel: 2, atributos: comModificadores({}), dados };

    expect(pvSugeridoDaFicha(nivel1, 2)).toBe(18);
    expect(pvSugeridoDaFicha(nivel2, 2)).toBe(28);
    // A chave `modificadorConstituicao` acima é lixo de propósito: a Constituição
    // chega pela **escala do sistema**, e não de um campo da ficha. Se algum dia a
    // função passar a ler `dados`, o 99 aparece no número e este teste explode.
    expect(pvSugeridoDaFicha(nivel1, 2)).not.toBe(107);
  });

  it('a ficha de PF2e não declara campo nenhum que guarde o PV do personagem', () => {
    // O guarda que o card pede. O PV do personagem são as colunas comuns
    // `pvAtual`/`pvMax` do `PersonagemDTO`, que alimentam a barra sobre o token
    // (RV-042). Uma segunda casa aqui — inclusive um `pvSugerido` **gravado** —
    // é o defeito de duas verdades que o RV-098 fechou para o atributo: a ficha
    // subiria de nível e o número gravado continuaria o de antes.
    //
    // `pvDaAncestralidade` e `pvDaClassePorNivel` **não** são PV de ninguém: são
    // constantes da ancestralidade e da classe (quanto cada uma concede),
    // informadas à mão até o catálogo do RV-157, exatamente como o bônus de item
    // da armadura. Elas alimentam a sugestão; não a substituem.
    const guardaPvDoPersonagem =
      /^(pv|pvatual|pvmax|pvmaximo|pvtotal|pvsugerido|pontosdevida|vida|vidaatual|vidamax)$/i;

    const chaves = [
      ...new Set([
        ...Object.keys(fichaInicial()),
        ...SISTEMA_PATHFINDER2E.secoes.flatMap((s) => s.campos.map((c) => c.chave)),
      ]),
    ];
    const suspeitos = chaves.filter((chave) => guardaPvDoPersonagem.test(chave));

    expect(
      suspeitos,
      `A ficha de PF2e declara campo(s) de PV do personagem: ${suspeitos.join(', ')}. ` +
        `O PV tem uma casa só — as colunas comuns \`pvAtual\`/\`pvMax\` —, e a sugestão ` +
        `da regra é **derivada** por \`pvSugerido\`, nunca gravada.`,
    ).toEqual([]);
  });

  it('nenhum número derivado é campo da ficha', () => {
    // A mesma disciplina para as defesas: `ca`, `fortitude`, … não existem em
    // `dados`. Gravá-las daria uma CA que não acompanha o nível.
    const inicial = fichaInicial();
    for (const chave of [...DEFESAS_PF2E.map((d) => d.chave), CHAVE_PV_SUGERIDO]) {
      expect(chave in inicial, `\`dados.${chave}\` é derivado e não pode ser gravado`).toBe(false);
    }
    expect(CAMPOS_DEFESAS.map((c) => c.chave)).not.toContain(CHAVE_CA);
    expect(CAMPOS_DEFESAS.map((c) => c.chave)).not.toContain(CHAVE_PV_SUGERIDO);
  });

  it('a sugestão aparece na lista da ficha, dizendo que o PV que vale é o outro', () => {
    const anao = defesa(
      ficha(3, { constituicao: 3 }, { pvDaAncestralidade: 10, pvDaClassePorNivel: 10 }),
      CHAVE_PV_SUGERIDO,
    );
    expect(anao.valor).toBe(49);
    expect(anao.valorFormatado).toBe('49');
    expect(anao.rolavel, 'PV não se rola').toBe(false);
    expect(anao.detalhe).toContain('10 da ancestralidade');
    expect(anao.detalhe).toContain('Constituição +3');
    expect(anao.detalhe).toContain('o PV que vale é o PV máx.');
  });

  it('ficha sem as entradas de PV não sugere zero — diz o que falta', () => {
    // "PV máximo sugerido: 0" numa ficha nova parece resultado, e não ausência.
    const nova = defesa(ficha(1, {}), CHAVE_PV_SUGERIDO);
    expect(nova.valor).toBeNull();
    expect(nova.valorFormatado).toBe('—');
    expect(nova.detalhe).toContain('Informe o PV da ancestralidade');
  });
});
