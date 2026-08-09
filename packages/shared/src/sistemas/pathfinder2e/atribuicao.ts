/**
 * Atribuição e teto de conteúdo de Pathfinder Segunda Edição (RV-150).
 *
 * A decisão de licenciamento está escrita em `docs/licencas/pathfinder2e.md`.
 * Este arquivo é a parte executável dela: o texto que precisa **viajar junto do
 * conteúdo** e os dois números que definem o que cabe no repositório.
 *
 * Resumo da fronteira, para quem chegar aqui primeiro:
 *
 * - **Mecânica** (proficiência, graus de sucesso, CDs, MAP) é Open Game Content
 *   sob a OGL 1.0a — implementável com atribuição, e é onde está o valor.
 * - **Conteúdo** (talentos, magias, itens, monstros) não pode ser distribuído
 *   por nós. Entra apenas como semente curada e pequena, com `fonte` em cada
 *   item, atrás da port `CatalogoPathfinder` (RV-157).
 * - *Scraping* do Archives of Nethys e empacotamento do dataset pf2e do Foundry
 *   estão **proibidos**.
 *
 * A verificação automatizada dessas regras vive em `licenca.ts` e roda sobre os
 * arquivos reais do diretório `semente/` em `licenca.test.ts`.
 */

/**
 * Texto de atribuição exibido junto de qualquer conteúdo de PF2e — ficha,
 * catálogo, resposta de API. É uma constante, e não uma string no JSX, porque a
 * mesma frase precisa aparecer em toda tela e também fora do front.
 */
export const ATRIBUICAO_PF2E = {
  texto:
    'O RolaVinte usa as mecânicas de Pathfinder Segunda Edição sob a Open Game License 1.0a. ' +
    'Pathfinder e Paizo são marcas da Paizo Inc.; este projeto não é publicado, endossado nem ' +
    'aprovado pela Paizo. O material de referência exibido segue a Community Use Policy da Paizo.',
  links: [
    { rotulo: 'Community Use Policy da Paizo', href: 'https://paizo.com/communityuse' },
    { rotulo: 'Open Game License 1.0a', href: 'https://paizo.com/pathfinder/compatibility/ogl' },
    { rotulo: 'paizo.com', href: 'https://paizo.com' },
  ],
} as const;

/**
 * Teto da semente de conteúdo.
 *
 * Os números são baixos de propósito. Eles não existem para limitar o produto —
 * existem para ficar **vermelhos** no dia em que alguém colar um dump do AoN ou
 * do Foundry aqui dentro. Aumentar o teto é decisão consciente: mude este
 * objeto e escreva o motivo no diff. Não há segundo lugar onde estes números
 * estejam escritos, e `licenca.test.ts` prova que não há.
 */
export const LIMITE_SEMENTE = {
  /** Máximo de itens por tipo (um tipo = um arquivo `.json` da semente). */
  itensPorTipo: 30,
  /** Máximo de bytes por arquivo da semente. */
  bytesPorArquivo: 64 * 1024,
} as const;
