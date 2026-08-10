import { describe, expect, it } from 'vitest';
import {
  atributosIniciais,
  dadosIniciaisDaFicha,
  type Atributos,
  type SistemaRpg,
} from '@rolavinte/shared';
import { Personagem } from './personagem';

const MESA_ID = '00000000-0000-4000-9000-000000000001';

const ATRIBUTOS: Atributos = {
  forca: 16,
  destreza: 12,
  constituicao: 14,
  inteligencia: 10,
  sabedoria: 10,
  carisma: 8,
};

function criar(
  campos: Partial<Parameters<typeof Personagem.criar>[0]> = {},
  sistema: SistemaRpg = 'dnd5e',
) {
  return Personagem.criar(
    {
      id: 'p1',
      mesaId: MESA_ID,
      donoId: 'bruno',
      nome: 'Thorin',
      classe: 'Guerreiro',
      nivel: 3,
      pvMax: 30,
      atributos: ATRIBUTOS,
      anotacoes: '',
      ...campos,
    },
    sistema,
  );
}

function criarOuFalhar(
  campos: Partial<Parameters<typeof Personagem.criar>[0]> = {},
  sistema: SistemaRpg = 'dnd5e',
): Personagem {
  const r = criar(campos, sistema);
  if (!r.ok) throw new Error(r.erro.mensagem);
  return r.valor;
}

describe('Personagem — a ficha do sistema é validada, nunca aceita crua (RV-091)', () => {
  it('nasce com os padrões do sistema quando o cliente não manda dados', () => {
    const thorin = criarOuFalhar();

    expect(thorin.dados).toEqual(dadosIniciaisDaFicha('dnd5e'));
  });

  it('recusa campo fora da definição, nomeando o campo', () => {
    const r = criar({ dados: { pontos_de_heroismo: 3 } });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('validacao');
    expect(r.erro.mensagem).toContain('pontos_de_heroismo');
  });

  it('recusa valor fora da faixa do schema do sistema', () => {
    const r = criar({ dados: { ca: 999 } });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('validacao');
    expect(r.erro.mensagem).toContain('Classe de armadura');
  });

  it('a ficha genérica só aceita objeto vazio — é a ficha de sempre', () => {
    expect(criar({}, 'generico').ok).toBe(true);

    const r = criar({ dados: { ca: 15 } }, 'generico');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.mensagem).toContain('ca');
  });

  it('atualizar troca a ficha inteira, mas só depois de validá-la', () => {
    const thorin = criarOuFalhar();

    const bom = thorin.atualizar({ dados: { ...thorin.dados, ca: 18 } }, 'dnd5e');
    expect(bom.ok).toBe(true);
    expect(thorin.dados.ca).toBe(18);

    // A recusa não pode deixar o agregado meio atualizado: o nome também vinha
    // na mesma chamada e não pode ter entrado.
    const ruim = thorin.atualizar({ nome: 'Balin', dados: { inexistente: 1 } }, 'dnd5e');
    expect(ruim.ok).toBe(false);
    expect(thorin.nome).toBe('Thorin');
    expect(thorin.dados.ca).toBe(18);
  });

  it('atualizar sem `dados` não mexe na ficha do sistema', () => {
    const thorin = criarOuFalhar({ dados: { ...dadosIniciaisDaFicha('dnd5e'), ca: 17 } });

    const r = thorin.atualizar({ pvAtual: 10 }, 'dnd5e');

    expect(r.ok).toBe(true);
    expect(thorin.dados.ca).toBe(17);
  });
});

/**
 * O atributo tem uma casa só, e a escala é do sistema (RV-098).
 *
 * O defeito que estes testes trancam: a criação exigia `atributos`, gravava, e a
 * ficha de PF2e lia outro lugar. Quem informava Força 18 numa mesa de Pathfinder
 * via o valor desaparecer, e a perícia calculava como se fosse 0.
 */
