import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ATRIBUTOS,
  CHAVES_MODIFICADOR_LEGADAS,
  definicaoDoSistema,
  SISTEMAS_RPG,
} from '@rolavinte/shared';
import { describe, expect, it } from 'vitest';
import { removerComentariosSql } from './check-de-sistemas';

/**
 * Guarda da migration que consolida o atributo de PF2e (RV-098).
 *
 * ## Por que existe
 *
 * A `0009` é a única metade da correção que **nenhum** teste da suíte executa: os
 * testes rodam com fakes, e não há banco. É a classe **F10** da taxonomia
 * (configuração que nunca foi exercitada) somada à **F3** (o fake regrava o
 * agregado inteiro e nunca veria uma linha no formato antigo). O estrago que ela
 * pode causar em silêncio é grande: copiar cinco dos seis modificadores apaga um
 * atributo de todo personagem de Pathfinder, e converter linha de D&D 5e destrói
 * a escala 1..30 de todo mundo.
 *
 * O que dá para provar sem banco é que o SQL **fala das seis chaves e só do
 * sistema certo**, derivando a lista do TypeScript em vez de repetir os nomes à
 * mão. Não é a mesma coisa que rodar a migration — e o teste diz isso em voz
 * alta —, mas pega exatamente os dois erros acima.
 *
 * ## O que este arquivo NÃO prova
 *
 * Que o Postgres aceita o SQL, que a regra de consolidação escolhe o valor certo
 * em cada linha e que a migration foi aplicada em algum ambiente. Aplicar é
 * operação (`npm run supabase:migrar -w @rolavinte/api`), e a verificação é o
 * percurso manual contra o banco real.
 */

const DIR_MIGRATIONS = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'supabase',
  'migrations',
);

const NOME_MIGRATION = '0009_consolidar_atributos_pathfinder2e.sql';

/**
 * O SQL sem comentários e com o espaçamento achatado.
 *
 * Achatar é o que deixa as buscas abaixo independentes de formatação: o `update`
 * quebra linha entre os operadores, e um teste que exigisse a quebra exata
 * ficaria vermelho por um `prettier` de SQL em vez de por um defeito.
 */
function sqlDaMigration(): string {
  const arquivos = readdirSync(DIR_MIGRATIONS).filter((nome) => nome.endsWith('.sql'));
  expect(
    arquivos,
    `A migration ${NOME_MIGRATION} não está em apps/api/supabase/migrations/. ` +
      `Sem ela, toda ficha de Pathfinder gravada antes do RV-098 fica com o atributo ` +
      `na escala errada e recusa salvamento.`,
  ).toContain(NOME_MIGRATION);
  const bruto = readFileSync(join(DIR_MIGRATIONS, NOME_MIGRATION), 'utf8');
  return removerComentariosSql(bruto).replace(/\s+/g, ' ');
}

describe('migration 0009 — consolidação do atributo de PF2e (RV-098)', () => {
  it('lê e apaga cada uma das seis chaves antigas — as duas metades, por chave', () => {
    // Derivado de `CHAVES_MODIFICADOR_LEGADAS`, não escrito à mão: renomear a
    // lista sem mexer no SQL deixa este teste vermelho, que é o ponto.
    //
    // As duas buscas são separadas de propósito. Contar ocorrências não serve: a
    // chave aparece também no `where ... ?| array[...]`, então uma chave que
    // ninguém copia nem apaga ainda apareceria duas vezes — medido, com a chave
    // removida do SQL de verdade, e o teste passava verde.
    const sql = sqlDaMigration();
    expect(CHAVES_MODIFICADOR_LEGADAS).toHaveLength(ATRIBUTOS.length);

    for (const chave of CHAVES_MODIFICADOR_LEGADAS) {
      expect(
        sql.includes(`-> '${chave}'`),
        `A migration não **lê** \`dados -> '${chave}'\`: o modificador que o jogador ` +
          `gravou nessa chave seria descartado na consolidação.`,
      ).toBe(true);
      expect(
        sql.includes(`- '${chave}'`),
        `A migration não **apaga** '${chave}' de \`dados\`: a chave sobreviveria à ` +
          `consolidação, o atributo voltaria a ter duas casas e o \`schemaFicha\` ` +
          `estrito recusaria toda edição daquela ficha.`,
      ).toBe(true);
    }
  });

  it('grava as seis chaves da coluna comum', () => {
    const sql = sqlDaMigration();
    for (const atributo of ATRIBUTOS) {
      expect(
        sql.includes(`'${atributo}'`),
        `A migration não grava '${atributo}' na coluna \`atributos\`: o objeto ` +
          `reconstruído ficaria sem esse atributo.`,
      ).toBe(true);
    }
  });

  it('só toca em personagem de mesa de PF2e — D&D 5e não pode regredir', () => {
    // A armadilha nº 1 do card. A escala do d20 clássico não mudou, então
    // converter linha de outro sistema seria estragar dado correto.
    const sql = sqlDaMigration();
    expect(sql).toContain("m.sistema = 'pathfinder2e'");
    const outros = SISTEMAS_RPG.filter((sistema) => sistema !== 'pathfinder2e');
    for (const sistema of outros) {
      expect(
        sql.includes(`'${sistema}'`),
        `A migration menciona o sistema '${sistema}', que não deveria ser tocado.`,
      ).toBe(false);
    }
  });

  it('usa a faixa declarada pela escala do sistema ao limitar a conversão', () => {
    // Converter 30 pela fórmula do d20 dá +10, acima do teto: sem o limite, a
    // migration gravaria um valor que a própria aplicação recusa a seguir.
    const escala = definicaoDoSistema('pathfinder2e').atributos;
    const sql = sqlDaMigration();

    expect(sql).toContain(String(escala.minimo));
    expect(sql).toContain(String(escala.maximo));
  });

  it('é registrada em migrations_aplicadas com o próprio nome', () => {
    // Sem esta linha o `supabase:migrar` a reaplicaria, e reaplicar converteria de
    // novo um modificador já consolidado.
    const sql = sqlDaMigration();
    expect(sql).toContain(`'${NOME_MIGRATION.replace(/\.sql$/, '')}'`);
  });
});
