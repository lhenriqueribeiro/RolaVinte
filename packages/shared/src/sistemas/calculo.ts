import type { SistemaRpg } from '../schemas/mesas';
import { formatarBonus } from './generico';
import { definicaoDoSistema } from './registro';
import type {
  AcaoDePericia,
  DadosFicha,
  FamiliaPericia,
  FichaCalculavel,
  PericiaFicha,
} from './tipos';

export { formatarBonus };

/**
 * Cálculos de ficha (RV-090) — funções **puras**, sem banco, sem React, sem
 * Fastify. Rodam igual no navegador (para mostrar o número na ficha) e na api
 * (para montar a expressão da rolagem), que é o motivo de viverem aqui.
 *
 * Nenhuma delas sabe o nome de um sistema: todas perguntam a definição ao
 * registro e delegam. Trocar o corpo destas funções por um `switch (sistema)`
 * seria desfazer o RV-091.
 */

/** Uma ficha com o sistema junto — o mínimo para calcular qualquer bônus. */
export interface PersonagemCalculavel extends FichaCalculavel {
  sistema: SistemaRpg;
}

/** As perícias de chave fixa que o sistema define, na ordem de exibição. */
export function periciasDoSistema(sistema: SistemaRpg): readonly PericiaFicha[] {
  return definicaoDoSistema(sistema).pericias;
}

/** As famílias de perícia do sistema (Saber, no PF2e). `[]` na maioria. */
export function familiasDePericia(sistema: SistemaRpg): readonly FamiliaPericia[] {
  return definicaoDoSistema(sistema).familiasPericia;
}

/**
 * As perícias que **esta ficha** mostra: as de chave fixa mais as instâncias
 * das famílias, nesta ordem (RV-153).
 *
 * A distinção existe porque "Saber (Guerra)" é perícia do personagem, não do
 * sistema: ela nasce quando o jogador a cria e some quando ele a remove. Quem
 * renderiza a ficha percorre esta lista e não precisa saber que famílias
 * existem — nem que sistema é.
 */
export function periciasDaFicha(personagem: PersonagemCalculavel): readonly PericiaFicha[] {
  const definicao = definicaoDoSistema(personagem.sistema);
  return [
    ...definicao.pericias,
    ...definicao.familiasPericia.flatMap((familia) => familia.instancias(personagem)),
  ];
}

/** As ações daquela perícia, já resolvidas contra o grau desta ficha. */
export function acoesDePericia(
  personagem: PersonagemCalculavel,
  pericia: string,
): readonly AcaoDePericia[] {
  return definicaoDoSistema(personagem.sistema).acoesDePericia(personagem, pericia);
}

/**
 * Bônus total da perícia. `null` quando o sistema não tem essa perícia — quem
 * chama decide se isso é "não mostre nada" (ficha) ou 400 (api).
 */
export function bonusPericia(personagem: PersonagemCalculavel, pericia: string): number | null {
  return definicaoDoSistema(personagem.sistema).bonusPericia(personagem, pericia);
}

/** Grau de treinamento atual da perícia; `null` se a perícia não existe. */
export function grauDePericia(personagem: PersonagemCalculavel, pericia: string): string | null {
  return definicaoDoSistema(personagem.sistema).grauDePericia(personagem, pericia);
}

/** Cópia de `dados` com o grau trocado. Não muta a entrada. */
export function definirGrauDePericia(
  sistema: SistemaRpg,
  dados: DadosFicha,
  pericia: string,
  grau: string,
): DadosFicha {
  return definicaoDoSistema(sistema).definirGrauDePericia(dados, pericia, grau);
}

/**
 * Expressão pronta para o motor de dados: `1d20+5`. `null` para perícia
 * inexistente.
 */
export function expressaoDePericia(
  personagem: PersonagemCalculavel,
  pericia: string,
): string | null {
  const bonus = bonusPericia(personagem, pericia);
  if (bonus === null) return null;
  return `${definicaoDoSistema(personagem.sistema).dadoDeTeste}${formatarBonus(bonus)}`;
}

/**
 * Motivo que acompanha a rolagem no chat: `Furtividade — Thorin`.
 *
 * Mora aqui, e não no componente, para que api e web escrevam a mesma frase. O
 * separador é travessão, como no resto da interface.
 */
export function motivoDeRolagemDePericia(
  sistema: SistemaRpg,
  pericia: string,
  nomePersonagem: string,
): string | null {
  const definicao = definicaoDoSistema(sistema);
  // Perícia de família (`Saber (Guerra)`) não está em `pericias`: o rótulo dela
  // é derivado da própria chave, e é por isso que o motivo da rolagem pode ser
  // montado aqui sem a ficha em mãos.
  const rotulo =
    definicao.pericias.find((p) => p.chave === pericia)?.rotulo ??
    definicao.familiasPericia.reduce<string | null>(
      (achado, familia) => achado ?? familia.rotuloDeInstancia(pericia),
      null,
    );
  if (rotulo === null || rotulo === undefined) return null;
  return `${rotulo} — ${nomePersonagem}`;
}
