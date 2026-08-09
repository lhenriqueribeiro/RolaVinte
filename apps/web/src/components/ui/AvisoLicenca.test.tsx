import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ATRIBUICAO_PF2E } from '@rolavinte/shared';
import { AvisoLicenca } from './AvisoLicenca';

/**
 * Atribuição de PF2e no front (RV-150).
 *
 * Duas coisas precisam ser verdade, e a segunda é a que protege: o rodapé mostra
 * o texto **vindo da constante**, e nenhuma tela escreve a atribuição à mão. Um
 * texto legal duplicado no JSX é um texto que envelhece sozinho — e ninguém
 * descobre até alguém ler os dois.
 */

const RAIZ = join(import.meta.dirname, '..', '..');
const ESTE_COMPONENTE = join('components', 'ui', 'AvisoLicenca');

function listarFontes(diretorio: string): string[] {
  return readdirSync(diretorio).flatMap((entrada) => {
    const caminho = join(diretorio, entrada);
    if (statSync(caminho).isDirectory()) return listarFontes(caminho);
    if (!/\.tsx?$/.test(entrada)) return [];
    return [caminho];
  });
}

describe('AvisoLicenca (RV-150)', () => {
  it('exibe o texto de ATRIBUICAO_PF2E, sem cópia no JSX', () => {
    render(<AvisoLicenca />);

    const rodape = screen.getByRole('contentinfo', {
      name: 'Aviso de licença de Pathfinder Segunda Edição',
    });
    expect(rodape).toHaveTextContent(ATRIBUICAO_PF2E.texto);
  });

  it('leva aos documentos oficiais sem sequestrar a aba do jogo', () => {
    render(<AvisoLicenca />);

    for (const { rotulo, href } of ATRIBUICAO_PF2E.links) {
      const link = screen.getByRole('link', { name: rotulo });
      expect(link).toHaveAttribute('href', href);
      // Uma mesa aberta não pode ser trocada por um site externo.
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    }
  });

  it('nenhuma outra tela escreve a atribuição à mão', () => {
    const proibido = /Paizo|Open Game License|Community Use/;
    const infratores = listarFontes(RAIZ)
      .map((caminho) => relative(RAIZ, caminho))
      .filter((caminho) => !caminho.startsWith(ESTE_COMPONENTE))
      .filter((caminho) => proibido.test(readFileSync(join(RAIZ, caminho), 'utf8')));

    expect(
      infratores,
      'A atribuição de PF2e sai de ATRIBUICAO_PF2E (@rolavinte/shared) pelo componente ' +
        '<AvisoLicenca>. Monte o componente na tela em vez de repetir o texto legal no JSX.',
    ).toEqual([]);
  });
});