describe('Personagem — a escala do atributo é do sistema (RV-098)', () => {
  it('o que é informado na criação é o que fica gravado', () => {
    const seelah = criarOuFalhar(
      { atributos: { ...atributosIniciais('pathfinder2e'), destreza: 4 } },
      'pathfinder2e',
    );

    expect(seelah.atributos.destreza).toBe(4);
    // E nada de modificador escondido dentro da ficha do sistema.
    expect('modificadorDestreza' in seelah.dados).toBe(false);
  });

  it('omitido nasce no padrão da escala daquele sistema, não num 10 fixo', () => {
    expect(criarOuFalhar({ atributos: undefined }, 'pathfinder2e').atributos).toEqual({
      forca: 0,
      destreza: 0,
      constituicao: 0,
      inteligencia: 0,
      sabedoria: 0,
      carisma: 0,
    });
    expect(criarOuFalhar({ atributos: undefined }, 'dnd5e').atributos.forca).toBe(10);
  });

  it('18 numa mesa de PF2e é recusado com o motivo e a escala em PT-BR', () => {
    // O cenário de borda do card: 18 é valor de d20 clássico, e a escala do PF2e
    // vai de -5 a +8.
    const r = criar(
      { atributos: { ...atributosIniciais('pathfinder2e'), forca: 18 } },
      'pathfinder2e',
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('validacao');
    expect(r.erro.mensagem).toContain('Força');
    expect(r.erro.mensagem).toContain('de -5 a +8');
  });

  it('o mesmo 18 é aceito em D&D 5e — a escala é por sistema', () => {
    expect(criarOuFalhar({ atributos: { ...ATRIBUTOS, forca: 18 } }).atributos.forca).toBe(18);
    expect(criar({ atributos: { ...ATRIBUTOS, forca: 31 } }).ok).toBe(false);
    expect(criar({ atributos: { ...ATRIBUTOS, forca: 0 } }).ok).toBe(false);
  });

  it('atualizar valida antes de mutar: a recusa não deixa o agregado meio editado', () => {
    const seelah = criarOuFalhar({ atributos: atributosIniciais('pathfinder2e') }, 'pathfinder2e');

    const bom = seelah.atualizar(
      { atributos: { ...atributosIniciais('pathfinder2e'), sabedoria: 3 } },
      'pathfinder2e',
    );
    expect(bom.ok).toBe(true);
    expect(seelah.atributos.sabedoria).toBe(3);

    const ruim = seelah.atualizar(
      { nome: 'Outra', atributos: { ...atributosIniciais('pathfinder2e'), sabedoria: 9 } },
      'pathfinder2e',
    );
    expect(ruim.ok).toBe(false);
    expect(seelah.nome).toBe('Thorin');
    expect(seelah.atributos.sabedoria).toBe(3);
  });

  it('atualizar sem `atributos` não mexe neles', () => {
    const seelah = criarOuFalhar(
      { atributos: { ...atributosIniciais('pathfinder2e'), forca: 2 } },
      'pathfinder2e',
    );

    expect(seelah.atualizar({ pvAtual: 10 }, 'pathfinder2e').ok).toBe(true);
    expect(seelah.atributos.forca).toBe(2);
  });
});

describe('Personagem — autorização de escrita é do agregado (RV-093)', () => {
  const NEGADO = 'só o dono ou o mestre';

  it('o dono pode', () => {
    expect(criarOuFalhar().autorizarEscrita('bruno', false, NEGADO).ok).toBe(true);
  });

  it('o mestre pode, mesmo não sendo dono', () => {
    expect(criarOuFalhar().autorizarEscrita('mestre', true, NEGADO).ok).toBe(true);
  });

  it('outro jogador não pode, e o erro é não-autorizado com a mensagem recebida', () => {
    const r = criarOuFalhar().autorizarEscrita('intruso', false, NEGADO);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('nao-autorizado');
    expect(r.erro.mensagem).toBe(NEGADO);
  });
});

describe('Personagem — duplicar (RV-093)', () => {
  it('cria id novo, nome sufixado, PV cheio e a mesma ficha de sistema', () => {
    const original = criarOuFalhar({ dados: { ...dadosIniciaisDaFicha('dnd5e'), ca: 18 } });
    original.atualizar({ pvAtual: 4 }, 'dnd5e');

    const r = original.duplicar('p2', 'dnd5e');

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const copia = r.valor;
    expect(copia.id).toBe('p2');
    expect(copia.nome).toBe('Thorin (cópia)');
    expect(copia.pvAtual).toBe(30);
    expect(copia.pvMax).toBe(30);
    expect(copia.classe).toBe('Guerreiro');
    expect(copia.nivel).toBe(3);
    expect(copia.dados).toEqual(original.dados);
    // O original não é tocado — nem o PV, nem o nome.
    expect(original.pvAtual).toBe(4);
    expect(original.nome).toBe('Thorin');
  });

  it('a cópia continua do dono do original, não de quem duplicou', () => {
    const r = criarOuFalhar({ donoId: 'bruno' }).duplicar('p2', 'dnd5e');

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.donoId).toBe('bruno');
  });

  it('a ficha da cópia é independente: editar uma não mexe na outra', () => {
    const original = criarOuFalhar();
    const r = original.duplicar('p2', 'dnd5e');
    if (!r.ok) throw new Error(r.erro.mensagem);

    r.valor.atualizar({ dados: { ...r.valor.dados, ca: 20 } }, 'dnd5e');

    expect(original.dados.ca).toBe(10);
    expect(r.valor.dados.ca).toBe(20);
  });

  it('nome longo é encurtado para caber no limite, em vez de a operação falhar', () => {
    // 60 caracteres — o máximo. Com " (cópia)" daria 68 e a validação recusaria
    // uma operação que o usuário não tem como consertar.
    const nomeCheio = 'A'.repeat(60);
    const r = criarOuFalhar({ nome: nomeCheio }).duplicar('p2', 'dnd5e');

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.nome).toHaveLength(60);
    expect(r.valor.nome.endsWith(' (cópia)')).toBe(true);
  });

  it('duplicar a cópia não estoura o limite nem perde o sufixo', () => {
    const primeira = criarOuFalhar({ nome: 'B'.repeat(58) }).duplicar('p2', 'dnd5e');
    if (!primeira.ok) throw new Error(primeira.erro.mensagem);

    const segunda = primeira.valor.duplicar('p3', 'dnd5e');

    expect(segunda.ok).toBe(true);
    if (!segunda.ok) return;
    expect(segunda.valor.nome.length).toBeLessThanOrEqual(60);
    expect(segunda.valor.nome.endsWith(' (cópia)')).toBe(true);
  });

  it('nomeDaCopia é pura e não corta nomes que já cabem', () => {
    expect(Personagem.nomeDaCopia('Goblin')).toBe('Goblin (cópia)');
    expect(Personagem.nomeDaCopia('  Goblin  ')).toBe('Goblin (cópia)');
  });
});

describe('Personagem — invariantes que já existiam continuam valendo', () => {
  it('nome curto demais é recusado', () => {
    const r = criar({ nome: 'A' });
    expect(r.ok).toBe(false);
  });

  it('PV máximo não positivo é recusado', () => {
    const r = criar({ pvMax: 0 });
    expect(r.ok).toBe(false);
  });

  it('PV atual acima do máximo é recusado', () => {
    const thorin = criarOuFalhar();
    const r = thorin.atualizar({ pvAtual: 31 }, 'dnd5e');
    expect(r.ok).toBe(false);
    expect(thorin.pvAtual).toBe(30);
  });

  it('reduzir o PV máximo puxa o PV atual junto', () => {
    const thorin = criarOuFalhar();
    thorin.atualizar({ pvMax: 10 }, 'dnd5e');
    expect(thorin.pvAtual).toBe(10);
  });

  it('nível fora de 1..20 é recusado', () => {
    expect(criarOuFalhar().atualizar({ nivel: 21 }, 'dnd5e').ok).toBe(false);
  });
});
