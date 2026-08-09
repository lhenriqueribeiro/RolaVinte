import { describe, expect, it } from 'vitest';
import { Cena } from './cena';
import { MENSAGEM_COR_TOKEN, MENSAGEM_NOME_TOKEN, Token } from './token';

const CENA_ID = 'cena-1';
const OUTRA_CENA_ID = 'cena-2';

function cena(id = CENA_ID, largura = 20, altura = 15): Cena {
  const criada = Cena.criar({
    id,
    mesaId: 'mesa-1',
    nome: 'Cripta',
    larguraGrid: largura,
    alturaGrid: altura,
    corFundo: '#1a2332',
    tamanhoCelula: 44,
    gridVisivel: true,
    corGrid: '#3a4a63',
  });
  if (!criada.ok) throw new Error(criada.erro.mensagem);
  return criada.valor;
}

function token(
  parcial: Partial<{ nome: string; cor: string; x: number; y: number; personagemId: string }> = {},
  mapa = cena(),
): Token {
  const criado = Token.criar({
    id: 'token-1',
    cena: mapa,
    cenaId: mapa.id,
    nome: parcial.nome ?? 'Gob1',
    cor: parcial.cor ?? '#e74c3c',
    x: parcial.x ?? 2,
    y: parcial.y ?? 3,
    personagemId: parcial.personagemId ?? null,
  });
  if (!criado.ok) throw new Error(criado.erro.mensagem);
  return criado.valor;
}

