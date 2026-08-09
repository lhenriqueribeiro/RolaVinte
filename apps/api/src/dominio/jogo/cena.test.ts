import { describe, expect, it } from 'vitest';
import { MENSAGEM_TAMANHO_CELULA } from '@rolavinte/shared';
import { Cena, type DadosEditaveisCena } from './cena';

const MENSAGEM_GRID = 'Grid deve ter entre 5 e 100 células por lado.';

const PADRAO: DadosEditaveisCena = {
  nome: 'Cripta',
  larguraGrid: 25,
  alturaGrid: 15,
  corFundo: '#1a2332',
  tamanhoCelula: 44,
  gridVisivel: true,
  corGrid: '#3a4a63',
};

function criar(sobrescritas: Partial<DadosEditaveisCena> = {}) {
  return Cena.criar({ id: 'cena-1', mesaId: 'mesa-1', ...PADRAO, ...sobrescritas });
}

/** Cena válida ou explosão — evita `if (!r.ok)` em todo teste de comportamento. */
function cenaValida(sobrescritas: Partial<DadosEditaveisCena> = {}): Cena {
  const r = criar(sobrescritas);
  if (!r.ok) throw new Error(r.erro.mensagem);
  return r.valor;
}

describe('Cena.criar', () => {
  it('nasce ativa, sem imagem de fundo e com o nome sem espaços nas pontas', () => {
    const cena = cenaValida({ nome: '  Taverna do Javali  ' });

    expect(cena.nome).toBe('Taverna do Javali');
    expect(cena.ativa).toBe(true);
    expect(cena.imagemFundoUrl).toBeNull();
    expect(cena.imagemFundoCaminho).toBeNull();
    expect(cena.tamanhoCelula).toBe(44);
    expect(cena.gridVisivel).toBe(true);
  });

  it('recusa nome vazio', () => {
    const r = criar({ nome: '   ' });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('validacao');
    expect(r.erro.mensagem).toBe('Nome da cena deve ter entre 1 e 80 caracteres.');
  });

  it.each([
    ['largura menor que 5', { larguraGrid: 4 }],
    ['largura maior que 100', { larguraGrid: 101 }],
    ['altura menor que 5', { alturaGrid: 4 }],
    ['altura maior que 100', { alturaGrid: 101 }],
    ['largura fracionada', { larguraGrid: 10.5 }],
  ])('recusa grid com %s', (_titulo, sobrescritas) => {
    const r = criar(sobrescritas);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('validacao');
    expect(r.erro.mensagem).toBe(MENSAGEM_GRID);
  });

  it.each([20, 44, 64, 200])('aceita tamanho de célula %i', (tamanhoCelula) => {
    expect(cenaValida({ tamanhoCelula }).tamanhoCelula).toBe(tamanhoCelula);
  });

  it.each([5, 19, 201, 1000, 44.5])('recusa tamanho de célula %s', (tamanhoCelula) => {
    const r = criar({ tamanhoCelula });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('validacao');
    // O mesmo texto que o schema Zod devolve na borda HTTP (RV-033).
    expect(r.erro.mensagem).toBe(MENSAGEM_TAMANHO_CELULA);
  });

  it.each([
    ['cor de fundo', { corFundo: 'azul' }, 'Cor de fundo inválida.'],
    ['cor do grid', { corGrid: '#12345' }, 'Cor do grid inválida.'],
  ])('recusa %s fora do formato hexadecimal', (_titulo, sobrescritas, mensagem) => {
    const r = criar(sobrescritas);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.mensagem).toBe(mensagem);
  });
});

describe('Cena.atualizar', () => {
  it('altera só o que foi informado', () => {
    const cena = cenaValida();

    const r = cena.atualizar({ nome: 'Cripta Inferior', tamanhoCelula: 64 });

    expect(r.ok).toBe(true);
    expect(cena.nome).toBe('Cripta Inferior');
    expect(cena.tamanhoCelula).toBe(64);
    expect(cena.larguraGrid).toBe(25);
    expect(cena.corFundo).toBe('#1a2332');
    expect(cena.gridVisivel).toBe(true);
  });

  it('permite ocultar o grid sem mexer no tamanho da célula', () => {
    const cena = cenaValida();

    expect(cena.atualizar({ gridVisivel: false }).ok).toBe(true);
    expect(cena.gridVisivel).toBe(false);
    expect(cena.tamanhoCelula).toBe(44);
  });

  it('recusa tamanho de célula fora dos limites e não altera o estado', () => {
    const cena = cenaValida();

    const r = cena.atualizar({ nome: 'Novo nome', tamanhoCelula: 5 });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.mensagem).toBe(MENSAGEM_TAMANHO_CELULA);
    expect(cena.nome).toBe('Cripta');
    expect(cena.tamanhoCelula).toBe(44);
  });
});

