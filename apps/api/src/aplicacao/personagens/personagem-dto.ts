import type { PersonagemDTO, SistemaRpg } from '@rolavinte/shared';
import type { Personagem } from '../../dominio/personagens/personagem';

/**
 * Monta o `PersonagemDTO` a partir do agregado.
 *
 * Existe em um lugar só porque quatro casos de uso o devolvem (criar, atualizar,
 * duplicar e — via read model — listar). Enquanto cada um montava o objeto à
 * mão, um campo novo no DTO exigia lembrar de quatro edições, e o esquecimento
 * compilava.
 *
 * `sistema` vem de fora, do agregado `Mesa`: o `Personagem` não o guarda (ver o
 * comentário em `dominio/personagens/personagem.ts`).
 */
export function montarPersonagemDTO(
  personagem: Personagem,
  donoNome: string,
  sistema: SistemaRpg,
): PersonagemDTO {
  return {
    id: personagem.id,
    mesaId: personagem.mesaId,
    donoId: personagem.donoId,
    donoNome,
    nome: personagem.nome,
    classe: personagem.classe,
    nivel: personagem.nivel,
    pvAtual: personagem.pvAtual,
    pvMax: personagem.pvMax,
    atributos: personagem.atributos,
    anotacoes: personagem.anotacoes,
    sistema,
    dados: personagem.dados,
  };
}
