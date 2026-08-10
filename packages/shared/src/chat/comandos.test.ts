import { describe, expect, it } from 'vitest';
import { CD_MAXIMA, CD_MINIMA, cdValida, MENSAGEM_CD_INVALIDA } from './avaliacao';
import {
  COMANDOS_CHAT,
  comandoEhAviso,
  interpretarComando,
  listarUsosDeComandos,
  MENSAGEM_CD_AUSENTE,
  type ComandoChat,
} from './comandos';

/**
 * Tabela do parser (RV-074). Cada linha é uma coisa que alguém digita de
 * verdade; o esperado é o objeto inteiro, para que um campo a mais ou a menos
 * apareça aqui antes de aparecer na mesa.
 */
const CASOS: ReadonlyArray<[descricao: string, entrada: string, esperado: ComandoChat]> = [
  // ── fala: o padrão, e o que NÃO pode virar comando ──────────────────
  ['texto comum', 'boa noite, aventureiros', { tipo: 'fala', conteudo: 'boa noite, aventureiros' }],
  ['barra no meio da frase', 'e/ou tanto faz', { tipo: 'fala', conteudo: 'e/ou tanto faz' }],
  ['barra no fim', 'vamos lá /', { tipo: 'fala', conteudo: 'vamos lá /' }],
  [
    '# no meio de uma fala comum',
    'somos o grupo #1',
    { tipo: 'fala', conteudo: 'somos o grupo #1' },
  ],
  ['string vazia', '', { tipo: 'fala', conteudo: '' }],
  ['só espaços', '   \t ', { tipo: 'fala', conteudo: '' }],
  ['fala com espaços nas pontas', '  olá  ', { tipo: 'fala', conteudo: 'olá' }],

  // ── rolagem: aliases, caixa e motivo ────────────────────────────────
  ['/r', '/r 1d20', { tipo: 'rolagem', expressao: '1d20', motivo: '', cd: null }],
  ['/rolar', '/rolar 1d20', { tipo: 'rolagem', expressao: '1d20', motivo: '', cd: null }],
  ['/R maiúsculo', '/R 1d20', { tipo: 'rolagem', expressao: '1d20', motivo: '', cd: null }],
  ['/ROLAR maiúsculo', '/ROLAR 1d20', { tipo: 'rolagem', expressao: '1d20', motivo: '', cd: null }],
  [
    'motivo depois do #',
    '/r 2d6+3 # dano da espada',
    { tipo: 'rolagem', expressao: '2d6+3', motivo: 'dano da espada', cd: null },
  ],
  [
    'só o primeiro # separa',
    '/r 2d6 # dano # crítico',
    { tipo: 'rolagem', expressao: '2d6', motivo: 'dano # crítico', cd: null },
  ],
  [
    '# colado na expressão',
    '/r 4d6kh3#atributo',
    { tipo: 'rolagem', expressao: '4d6kh3', motivo: 'atributo', cd: null },
  ],
  [
    'tabulação como separador',
    '/r\t1d20+5',
    { tipo: 'rolagem', expressao: '1d20+5', motivo: '', cd: null },
  ],
  [
    'espaços sobrando',
    '  /r    1d20   ',
    { tipo: 'rolagem', expressao: '1d20', motivo: '', cd: null },
  ],

  // ── sufixo `cd N` (RV-154) ──────────────────────────────────────────
  // A CD é lida do fim da expressão e some dela: o que vai para o motor de
  // dados é `1d20+11`, e o grau de sucesso é apurado com o 18.
  [
    'cd depois da expressão',
    '/r 1d20+11 cd 18',
    { tipo: 'rolagem', expressao: '1d20+11', motivo: '', cd: 18 },
  ],
  ['CD maiúsculo', '/r 1d20 CD 20', { tipo: 'rolagem', expressao: '1d20', motivo: '', cd: 20 }],
  [
    'cd antes do motivo',
    '/r 1d20+7 cd 22 # salvaguarda de Reflexos',
    { tipo: 'rolagem', expressao: '1d20+7', motivo: 'salvaguarda de Reflexos', cd: 22 },
  ],
  [
    'cd na rolagem oculta do mestre',
    '/oculto 1d20+13 cd 22',
    { tipo: 'rolagem-oculta', expressao: '1d20+13', motivo: '', cd: 22 },
  ],
  [
    'espaços sobrando em volta do cd',
    '/r   1d20+2    cd    40  ',
    { tipo: 'rolagem', expressao: '1d20+2', motivo: '', cd: 40 },
  ],
  [
    'cd na ponta da faixa',
    '/r 1d20 cd 1',
    { tipo: 'rolagem', expressao: '1d20', motivo: '', cd: 1 },
  ],
  [
    'cd no teto da faixa',
    '/r 1d20 cd 60',
    { tipo: 'rolagem', expressao: '1d20', motivo: '', cd: 60 },
  ],
  // "cd" dentro do motivo NÃO é CD: a âncora é o fim da expressão, antes do `#`.
  [
    'cd escrito no motivo continua motivo',
    '/r 1d20 # tentando bater a cd 18',
    { tipo: 'rolagem', expressao: '1d20', motivo: 'tentando bater a cd 18', cd: null },
  ],

  // ── sussurro ────────────────────────────────────────────────────────
  [
    '/sussurro com @',
    '/sussurro @Ana plano secreto',
    { tipo: 'sussurro', destinatario: 'Ana', conteudo: 'plano secreto' },
  ],
  [
    '/s abreviado, sem @',
    '/s Ana plano secreto',
    { tipo: 'sussurro', destinatario: 'Ana', conteudo: 'plano secreto' },
  ],
  ['/S maiúsculo', '/S @Ana oi', { tipo: 'sussurro', destinatario: 'Ana', conteudo: 'oi' }],
  [
    'nome com espaço entre aspas',
    '/sussurro "Ana Maria" abro a porta',
    { tipo: 'sussurro', destinatario: 'Ana Maria', conteudo: 'abro a porta' },
  ],
  [
    'aspas depois do @',
    '/s @"Ana Maria" abro a porta',
    { tipo: 'sussurro', destinatario: 'Ana Maria', conteudo: 'abro a porta' },
  ],
  [
    '# não é motivo em sussurro',
    '/s Ana encontro no #porto',
    { tipo: 'sussurro', destinatario: 'Ana', conteudo: 'encontro no #porto' },
  ],

  // ── rolagem oculta ──────────────────────────────────────────────────
  [
    '/oculto',
    '/oculto 1d20+5',
    { tipo: 'rolagem-oculta', expressao: '1d20+5', motivo: '', cd: null },
  ],
  ['/go', '/go 1d20', { tipo: 'rolagem-oculta', expressao: '1d20', motivo: '', cd: null }],
  ['/gm', '/gm 1d20', { tipo: 'rolagem-oculta', expressao: '1d20', motivo: '', cd: null }],
  [
    '/GM maiúsculo',
    '/GM 1d20',
    { tipo: 'rolagem-oculta', expressao: '1d20', motivo: '', cd: null },
  ],
  [
    'oculta com motivo',
    '/oculto 1d20 # percepção do goblin',
    { tipo: 'rolagem-oculta', expressao: '1d20', motivo: 'percepção do goblin', cd: null },
  ],
];

