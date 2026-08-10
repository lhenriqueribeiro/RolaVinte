import type { CombateAtivoDTO } from '@rolavinte/shared';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type { CombateRepository, MesaRepository } from '../ports/repositorios';
import { combateParaDTO } from './combate-dto';

/**
 * O combate ativo da mesa, para o painel de iniciativa (RV-063).
 *
 * Leitura de **todo participante**, não só do mestre: a ordem e de quem é a vez são
 * justamente o que os jogadores precisam ver. Quem não participa da mesa não lê —
 * `ehParticipante` aqui, e não `autorizarEscritaDeParticipante`, porque ler o
 * combate de uma mesa encerrada é legítimo (é o histórico da última luta), e
 * bloquear a leitura ao encerrar deixaria a aba de combate quebrada em vez de
 * somente leitura.
 *
 * `null` quando não há combate ativo — é o estado normal da mesa fora da luta, não
 * um 404.
 */
export class ObterCombate {
  constructor(
    private readonly combates: CombateRepository,
    private readonly mesas: MesaRepository,
  ) {}

  async executar(usuarioId: string, mesaId: string): Promise<Result<CombateAtivoDTO>> {
    const mesa = await this.mesas.buscarPorId(mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));
    if (!mesa.ehParticipante(usuarioId)) {
      return falha(ErroDominio.naoAutorizado('Você não participa desta mesa.'));
    }

    const combate = await this.combates.buscarAtivoDaMesa(mesaId);
    return ok({ combate: combate ? combateParaDTO(combate) : null });
  }
}
