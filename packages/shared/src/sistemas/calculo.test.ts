import { describe, expect, it } from 'vitest';
import type { Atributos } from '../schemas/personagens';
import { bonusProficienciaDnd5e } from './dnd5e';
import {
  bonusPericia,
  definirGrauDePericia,
  expressaoDePericia,
  formatarBonus,
  grauDePericia,
  motivoDeRolagemDePericia,
  periciasDoSistema,
  type PersonagemCalculavel,
} from './calculo';
import { dadosIniciaisDaFicha } from './registro';

/** Perícias e proficiência (RV-090) — tudo puro, sem banco e sem React. */

function atributos(campos: Partial<Atributos> = {}): Atributos {
  return {
    forca: 10,
    destreza: 10,
    constituicao: 10,
    inteligencia: 10,
    sabedoria: 10,
    carisma: 10,
    ...campos,
  };
}

function personagemDnd5e(
  campos: Partial<Omit<PersonagemCalculavel, 'sistema'>> = {},
): PersonagemCalculavel {
  return {
    sistema: 'dnd5e',
    nivel: 1,
    atributos: atributos(),
    dados: dadosIniciaisDaFicha('dnd5e'),
    ...campos,
  };
}

/** Marca a perícia como proficiente sem que o teste saiba onde o grau é gravado. */
function comProficiencia(
  personagem: PersonagemCalculavel,
  pericia: string,
  grau = 'proficiente',
): PersonagemCalculavel {
  return {
    ...personagem,
    dados: definirGrauDePericia(personagem.sistema, personagem.dados, pericia, grau),
  };
}

describe('bonusProficienciaDnd5e — tabela de níveis 1 a 20', () => {
  const esperado: [number, number][] = [
    [1, 2],
    [4, 2],
    [5, 3],
    [8, 3],
    [9, 4],
    [12, 4],
    [13, 5],
    [16, 5],
    [17, 6],
    [20, 6],
  ];

  it.each(esperado)('nível %i → +%i', (nivel, bonus) => {
    expect(bonusProficienciaDnd5e(nivel)).toBe(bonus);
  });

  it('nunca sobe nem desce fora da faixa jogável', () => {
    for (let nivel = 1; nivel <= 20; nivel += 1) {
      const b = bonusProficienciaDnd5e(nivel);
      expect(b).toBeGreaterThanOrEqual(2);
      expect(b).toBeLessThanOrEqual(6);
    }
  });
});

describe('bonusPericia — o cenário do card', () => {
  it('destreza 16 (+3), proficiência +2 e Furtividade proficiente → +5', () => {
    const thorin = comProficiencia(
      personagemDnd5e({ nivel: 3, atributos: atributos({ destreza: 16 }) }),
      'furtividade',
    );

    expect(bonusPericia(thorin, 'furtividade')).toBe(5);
  });

  it('sem proficiência, o bônus é apenas o modificador de destreza', () => {
    const thorin = personagemDnd5e({ nivel: 3, atributos: atributos({ destreza: 16 }) });

    expect(bonusPericia(thorin, 'furtividade')).toBe(3);
    expect(grauDePericia(thorin, 'furtividade')).toBe('destreinado');
  });

  it('especialista dobra o bônus de proficiência', () => {
    const bardo = comProficiencia(
      personagemDnd5e({ nivel: 5, atributos: atributos({ carisma: 18 }) }),
      'persuasao',
      'especialista',
    );

    // +4 de Carisma 18, +3 de proficiência no nível 5, dobrado → +10.
    expect(bonusPericia(bardo, 'persuasao')).toBe(10);
  });
});