describe('interpretarComando — tabela de casos (RV-074)', () => {
  it.each(CASOS)('%s', (_descricao, entrada, esperado) => {
    expect(interpretarComando(entrada)).toEqual(esperado);
  });
});

describe('interpretarComando — comando desconhecido', () => {
  it('avisa em PT-BR listando os comandos disponíveis', () => {
    const comando = interpretarComando('/banana 1d20');
    expect(comando.tipo).toBe('desconhecido');
    if (comando.tipo !== 'desconhecido') return;
    expect(comando.nome).toBe('banana');
    expect(comando.aviso).toContain('"/banana" não é um comando');
    for (const definicao of COMANDOS_CHAT) {
      expect(comando.aviso).toContain(definicao.uso);
    }
  });

  it('barra sozinha não vira fala nem comando válido', () => {
    const comando = interpretarComando('/');
    expect(comando.tipo).toBe('desconhecido');
    expect(comandoEhAviso(comando)).toBe(true);
  });

  it('não confunde alias parcial com comando', () => {
    expect(interpretarComando('/ro 1d20').tipo).toBe('desconhecido');
    expect(interpretarComando('/rolarx 1d20').tipo).toBe('desconhecido');
  });
});

describe('interpretarComando — comando incompleto', () => {
  const INCOMPLETOS: ReadonlyArray<[string, string, string]> = [
    ['/r sem expressão', '/r', 'rolar'],
    ['/r só com motivo', '/r # dano', 'rolar'],
    ['/oculto sem expressão', '/oculto', 'oculto'],
    ['/sussurro sem nada', '/sussurro', 'sussurro'],
    ['/sussurro só com destinatário', '/s @Ana', 'sussurro'],
    ['/sussurro com aspas abertas', '/s "Ana Maria oi', 'sussurro'],
  ];

  it.each(INCOMPLETOS)('%s avisa em vez de virar mensagem', (_descricao, entrada, nome) => {
    const comando = interpretarComando(entrada);
    expect(comando.tipo).toBe('incompleto');
    if (comando.tipo !== 'incompleto') return;
    expect(comando.nome).toBe(nome);
    expect(comando.aviso.length).toBeGreaterThan(0);
  });
});

