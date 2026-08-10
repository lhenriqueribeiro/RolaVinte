import type { AlternarCondicaoTokenEntrada, TokenDTO } from '@rolavinte/shared';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type { Token } from '../../dominio/jogo/token';
import { tokenParaDTO } from '../mapeadores';
import type { CenaRepository, MesaRepository } from '../ports/repositorios';
import type { PublicadorEventosMesa } from '../ports/infraestrutura';
import { carregarTokenParaEscritaDoMestre } from './acesso-token';

/** Mensagem única do 403 desta operação — a UI e o teste de contrato citam-na. */
export const APENAS_MESTRE_MARCA_CONDICAO =
  'Apenas o mestre marca condições no token — o jogador move a peça, mas não altera o estado dela.';

/**
 * Marca ou desmarca uma condição num token **já carregado e já autorizado**,
 * persiste e avisa a mesa.
 *
 * ## Por que é uma função, e não só o método do caso de uso abaixo
 *
 * Este é o ponto de reuso combinado com o RV-065: quando o painel de combate
 * zerar o PV de alguém, ele precisa aplicar `CONDICAO_INCONSCIENTE` na peça — e
 * reimplementar "aplica no agregado, salva no repositório, publica
 * `token:atualizado`" lá seria a classe **F5** da taxonomia (guarda
 * reimplementada em vez de reusada), com a agravante de que o esquecimento mais
 * provável é o `publicador`: a condição gravaria no banco e ninguém veria o
 * ícone até dar F5, que é a **F2**.
 *
 * O caminho para o RV-065, na ordem:
 *
 * ```ts
 * const acesso = await carregarTokenParaEscritaDoMestre(cenas, mesas, usuarioId, tokenId, MINHA_MENSAGEM_403);
 * if (!acesso.ok) return falha(acesso.erro);
 * const marcada = await marcarCondicaoNoToken(this.cenas, this.publicador, acesso.valor.mesa.id, acesso.valor.token, {
 *   condicao: CONDICAO_INCONSCIENTE,
 *   aplicada: true,
 * });
 * ```
 *
 * Ela recebe a **entidade**, e não um `tokenId`, exatamente para não repetir a
 * consulta que o chamador acabou de fazer para autorizar.
 *
 * ## O que ela não faz
 *
 * **Não autoriza.** A guarda é do agregado `Mesa` e mora em
 * `carregarTokenParaEscritaDoMestre`, que cobre "só o mestre" e "mesa encerrada"
 * juntas. Chamar esta função sem passar por lá é um bug de quem chama.
 */
export async function marcarCondicaoNoToken(
  cenas: CenaRepository,
  publicador: PublicadorEventosMesa,
  mesaId: string,
  token: Token,
  pedido: AlternarCondicaoTokenEntrada,
): Promise<Result<TokenDTO>> {
  // A única bifurcação do fluxo, e ela é do vocabulário do domínio: marcar é
  // idempotente, desmarcar o que não está marcado é sucesso sem efeito. As duas
  // recusam chave fora do catálogo com a mesma mensagem.
  const alterado = pedido.aplicada
    ? token.aplicarCondicao(pedido.condicao)
    : token.removerCondicao(pedido.condicao);
  if (!alterado.ok) return falha(alterado.erro);

  await cenas.salvarToken(token);

  const dto = tokenParaDTO(token);
  // Mesmo evento do movimento e da renomeação: o token inteiro chega à mesa e o
  // ícone aparece (ou some) para todos sem recarregar. Um evento novo só para
  // condição seria mais um contrato a manter, com o mesmo payload.
  publicador.tokenAtualizado(mesaId, dto);
  return ok(dto);
}

/**
 * Marcar e desmarcar condições da peça (RV-064).
 *
 * Uma condição por requisição, dita como fato (`aplicada: true|false`), e não a
 * lista inteira substituída — a razão está em `alternarCondicaoTokenSchema`: o
 * mestre e o combate escrevem no mesmo token quase ao mesmo tempo, e uma
 * substituição total apagaria a marcação do outro em silêncio.
 *
 * Autorização: privativo do mestre, como as outras escritas de propriedade do
 * token (RV-040). O jogador continua movendo a peça do próprio personagem.
 */
export class AlternarCondicaoToken {
  constructor(
    private readonly cenas: CenaRepository,
    private readonly mesas: MesaRepository,
    private readonly publicador: PublicadorEventosMesa,
  ) {}

  async executar(
    usuarioId: string,
    tokenId: string,
    entrada: AlternarCondicaoTokenEntrada,
  ): Promise<Result<TokenDTO>> {
    const acesso = await carregarTokenParaEscritaDoMestre(
      this.cenas,
      this.mesas,
      usuarioId,
      tokenId,
      APENAS_MESTRE_MARCA_CONDICAO,
    );
    if (!acesso.ok) return falha(acesso.erro);
    const { token, mesa } = acesso.valor;

    return marcarCondicaoNoToken(this.cenas, this.publicador, mesa.id, token, entrada);
  }
}