describe('bonusPericia — atributo par, ímpar e extremos', () => {
  const casos: [number, number][] = [
    [1, -5],
    [8, -1],
    [9, -1],
    [10, 0],
    [11, 0],
    [14, 2],
    [15, 2],
    [20, 5],
    [30, 10],
  ];

  it.each(casos)('destreza %i sem proficiência → %i', (valor, modificador) => {
    const p = personagemDnd5e({ atributos: atributos({ destreza: valor }) });
    expect(bonusPericia(p, 'furtividade')).toBe(modificador);
  });

  it.each(casos)('destreza %i com proficiência no nível 1 → %i + 2', (valor, modificador) => {
    const p = comProficiencia(
      personagemDnd5e({ atributos: atributos({ destreza: valor }) }),
      'furtividade',
    );
    expect(bonusPericia(p, 'furtividade')).toBe(modificador + 2);
  });

  it('proficiente no nível 20 soma +6', () => {
    const p = comProficiencia(
      personagemDnd5e({ nivel: 20, atributos: atributos({ destreza: 20 }) }),
      'furtividade',
    );
    expect(bonusPericia(p, 'furtividade')).toBe(5 + 6);
  });
});

describe('bonusPericia — sistema sem perícias e perícia inexistente', () => {
  it('a ficha genérica não inventa perícia nenhuma', () => {
    expect(periciasDoSistema('generico')).toHaveLength(0);
    const p: PersonagemCalculavel = {
      sistema: 'generico',
      nivel: 1,
      atributos: atributos({ destreza: 18 }),
      dados: dadosIniciaisDaFicha('generico'),
    };

    expect(bonusPericia(p, 'furtividade')).toBeNull();
    expect(expressaoDePericia(p, 'furtividade')).toBeNull();
    expect(motivoDeRolagemDePericia('generico', 'furtividade', 'Thorin')).toBeNull();
  });

  it('perícia que o sistema não conhece devolve null, não zero', () => {
    // Zero seria pior que null: a rolagem sairia "1d20+0" como se fosse legítima.
    expect(bonusPericia(personagemDnd5e(), 'pilotagem-de-nave')).toBeNull();
  });
});

describe('expressão e motivo da rolagem de perícia', () => {
  it('monta 1d20+5 para a Furtividade do cenário do card', () => {
    const thorin = comProficiencia(
      personagemDnd5e({ nivel: 3, atributos: atributos({ destreza: 16 }) }),
      'furtividade',
    );

    expect(expressaoDePericia(thorin, 'furtividade')).toBe('1d20+5');
    expect(motivoDeRolagemDePericia('dnd5e', 'furtividade', 'Thorin')).toBe('Furtividade — Thorin');
  });

  it('bônus negativo entra com sinal de menos, e zero com sinal de mais', () => {
    const desastrado = personagemDnd5e({ atributos: atributos({ destreza: 6 }) });
    expect(expressaoDePericia(desastrado, 'furtividade')).toBe('1d20-2');

    const mediano = personagemDnd5e();
    expect(expressaoDePericia(mediano, 'furtividade')).toBe('1d20+0');
    expect(formatarBonus(0)).toBe('+0');
  });
});

describe('definirGrauDePericia — pura e tolerante a entrada estranha', () => {
  it('não muta os dados originais', () => {
    const dados = dadosIniciaisDaFicha('dnd5e');
    const copia = structuredClone(dados);

    definirGrauDePericia('dnd5e', dados, 'furtividade', 'proficiente');

    expect(dados).toEqual(copia);
  });

  it('grau desconhecido não entra na ficha', () => {
    const dados = definirGrauDePericia(
      'dnd5e',
      dadosIniciaisDaFicha('dnd5e'),
      'furtividade',
      'lenda',
    );

    expect(grauDePericia({ ...personagemDnd5e(), dados }, 'furtividade')).toBe('destreinado');
  });

  it('perícia desconhecida não cria chave nova', () => {
    const inicial = dadosIniciaisDaFicha('dnd5e');
    const dados = definirGrauDePericia('dnd5e', inicial, 'pilotagem-de-nave', 'proficiente');

    expect(dados).toEqual(inicial);
  });
});
