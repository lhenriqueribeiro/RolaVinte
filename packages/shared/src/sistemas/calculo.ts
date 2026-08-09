import type { SistemaRpg } from '../schemas/mesas';
import { formatarBonus } from './generico';
import { definicaoDoSistema } from './registro';
import type { DadosFicha, FichaCalculavel, PericiaFicha } from './tipos';

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

/** As perícias que o sistema define, na ordem de exibição. */
export function periciasDoSistema(sistema: SistemaRpg): readonly PericiaFicha[] {
  return definicaoDoSistema(sistema).pericias;
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
  const encontrada = definicao.pericias.find((p) => p.chave === pericia);
  if (!encontrada) return null;
  return `${encontrada.rotulo} — ${nomePersonagem}`;
}
