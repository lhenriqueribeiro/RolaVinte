#!/usr/bin/env node
/**
 * Dá um consumidor à documentação.
 *
 * Este projeto passou oito versões catalogando uma classe de defeito — F2, o
 * órfão de contrato: duas pontas que deveriam casar, e nada verificando o
 * casamento — e a corrigiu no código sempre do mesmo jeito, dando ao contrato
 * um consumidor que quebra. `cobertura-eventos-ws.test.ts` é isso para eventos;
 * `check-de-sistemas.test.ts` é isso para o CHECK de sistema.
 *
 * A documentação não tinha nenhum. O resultado foi previsível: em 2026-08-10 o
 * `protocolo-comum.md` — que todo agente lê antes de codar — afirmava "este
 * projeto não é um repositório git", oito commits depois de passar a ser.
 *
 * O que este script verifica é só o que é automatizável: caminho citado que não
 * existe, comando citado que não existe, e fato volátil afirmado em prosa onde
 * ninguém atualiza. Afirmação semanticamente falsa (como a do git) nenhum script
 * pega — essa é responsabilidade nomeada do verificador, em
 * .claude/agents/verificador.md.
 *
 *   npm run docs:verificar
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Diretórios de documentação sob verificação. */
const ALVOS = [
  '.claude/rules',
  '.claude/agents',
  'docs/agentes',
  'docs/backlog',
  'docs/release-notes',
];
const AVULSOS = ['CLAUDE.md', 'README.md'];

/**
 * Onde é legítimo afirmar a contagem de cards: o backlog, que o curador
 * atualiza a cada sprint. Fora dali, o número vira mentira na entrega seguinte.
 */
const PODE_CONTAR_CARDS = ['docs/backlog'];

/**
 * Release notes descrevem um momento congelado, e por isso podem citar caminho
 * que deixou de existir depois. Excluí-las de tudo tornaria a exceção grande
 * demais, então só a checagem de caminho as dispensa.
 */
const HISTORICO = ['docs/release-notes'];

function listarMarkdown(alvo) {
  const caminho = join(RAIZ, alvo);
  if (!existsSync(caminho)) return [];
  if (statSync(caminho).isFile()) return alvo.endsWith('.md') ? [alvo] : [];
  return readdirSync(caminho)
    .filter((n) => n.endsWith('.md'))
    .map((n) => `${alvo}/${n}`);
}

const arquivos = [...ALVOS.flatMap(listarMarkdown), ...AVULSOS.flatMap(listarMarkdown)];

/** Scripts npm declarados em qualquer package.json do monorepo. */
function scriptsDisponiveis() {
  const nomes = new Set();
  const pacotes = [
    'package.json',
    'packages/shared/package.json',
    'apps/api/package.json',
    'apps/web/package.json',
  ];
  for (const p of pacotes) {
    const caminho = join(RAIZ, p);
    if (!existsSync(caminho)) continue;
    const json = JSON.parse(readFileSync(caminho, 'utf8'));
    for (const nome of Object.keys(json.scripts ?? {})) nomes.add(nome);
  }
  return nomes;
}

const scripts = scriptsDisponiveis();
const problemas = [];

/** Alvo de link markdown que aponta para dentro do repositório. */
const LINK = /\]\(([^)\s#]+)(?:#[^)]*)?\)/g;
/** `npm run x` ou `npm run x -w pacote`, dentro ou fora de bloco de código. */
const COMANDO = /npm run ([a-z][a-z0-9:-]*)/g;
/** "98 cards", "42 cards concluídos" — fato volátil em prosa. */
const CONTAGEM = /\b\d{2,4}\s+cards?\b/gi;

for (const arquivo of arquivos) {
  const texto = readFileSync(join(RAIZ, arquivo), 'utf8');
  const dirDoArquivo = dirname(join(RAIZ, arquivo));
  const ehHistorico = HISTORICO.some((h) => arquivo.startsWith(h));

  if (!ehHistorico) {
    for (const [, alvo] of texto.matchAll(LINK)) {
      if (/^(https?:|mailto:)/.test(alvo)) continue;
      const resolvido = alvo.startsWith('/') ? join(RAIZ, alvo) : resolve(dirDoArquivo, alvo);
      if (!existsSync(resolvido)) {
        problemas.push({
          arquivo,
          tipo: 'caminho inexistente',
          detalhe: `${alvo} -> ${relative(RAIZ, resolvido).replace(/\\/g, '/')}`,
        });
      }
    }
  }

  for (const [, script] of texto.matchAll(COMANDO)) {
    if (!scripts.has(script)) {
      problemas.push({
        arquivo,
        tipo: 'comando npm inexistente',
        detalhe: `npm run ${script}`,
      });
    }
  }

  if (!PODE_CONTAR_CARDS.some((p) => arquivo.startsWith(p))) {
    for (const [achado] of texto.matchAll(CONTAGEM)) {
      problemas.push({
        arquivo,
        tipo: 'contagem de cards fora do backlog',
        detalhe: `"${achado}" — o número muda a cada sprint; aponte para docs/backlog/ em vez de repeti-lo`,
      });
    }
  }
}

if (problemas.length > 0) {
  console.error(`\n[docs] ${problemas.length} problema(s) na documentação:\n`);
  const porArquivo = new Map();
  for (const p of problemas) {
    if (!porArquivo.has(p.arquivo)) porArquivo.set(p.arquivo, []);
    porArquivo.get(p.arquivo).push(p);
  }
  for (const [arquivo, lista] of porArquivo) {
    console.error(`  ${arquivo}`);
    for (const p of lista) console.error(`    - ${p.tipo}: ${p.detalhe}`);
  }
  console.error(
    [
      '',
      'Documentação que afirma fato volátil apodrece. Regra do projeto:',
      '  · princípio (por quê, o que rejeitar em review) -> prosa, e envelhece bem',
      '  · fato do estado atual (caminho, contagem, comando) -> derivar, nunca afirmar',
      '  · história (o que aconteceu na versão X) -> prosa, mas datada',
      '',
      'Afirmação semanticamente falsa este script não pega. Isso é auditoria do',
      'verificador — ver .claude/agents/verificador.md.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

console.log(
  `\n[docs] ${arquivos.length} arquivos conferidos: caminhos existem, comandos existem, nenhum fato volátil fora de casa.\n`,
);
