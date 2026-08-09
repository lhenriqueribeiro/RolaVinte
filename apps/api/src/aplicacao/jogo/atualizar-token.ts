import type { AtualizarTokenEntrada, TokenDTO } from '@rolavinte/shared';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import { tokenParaDTO } from '../mapeadores';
import type { CenaRepository, MesaRepository } from '../ports/repositorios';
import type { PublicadorEventosMesa } from '../ports/infraestrutura';
import { carregarTokenParaEscritaDoMestre } from './acesso-token';

/** Mensagem única do 403 desta operação — a UI e o teste de contrato citam-na. */
export const APENAS_MESTRE_EDITA_TOKEN =
  'Apenas o mestre edita as propriedades do token — jogador move, mas não renomeia.';

/**
 * Renomear e recolorir um token já criado (RV-040).
 *
 * Corrigir um erro de digitação não pode exigir apagar e recriar a peça, que
 * perderia posição e vínculo com o personagem. A posição **não** entra aqui: é
 * a única escrita de token que o jogador faz, e tem rota e autorização
 * próprias (`MoverToken`).
 */
export class AtualizarToken {
  constructor(
    private readonly cenas: CenaRepository,
    private readonly mesas: MesaRepository,
    private readonly publicador: PublicadorEventosMesa,
  ) {}

  async executar(
    usuarioId: string,
    tokenId: string,
    dados: AtualizarTokenEntrada,
  ): Promise<Result<TokenDTO>> {
    const acesso = await carregarTokenParaEscritaDoMestre(
      this.cenas,
      this.mesas,
      usuarioId,
      tokenId,
      APENAS_MESTRE_EDITA_TOKEN,
    );
    if (!acesso.ok) return falha(acesso.erro);
    const { token, mesa } = acesso.valor;

    const atualizado = token.atualizar(dados);
    if (!atualizado.ok) return falha(atualizado.erro);

    await this.cenas.salvarToken(token);

    const dto = tokenParaDTO(token);
    // Mesmo evento do movimento: o token inteiro chega à mesa, e o novo nome
    // aparece para todos sem recarregar.
    this.publicador.tokenAtualizado(mesa.id, dto);
    return ok(dto);
  }
}
