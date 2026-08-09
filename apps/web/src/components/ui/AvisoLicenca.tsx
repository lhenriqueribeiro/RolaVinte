import { ATRIBUICAO_PF2E } from '@rolavinte/shared';

/**
 * Rodapé de atribuição de Pathfinder 2e (RV-150).
 *
 * Toda tela que exibir conteúdo de PF2e — ficha, catálogo, painel de regras —
 * monta este componente. Ele existe por dois motivos:
 *
 * 1. **A atribuição precisa acompanhar o conteúdo.** Um aviso no rodapé do site
 *    não cobre uma tela que alguém abre direto por link.
 * 2. **O texto mora num lugar só.** A frase vem de `ATRIBUICAO_PF2E`, em
 *    `@rolavinte/shared`, e não é escrita no JSX. Duas cópias de um texto legal
 *    viram uma cópia desatualizada; `AvisoLicenca.test.tsx` reprova quem
 *    escrever a atribuição à mão em qualquer tela.
 *
 * A decisão de licenciamento inteira está em `docs/licencas/pathfinder2e.md`.
 */
export function AvisoLicenca({ className = '' }: { className?: string }) {
  return (
    <footer
      // `contentinfo` só é implícito no rodapé da página; aqui o componente vive
      // dentro de uma ficha, então o papel é declarado e nomeado.
      role="contentinfo"
      aria-label="Aviso de licença de Pathfinder Segunda Edição"
      className={`border-t border-borda pt-3 text-xs leading-relaxed text-texto-2 ${className}`}
    >
      <p>{ATRIBUICAO_PF2E.texto}</p>
      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {ATRIBUICAO_PF2E.links.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              target="_blank"
              rel="noreferrer noopener"
              className="underline hover:text-texto"
            >
              {link.rotulo}
            </a>
          </li>
        ))}
      </ul>
    </footer>
  );
}
