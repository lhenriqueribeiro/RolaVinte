import { describe, expect, it } from 'vitest';
import { dadosIniciaisDaFicha, type Atributos, type SistemaRpg } from '@rolavinte/shared';
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