describe('sufixo `cd N` — CD estragada não vira rolagem silenciosa (RV-154)', () => {
  /**
   * Este bloco existe por causa de uma tentação concreta: aceitar a linha e
   * rolar sem CD quando o número está errado. A rolagem sairia, o grau não
   * apareceria, e o jogador ficaria olhando a tela sem saber que digitou algo
   * inválido — F8 da taxonomia (pulo silencioso).
   */
  const RECUSADAS: ReadonlyArray<[descricao: string, entrada: string]> = [
    ['zero está fora da faixa', '/r 1d20+3 cd 0'],
    ['negativa está fora da faixa', '/r 1d20+3 cd -5'],
    ['acima do teto', '/r 1d20+3 cd 200'],
    ['fracionária', '/r 1d20+3 cd 18.5'],
    ['não é número', '/r 1d20+3 cd alta'],
  ];

  it.each(RECUSADAS)('%s: avisa em PT-BR e não vira rolagem', (_descricao, entrada) => {
    const comando = interpretarComando(entrada);
    expect(comando.tipo).toBe('incompleto');
    if (comando.tipo !== 'incompleto') return;
    expect(comando.aviso).toBe(MENSAGEM_CD_INVALIDA);
    // A faixa é dita ao usuário, e sai da constante — não de um número no texto.
    expect(comando.aviso).toContain(String(CD_MINIMA));
    expect(comando.aviso).toContain(String(CD_MAXIMA));
  });

  it('`cd` sem número diz o que falta, com exemplo', () => {
    const comando = interpretarComando('/r 1d20+11 cd');
    expect(comando.tipo).toBe('incompleto');
    if (comando.tipo !== 'incompleto') return;
    expect(comando.aviso).toBe(MENSAGEM_CD_AUSENTE);
  });

  it('só o sufixo, sem expressão, cobra a expressão antes da CD', () => {
    const comando = interpretarComando('/r cd 18');
    expect(comando.tipo).toBe('incompleto');
    if (comando.tipo !== 'incompleto') return;
    expect(comando.aviso).toContain('Informe a expressão de dados');
  });

  it('a faixa aceita é a mesma que `cdValida` diz, nas quatro bordas', () => {
    // Um só lugar decide o que é CD: o parser não tem faixa própria.
    expect(cdValida(CD_MINIMA)).toBe(true);
    expect(cdValida(CD_MAXIMA)).toBe(true);
    expect(cdValida(CD_MINIMA - 1)).toBe(false);
    expect(cdValida(CD_MAXIMA + 1)).toBe(false);
  });

  it('o uso dos dois comandos de rolagem ensina o sufixo', () => {
    // Sintaxe que ninguém descobre é sintaxe que ninguém usa.
    for (const definicao of COMANDOS_CHAT.filter((c) => c.tipo !== 'sussurro')) {
      expect(definicao.uso).toContain('cd N');
    }
  });
});

describe('registry de comandos', () => {
  it('não tem nome nem alias repetido entre comandos', () => {
    const nomes = COMANDOS_CHAT.flatMap((c) => [c.nome, ...c.aliases]).map((n) => n.toLowerCase());
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it('a ajuda lista o uso de todos os comandos registrados', () => {
    const ajuda = listarUsosDeComandos();
    for (const definicao of COMANDOS_CHAT) expect(ajuda).toContain(definicao.uso);
  });

  it('comandoEhAviso separa o que não pode ser enviado à mesa', () => {
    expect(comandoEhAviso(interpretarComando('/r 1d20'))).toBe(false);
    expect(comandoEhAviso(interpretarComando('oi'))).toBe(false);
    expect(comandoEhAviso(interpretarComando('/banana'))).toBe(true);
    expect(comandoEhAviso(interpretarComando('/r'))).toBe(true);
  });
});
