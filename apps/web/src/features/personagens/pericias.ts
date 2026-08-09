import {
  bonusPericia,
  definicaoDoSistema,
  expressaoDePericia,
  formatarBonus,
  grauDePericia,
  motivoDeRolagemDePericia,
  type GrauPericia,
  type PersonagemCalculavel,
  type SistemaRpg,
} from '@rolavinte/shared';

/**
 * A seção de perícias da ficha, já resolvida (RV-090).
 *
 * Existe como função pura por dois motivos. O primeiro é o de sempre: conta
 * testada sem navegador. O segundo é específico deste card — as quatro funções
 * de `@rolavinte/shared` devolvem `null` para perícia inexistente, e resolver
 * esse `null` dentro do JSX encheria o componente de guardas que nunca disparam
 * (a lista vem da própria definição). Aqui a ausência é filtrada uma vez, e o
 * componente recebe linhas completas.
 *
 * Um sistema sem perícias devolve lista vazia — é a resposta certa, não um erro:
 * a ficha genérica simplesmente não mostra a seção.
 */
export interface LinhaDePericia {
  chave: string;
  rotulo: string;
  /** Chave do grau de treinamento atual (`destreinado`, `proficiente`, …). */
  grau: string;
  bonus: number;
  /** O mesmo bônus pronto para leitura: `+5`, `-1`, `+0`. */
  bonusFormatado: string;
  /** Expressão pronta para o motor de dados: `1d20+5`. */
  expressao: string;
  /** Motivo que acompanha a rolagem no chat: `Furtividade — Thorin`. */
  motivo: string;
}

export function linhasDePericia(
  ficha: PersonagemCalculavel,
  nomePersonagem: string,
): LinhaDePericia[] {
  return definicaoDoSistema(ficha.sistema).pericias.flatMap((pericia) => {
    const bonus = bonusPericia(ficha, pericia.chave);
    const expressao = expressaoDePericia(ficha, pericia.chave);
    const motivo = motivoDeRolagemDePericia(ficha.sistema, pericia.chave, nomePersonagem);
    const grau = grauDePericia(ficha, pericia.chave);
    if (bonus === null || expressao === null || motivo === null || grau === null) return [];
    return [
      {
        chave: pericia.chave,
        rotulo: pericia.rotulo,
        grau,
        bonus,
        bonusFormatado: formatarBonus(bonus),
        expressao,
        motivo,
      },
    ];
  });
}

/** Os graus que o sistema oferece, na ordem declarada pela definição. */
export function grausDoSistema(sistema: SistemaRpg): readonly GrauPericia[] {
  return definicaoDoSistema(sistema).grausPericia;
}
