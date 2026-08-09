import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { ATRIBUICAO_PF2E, LIMITE_SEMENTE } from './atribuicao';
import {
  MARCADOR_OGL_PENDENTE,
  auditarSemente,
  descreverViolacoes,
  type ArquivoDeSemente,
} from './licenca';

/**
 * Fronteira de licenciamento de Pathfinder 2e (RV-150).
 *
 * A decisão está em `docs/licencas/pathfinder2e.md`; este arquivo é o que a
 * torna **executável**. Sem ele, a regra seria mais um documento que ninguém lê
 * — a classe **F1 (defesa que não defende)** da taxonomia de falhas.
 *
 * Dois grupos de teste, e os dois importam:
 *
 * 1. a semente **real** do disco respeita a fronteira — nada de dublê, porque
 *    um fake generoso jamais exporia um dump colado no diretório (**F3**);
 * 2. a auditoria **sabe reprovar** cada uma das regras, e a mensagem de falha
 *    diz o que fazer. Guarda que nunca ficou vermelha não guarda nada.
 */

const DIR = dirname(fileURLToPath(import.meta.url));
const DIR_SEMENTE = join(DIR, 'semente');
const RAIZ = join(DIR, '..', '..', '..', '..', '..');
const DOC_LICENCA = join(RAIZ, 'docs', 'licencas', 'pathfinder2e.md');

/**
 * Lê um diretório de semente do disco. É o mesmo leitor para o diretório real e
 * para os fixtures — se ele mentisse, mentiria para os dois lados.
 */
function lerSemente(diretorio: string): ArquivoDeSemente[] {
  return readdirSync(diretorio).map((caminho) => {
    const absoluto = join(diretorio, caminho);
    return {
      caminho,
      conteudo: readFileSync(absoluto, 'utf8'),
      bytes: statSync(absoluto).size,
    };
  });
}

const temporarios: string[] = [];

/** Cria um diretório de semente descartável com os arquivos informados. */
function sementeFixture(arquivos: Record<string, string>): ArquivoDeSemente[] {
  const diretorio = mkdtempSync(join(tmpdir(), 'rolavinte-semente-'));
  temporarios.push(diretorio);
  writeFileSync(join(diretorio, 'README.md'), '# fixture\n', 'utf8');
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    writeFileSync(join(diretorio, nome), conteudo, 'utf8');
  }
  return lerSemente(diretorio);
}

/** Item válido: os fixtures partem dele e quebram só o que estão testando. */
function itemValido(chave: string) {
  return {
    chave,
    nome: chave,
    fonte: 'Pathfinder Player Core (Paizo) — Open Game Content sob a OGL 1.0a',
  };
}

/** O documento de licença como está hoje: sem conteúdo, marcador presente. */
const CONTEXTO_REAL = { documentoDeLicenca: readFileSync(DOC_LICENCA, 'utf8') };
/** Documento já completo, para isolar as outras regras do marcador pendente. */
const CONTEXTO_COMPLETO = { documentoDeLicenca: '## Seção 15\nOGL 1.0a, texto completo.\n' };

afterAll(() => {
  for (const diretorio of temporarios) rmSync(diretorio, { recursive: true, force: true });
});

describe('semente real do repositório', () => {
  it('está dentro da fronteira de licenciamento', () => {
    const violacoes = auditarSemente(lerSemente(DIR_SEMENTE), CONTEXTO_REAL);
    expect(descreverViolacoes(violacoes)).toBe('');
    expect(violacoes).toEqual([]);
  });

  it('aceita semente vazia: nenhuma tela quebra por ausência de conteúdo', () => {
    // Diretório só com o README — a auditoria ignora o que não é `.json`.
    // De propósito **não** afirmamos aqui que o diretório real está vazio: no
    // dia em que RV-157 trouxer a primeira semente legítima, esse teste ficaria
    // vermelho por estar certo, e alguém o apagaria junto com a guarda de
    // verdade. Quem cobre o diretório real é o teste acima.
    expect(auditarSemente(sementeFixture({}), CONTEXTO_REAL)).toEqual([]);
  });

  it('nasce com a regra escrita no próprio diretório', () => {
    const readme = readFileSync(join(DIR_SEMENTE, 'README.md'), 'utf8');
    expect(readme).toContain('LIMITE_SEMENTE');
    expect(readme).toContain('fonte');
    expect(readme).toContain('docs/licencas/pathfinder2e.md');
  });
});