describe('Token.criar', () => {
  it('nasce sem arte, com nome trimado e na posição pedida', () => {
    const peca = token({ nome: '  Gob1  ', x: 4, y: 5 });

    expect(peca.nome).toBe('Gob1');
    expect(peca.x).toBe(4);
    expect(peca.y).toBe(5);
    // RV-041: o fallback (cor + iniciais) é o padrão — arte é opcional.
    expect(peca.imagemUrl).toBeNull();
    expect(peca.imagemCaminho).toBeNull();
  });

  it.each([
    ['vazio', ''],
    ['só espaços', '   '],
    ['61 caracteres', 'x'.repeat(61)],
  ])('recusa nome %s', (_caso, nome) => {
    const r = Token.criar({
      id: 'token-1',
      cena: cena(),
      cenaId: CENA_ID,
      nome,
      cor: '#e74c3c',
      x: 0,
      y: 0,
      personagemId: null,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('validacao');
    expect(r.erro.mensagem).toBe(MENSAGEM_NOME_TOKEN);
  });

  it('aceita nome com exatamente 60 caracteres', () => {
    expect(token({ nome: 'x'.repeat(60) }).nome).toHaveLength(60);
  });

  it.each(['vermelho', '#fff', '#12345g', ''])('recusa cor inválida %s', (cor) => {
    const r = Token.criar({
      id: 'token-1',
      cena: cena(),
      cenaId: CENA_ID,
      nome: 'Gob1',
      cor,
      x: 0,
      y: 0,
      personagemId: null,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.mensagem).toBe(MENSAGEM_COR_TOKEN);
  });

  it('recusa posição fora dos limites da cena', () => {
    const mapa = cena(CENA_ID, 10, 10);
    const r = Token.criar({
      id: 'token-1',
      cena: mapa,
      cenaId: mapa.id,
      nome: 'Gob1',
      cor: '#e74c3c',
      x: 10,
      y: 0,
      personagemId: null,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.mensagem).toBe('Posição fora dos limites da cena.');
  });
});

describe('Token.renomear / recolorir (RV-040)', () => {
  it('renomeia trimando e sem tocar na cor', () => {
    const peca = token({ nome: 'Gob1', cor: '#e74c3c' });

    const r = peca.renomear('  Chefe Goblin  ');

    expect(r.ok).toBe(true);
    expect(peca.nome).toBe('Chefe Goblin');
    expect(peca.cor).toBe('#e74c3c');
  });

  it('recolore sem tocar no nome', () => {
    const peca = token({ nome: 'Gob1' });

    const r = peca.recolorir('#2ecc71');

    expect(r.ok).toBe(true);
    expect(peca.cor).toBe('#2ecc71');
    expect(peca.nome).toBe('Gob1');
  });

  it.each([
    ['vazio', ''],
    ['61 caracteres', 'x'.repeat(61)],
  ])('recusa renomear para nome %s com as mesmas regras da criação', (_caso, nome) => {
    const peca = token({ nome: 'Gob1' });

    const r = peca.renomear(nome);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('validacao');
    expect(r.erro.mensagem).toBe(MENSAGEM_NOME_TOKEN);
    expect(peca.nome).toBe('Gob1');
  });

  it('recusa cor inválida e mantém a anterior', () => {
    const peca = token({ cor: '#e74c3c' });

    const r = peca.recolorir('roxo');

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.mensagem).toBe(MENSAGEM_COR_TOKEN);
    expect(peca.cor).toBe('#e74c3c');
  });
});

describe('Token.atualizar (edição parcial)', () => {
  it('altera só o que foi informado', () => {
    const peca = token({ nome: 'Gob1', cor: '#e74c3c' });

    expect(peca.atualizar({ nome: 'Chefe Goblin' }).ok).toBe(true);
    expect(peca.cor).toBe('#e74c3c');

    expect(peca.atualizar({ cor: '#2ecc71' }).ok).toBe(true);
    expect(peca.nome).toBe('Chefe Goblin');
  });

  it('entrada inválida não deixa metade da alteração aplicada', () => {
    const peca = token({ nome: 'Gob1', cor: '#e74c3c' });

    const r = peca.atualizar({ nome: 'Chefe Goblin', cor: 'roxo' });

    expect(r.ok).toBe(false);
    expect(peca.nome).toBe('Gob1');
    expect(peca.cor).toBe('#e74c3c');
  });

  it('objeto vazio é uma edição válida que não muda nada', () => {
    const peca = token({ nome: 'Gob1', cor: '#e74c3c' });

    expect(peca.atualizar({}).ok).toBe(true);
    expect(peca.nome).toBe('Gob1');
    expect(peca.cor).toBe('#e74c3c');
  });
});

describe('Token.definirImagem (RV-041)', () => {
  it('devolve null na primeira arte e o caminho anterior na troca', () => {
    const peca = token();

    expect(peca.definirImagem('https://cdn/a.png', 'tokens/token-1/a.png')).toBeNull();
    expect(peca.imagemUrl).toBe('https://cdn/a.png');

    const anterior = peca.definirImagem('https://cdn/b.webp', 'tokens/token-1/b.webp');

    expect(anterior).toBe('tokens/token-1/a.png');
    expect(peca.imagemUrl).toBe('https://cdn/b.webp');
    expect(peca.imagemCaminho).toBe('tokens/token-1/b.webp');
  });

  it('não interfere na cor: a borda continua sendo a cor definida', () => {
    const peca = token({ cor: '#2ecc71' });

    peca.definirImagem('https://cdn/a.png', 'tokens/token-1/a.png');

    expect(peca.cor).toBe('#2ecc71');
  });
});

describe('Token.mover (regras inalteradas pelo RV-040)', () => {
  it('move dentro dos limites', () => {
    const mapa = cena();
    const peca = token({}, mapa);

    const r = peca.mover(7, 9, mapa);

    expect(r.ok).toBe(true);
    expect([peca.x, peca.y]).toEqual([7, 9]);
  });

  it('recusa cena que não é a do token', () => {
    const peca = token({}, cena());

    const r = peca.mover(1, 1, cena(OUTRA_CENA_ID));

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.mensagem).toBe('Token não pertence a esta cena.');
  });

  it.each([
    [20, 0],
    [0, 15],
    [-1, 0],
  ])('recusa posição (%i, %i) fora do grid', (x, y) => {
    const mapa = cena(CENA_ID, 20, 15);
    const peca = token({ x: 2, y: 3 }, mapa);

    const r = peca.mover(x, y, mapa);

    expect(r.ok).toBe(false);
    expect([peca.x, peca.y]).toEqual([2, 3]);
  });

  it('mover não mexe em nome, cor nem arte', () => {
    const mapa = cena();
    const peca = token({ nome: 'Gob1', cor: '#e74c3c' }, mapa);
    peca.definirImagem('https://cdn/a.png', 'tokens/token-1/a.png');

    expect(peca.mover(1, 1, mapa).ok).toBe(true);

    expect(peca.nome).toBe('Gob1');
    expect(peca.cor).toBe('#e74c3c');
    expect(peca.imagemUrl).toBe('https://cdn/a.png');
  });
});
