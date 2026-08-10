import type { SistemaRpg } from '../schemas/mesas';
import { formatarBonus } from './generico';
import { definicaoDoSistema } from './registro';
import type {
  AcaoDePericia,
  AtaqueDaFicha,
  DadosFicha,
  DefesaFicha,
  FamiliaPericia,
  FichaCalculavel,
  ModeloDeAtaques,
  PericiaFicha,
  RolagemDeAtaque,
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
 * Motivo que acompanha uma rolagem de ficha no chat: `Furtividade — Thorin`.
 *
 * Mora aqui, e não no componente, para que api e web escrevam a mesma frase e o
 * separador (travessão, como no resto da interface) esteja escrito uma vez.
 */
function motivoDeRolagem(rotulo: string, nomePersonagem: string): string {
  return `${rotulo} — ${nomePersonagem}`;
}

/**
 * Motivo que acompanha a rolagem de perícia no chat: `Furtividade — Thorin`.
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
  return motivoDeRolagem(rotulo, nomePersonagem);
}

/**
 * Uma defesa derivada com o que a tela precisa para **rolá-la** (RV-155).
 *
 * O que este nível acrescenta a `DefesaFicha` é a ponte com o motor de dados: a
 * expressão (`1d20+6`, com o dado que o sistema declara) e o motivo do chat
 * (`Reflexos — Seelah`). Fica aqui, e não no componente, pelo mesmo motivo de
 * `expressaoDePericia`: a tela não monta expressão nem faz aritmética, e api e web
 * chegam à mesma frase.
 *
 * `expressao` e `motivo` são `null` no que **não se rola** — CA e CD de classe são
 * números-alvo. Botão de dado numa CA seria a promessa falsa da F6: o clique
 * publicaria uma rolagem que não significa nada.
 */
export interface DefesaCalculada extends DefesaFicha {
  /** Expressão pronta para o motor de dados; `null` quando a defesa não se rola. */
  readonly expressao: string | null;
  /** Motivo que acompanha a rolagem no chat; `null` quando a defesa não se rola. */
  readonly motivo: string | null;
}

/**
 * As defesas do personagem, prontas para exibir e rolar. `[]` no sistema que não
 * as modela.
 *
 * É por aqui que o RV-158 acha a Percepção para a iniciativa — a mesma conta que a
 * ficha mostra, sem uma segunda soma no caso de uso do combate.
 */
export function defesasDoPersonagem(
  personagem: PersonagemCalculavel,
  nomePersonagem: string,
): readonly DefesaCalculada[] {
  const definicao = definicaoDoSistema(personagem.sistema);
  return definicao.defesas(personagem).map((defesa) => {
    const { valor, rolavel } = defesa;
    if (!rolavel || valor === null) return { ...defesa, expressao: null, motivo: null };
    return {
      ...defesa,
      expressao: `${definicao.dadoDeTeste}${formatarBonus(valor)}`,
      motivo: motivoDeRolagem(defesa.rotulo, nomePersonagem),
    };
  });
}

/**
 * Uma variante de rolagem de ataque com o motivo do chat pronto (RV-156).
 *
 * O motivo é montado aqui, e não em `sistemas/pathfinder2e/ataques.ts`, pelo mesmo
 * motivo das defesas e das perícias: o travessão que separa a rolagem do nome do
 * personagem está escrito **uma vez** neste arquivo, e é ele que faz o chat de uma
 * mesa de PF2e falar igual ao de uma mesa de D&D.
 */
export interface RolagemDeAtaqueCalculada extends RolagemDeAtaque {
  /** `Espada longa (2º ataque (-5)) — Seelah`; `null` quando não há o que rolar. */
  readonly motivo: string | null;
}

/** Um ataque com as suas variantes prontas para o chat (RV-156). */
export interface AtaqueCalculado extends Omit<AtaqueDaFicha, 'acertos' | 'danos'> {
  /** As variantes de acerto. **São as únicas que aceitam CD** (a CA do alvo). */
  readonly acertos: readonly RolagemDeAtaqueCalculada[];
  /** As variantes de dano. Nunca recebem CD: dano não é checado contra CD. */
  readonly danos: readonly RolagemDeAtaqueCalculada[];
}

/** O modelo de ataques do sistema, ou `null` no sistema que não os modela. */
export function modeloDeAtaques(sistema: SistemaRpg): ModeloDeAtaques | null {
  return definicaoDoSistema(sistema).ataques;
}

function comMotivo(rolagem: RolagemDeAtaque, nomePersonagem: string): RolagemDeAtaqueCalculada {
  return {
    ...rolagem,
    motivo: rolagem.expressao === null ? null : motivoDeRolagem(rolagem.descricao, nomePersonagem),
  };
}

/**
 * Os ataques do personagem, prontos para exibir e rolar. `[]` no sistema que não
 * modela ataques.
 *
 * A aritmética da penalidade de ataques múltiplos é do sistema (`regras.ts` +
 * `ataques.ts`); aqui só se acrescenta o motivo. A tela não soma nada — se ela
 * somasse, a mesma penalidade estaria escrita em dois lugares.
 */
export function ataquesDoPersonagem(
  personagem: PersonagemCalculavel,
  nomePersonagem: string,
): readonly AtaqueCalculado[] {
  const modelo = definicaoDoSistema(personagem.sistema).ataques;
  if (modelo === null) return [];
  return modelo.ataques(personagem).map((ataque) => ({
    ...ataque,
    acertos: ataque.acertos.map((rolagem) => comMotivo(rolagem, nomePersonagem)),
    danos: ataque.danos.map((rolagem) => comMotivo(rolagem, nomePersonagem)),
  }));
}
