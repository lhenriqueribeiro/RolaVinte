import { describe, expect, it } from 'vitest';
import {
  COMANDOS_CHAT,
  comandoEhAviso,
  interpretarComando,
  listarUsosDeComandos,
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
  ['/r', '/r 1d20', { tipo: 'rolagem', expressao: '1d20', motivo: '' }],
  ['/rolar', '/rolar 1d20', { tipo: 'rolagem', expressao: '1d20', motivo: '' }],
  ['/R maiúsculo', '/R 1d20', { tipo: 'rolagem', expressao: '1d20', motivo: '' }],
  ['/ROLAR maiúsculo', '/ROLAR 1d20', { tipo: 'rolagem', expressao: '1d20', motivo: '' }],
  [
    'motivo depois do #',
    '/r 2d6+3 # dano da espada',
    { tipo: 'rolagem', expressao: '2d6+3', motivo: 'dano da espada' },
  ],
  [
    'só o primeiro # separa',
    '/r 2d6 # dano # crítico',
    { tipo: 'rolagem', expressao: '2d6', motivo: 'dano # crítico' },
  ],
  [
    '# colado na expressão',
    '/r 4d6kh3#atributo',
    { tipo: 'rolagem', expressao: '4d6kh3', motivo: 'atributo' },
  ],
  ['tabulação como separador', '/r\t1d20+5', { tipo: 'rolagem', expressao: '1d20+5', motivo: '' }],
  ['espaços sobrando', '  /r    1d20   ', { tipo: 'rolagem', expressao: '1d20', motivo: '' }],

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
  ['/oculto', '/oculto 1d20+5', { tipo: 'rolagem-oculta', expressao: '1d20+5', motivo: '' }],
  ['/go', '/go 1d20', { tipo: 'rolagem-oculta', expressao: '1d20', motivo: '' }],
  ['/gm', '/gm 1d20', { tipo: 'rolagem-oculta', expressao: '1d20', motivo: '' }],
  ['/GM maiúsculo', '/GM 1d20', { tipo: 'rolagem-oculta', expressao: '1d20', motivo: '' }],
  [
    'oculta com motivo',
    '/oculto 1d20 # percepção do goblin',
    { tipo: 'rolagem-oculta', expressao: '1d20', motivo: 'percepção do goblin' },
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