describe('Cena — ativação e imagem de fundo', () => {
  it('desativa e reativa a cena', () => {
    const cena = cenaValida();

    cena.desativar();
    expect(cena.ativa).toBe(false);
    cena.ativar();
    expect(cena.ativa).toBe(true);
  });

  it('devolve null na primeira imagem e o caminho anterior na troca', () => {
    const cena = cenaValida();

    const primeira = cena.definirImagemFundo('https://cdn/1.png', 'cenas/cena-1/1.png');
    expect(primeira).toBeNull();
    expect(cena.imagemFundoUrl).toBe('https://cdn/1.png');

    const segunda = cena.definirImagemFundo('https://cdn/2.webp', 'cenas/cena-1/2.webp');
    expect(segunda).toBe('cenas/cena-1/1.png');
    expect(cena.imagemFundoCaminho).toBe('cenas/cena-1/2.webp');
  });
});

describe('Cena.contemPosicao', () => {
  it('aceita a última célula e recusa a seguinte', () => {
    const cena = cenaValida({ larguraGrid: 25, alturaGrid: 15 });

    expect(cena.contemPosicao(24, 14)).toBe(true);
    expect(cena.contemPosicao(25, 14)).toBe(false);
    expect(cena.contemPosicao(-1, 0)).toBe(false);
  });
});

describe('Cena.reduziriaGrid (RV-036)', () => {
  const cena = () => cenaValida({ larguraGrid: 40, alturaGrid: 30 });

  it.each([
    ['largura menor', { larguraGrid: 20 }],
    ['altura menor', { alturaGrid: 10 }],
    ['os dois lados menores', { larguraGrid: 20, alturaGrid: 10 }],
    ['um lado cresce e o outro encolhe', { larguraGrid: 100, alturaGrid: 10 }],
  ])('reconhece redução quando %s', (_titulo, pedidas) => {
    expect(cena().reduziriaGrid(pedidas)).toBe(true);
  });

  it.each([
    ['PATCH sem dimensão nenhuma', {}],
    ['mesmo tamanho', { larguraGrid: 40, alturaGrid: 30 }],
    ['aumento nos dois lados', { larguraGrid: 60, alturaGrid: 50 }],
  ])('não vê redução em %s', (_titulo, pedidas) => {
    expect(cena().reduziriaGrid(pedidas)).toBe(false);
  });
});

describe('Cena.posicoesForaDoGrid (RV-036)', () => {
  const cena = () => cenaValida({ larguraGrid: 40, alturaGrid: 30 });

  it('acusa as peças que ficariam fora quando o grid encolhe', () => {
    const tokens = [
      { id: 'dentro', x: 19, y: 19 },
      { id: 'fora-x', x: 35, y: 10 },
      { id: 'fora-y', x: 2, y: 25 },
    ];

    const fora = cena().posicoesForaDoGrid({ larguraGrid: 20, alturaGrid: 20 }, tokens);

    // Devolve as próprias peças, não só a contagem: quem chama decide o que dizer.
    expect(fora.map((t) => t.id)).toEqual(['fora-x', 'fora-y']);
  });

  it('não acusa ninguém quando o mapa está vazio', () => {
    expect(cena().posicoesForaDoGrid({ larguraGrid: 5, alturaGrid: 5 }, [])).toEqual([]);
  });

  it('não acusa ninguém quando todas as peças cabem no novo tamanho', () => {
    const tokens = [
      { x: 0, y: 0 },
      { x: 19, y: 19 },
    ];

    expect(cena().posicoesForaDoGrid({ larguraGrid: 20, alturaGrid: 20 }, tokens)).toEqual([]);
  });

  it('usa a mesma régua de contemPosicao: a última célula cabe, a seguinte não', () => {
    const tokens = [
      { id: 'ultima', x: 19, y: 19 },
      { id: 'seguinte', x: 20, y: 19 },
    ];

    const fora = cena().posicoesForaDoGrid({ larguraGrid: 20, alturaGrid: 20 }, tokens);

    expect(fora.map((t) => t.id)).toEqual(['seguinte']);
  });

  it('mede contra as dimensões atuais quando o PATCH informa só um lado', () => {
    const tokens = [{ id: 'alto', x: 2, y: 29 }];

    // Altura ausente = 30, que ainda comporta y=29; só a largura encolhe.
    expect(cena().posicoesForaDoGrid({ larguraGrid: 20 }, tokens)).toEqual([]);
    expect(
      cena()
        .posicoesForaDoGrid({ alturaGrid: 20 }, tokens)
        .map((t) => t.id),
    ).toEqual(['alto']);
  });

  it('não muda o estado da cena — a pergunta é hipotética', () => {
    const alvo = cena();

    alvo.posicoesForaDoGrid({ larguraGrid: 5, alturaGrid: 5 }, [{ x: 30, y: 20 }]);

    expect([alvo.larguraGrid, alvo.alturaGrid]).toEqual([40, 30]);
  });
});