describe('a auditoria sabe reprovar', () => {
  it('o item que estoura o teto por tipo, nomeando arquivo e contagem', () => {
    const demais = Array.from({ length: LIMITE_SEMENTE.itensPorTipo + 1 }, (_, i) =>
      itemValido(`pericia-${i}`),
    );
    const violacoes = auditarSemente(
      sementeFixture({ 'pericias.json': JSON.stringify(demais) }),
      CONTEXTO_COMPLETO,
    );

    expect(violacoes.map((v) => v.motivo)).toEqual(['excesso-de-itens']);
    expect(violacoes[0]?.mensagem).toContain('pericias.json');
    expect(violacoes[0]?.mensagem).toContain(String(LIMITE_SEMENTE.itensPorTipo + 1));
    // A mensagem precisa dizer o que fazer, não só que deu errado.
    expect(violacoes[0]?.mensagem).toContain('LIMITE_SEMENTE.itensPorTipo');
  });

  it('o arquivo que estoura o teto de bytes', () => {
    const gordo = JSON.stringify([
      { ...itemValido('bestiario'), nome: 'x'.repeat(LIMITE_SEMENTE.bytesPorArquivo) },
    ]);
    const violacoes = auditarSemente(sementeFixture({ 'monstros.json': gordo }), CONTEXTO_COMPLETO);

    expect(violacoes.map((v) => v.motivo)).toEqual(['arquivo-grande-demais']);
    expect(violacoes[0]?.mensagem).toContain('monstros.json');
    expect(violacoes[0]?.mensagem).toContain('LIMITE_SEMENTE.bytesPorArquivo');
  });

  it('o item sem fonte, nomeando o arquivo e a chave', () => {
    const semFonte = [itemValido('acrobacia'), { chave: 'atletismo', nome: 'Atletismo' }];
    const violacoes = auditarSemente(
      sementeFixture({ 'pericias.json': JSON.stringify(semFonte) }),
      CONTEXTO_COMPLETO,
    );

    expect(violacoes.map((v) => v.motivo)).toEqual(['item-sem-fonte']);
    expect(violacoes[0]?.arquivo).toBe('pericias.json');
    expect(violacoes[0]?.chave).toBe('atletismo');
    expect(violacoes[0]?.mensagem).toContain('atletismo');
  });

  it('o item sem chave, pelo índice, e a fonte em branco', () => {
    const violacoes = auditarSemente(
      sementeFixture({ 'talentos.json': JSON.stringify([{ nome: 'Sem nada', fonte: '   ' }]) }),
      CONTEXTO_COMPLETO,
    );

    expect(violacoes.map((v) => v.motivo)).toEqual(['item-sem-fonte']);
    expect(violacoes[0]?.chave).toBe('#0');
  });

  it('o arquivo ilegível e o formato que não é uma lista de itens', () => {
    const violacoes = auditarSemente(
      sementeFixture({
        'quebrado.json': '{ isto não é json',
        'magias.json': JSON.stringify({ magias: [itemValido('bola-de-fogo')] }),
      }),
      CONTEXTO_COMPLETO,
    );

    expect(violacoes.map((v) => v.motivo).sort()).toEqual(['formato-invalido', 'json-invalido']);
  });

  it('o conteúdo que chega antes da atribuição completa', () => {
    const violacoes = auditarSemente(
      sementeFixture({ 'pericias.json': JSON.stringify([itemValido('acrobacia')]) }),
      CONTEXTO_REAL,
    );

    expect(violacoes.map((v) => v.motivo)).toEqual(['atribuicao-incompleta']);
    expect(violacoes[0]?.mensagem).toContain(MARCADOR_OGL_PENDENTE);
    expect(violacoes[0]?.mensagem).toContain('OGL 1.0a');
  });

  it('acumula todas as violações em vez de parar na primeira', () => {
    const demaisSemFonte = Array.from({ length: LIMITE_SEMENTE.itensPorTipo + 1 }, (_, i) => ({
      chave: `talento-${i}`,
      nome: `Talento ${i}`,
    }));
    const violacoes = auditarSemente(
      sementeFixture({ 'talentos.json': JSON.stringify(demaisSemFonte) }),
      CONTEXTO_REAL,
    );

    // Quem colou um dump precisa ver o tamanho do estrago de uma vez.
    expect(violacoes.filter((v) => v.motivo === 'item-sem-fonte')).toHaveLength(
      LIMITE_SEMENTE.itensPorTipo + 1,
    );
    expect(violacoes.map((v) => v.motivo)).toContain('excesso-de-itens');
    expect(violacoes.map((v) => v.motivo)).toContain('atribuicao-incompleta');
  });
});

describe('atribuição e teto', () => {
  it('o texto de atribuição está em PT-BR e nomeia Paizo, OGL e a ausência de endosso', () => {
    expect(ATRIBUICAO_PF2E.texto).toContain('Paizo');
    expect(ATRIBUICAO_PF2E.texto).toContain('Open Game License 1.0a');
    expect(ATRIBUICAO_PF2E.texto).toContain('não é publicado, endossado nem aprovado');
    expect(ATRIBUICAO_PF2E.links.map((l) => l.href)).toContain('https://paizo.com/communityuse');
  });

  it('o teto está escrito num único lugar', () => {
    // DoD do RV-150: aumentar o teto exige alterar LIMITE_SEMENTE, e não existe
    // segundo lugar onde o número esteja escrito — nem em doc, nem neste teste.
    const proibidos = [
      /\b30\b/,
      /\b65536\b/,
      /64\s*\*\s*1024/,
      /64\s*(KB|kB|kb|KiB)/,
      /\b30 itens\b/,
    ];
    const arquivos = {
      'licenca.ts': join(DIR, 'licenca.ts'),
      'licenca.test.ts': join(DIR, 'licenca.test.ts'),
      'semente/README.md': join(DIR_SEMENTE, 'README.md'),
      'docs/licencas/pathfinder2e.md': DOC_LICENCA,
    };

    for (const [rotulo, caminho] of Object.entries(arquivos)) {
      const conteudo = readFileSync(caminho, 'utf8');
      for (const proibido of proibidos) {
        expect(
          proibido.test(conteudo),
          `${rotulo} repete o teto da semente (${proibido}). O número mora só em ` +
            `LIMITE_SEMENTE, em atribuicao.ts — cópia de número é cópia que envelhece.`,
        ).toBe(false);
      }
    }
  });
});
