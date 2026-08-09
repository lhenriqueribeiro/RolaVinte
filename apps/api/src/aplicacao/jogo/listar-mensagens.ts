import type { MensagemDTO } from '@rolavinte/shared';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type { MensagemRepository, MesaRepository } from '../ports/repositorios';

const LIMITE_PADRAO = 100;

/**
 * Histórico do chat. Leitura, então mesa encerrada continua consultável
 * (`ehParticipante`, coerente com o RV-023).
 *
 * A privacidade de sussurro e rolagem oculta (RV-070/RV-071) é do repositório:
 * `solicitanteId` desce até a consulta e as mensagens restritas de terceiros
 * nunca entram no resultado. Não há filtro depois daqui — se houvesse, o dado
 * já teria sido carregado e um erro de mapeamento o entregaria.
 */
export class ListarMensagens {
  constructor(
    private readonly mensagens: MensagemRepository,
    private readonly mesas: MesaRepository,
  ) {}

  async executar(usuarioId: string, mesaId: string): Promise<Result<MensagemDTO[]>> {
    const mesa = await this.mesas.buscarPorId(mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));
    if (!mesa.ehParticipante(usuarioId)) {
      return falha(ErroDominio.naoAutorizado('Você não participa desta mesa.'));
    }
    return ok(await this.mensagens.listarDaMesa(mesaId, usuarioId, LIMITE_PADRAO));
  }
}
