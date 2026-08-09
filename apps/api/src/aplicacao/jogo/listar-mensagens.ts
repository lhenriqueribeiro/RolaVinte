import type { MensagemDTO } from '@rolavinte/shared';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type { MensagemRepository, MesaRepository } from '../ports/repositorios';

const LIMITE_PADRAO = 100;

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
    return ok(await this.mensagens.listarDaMesa(mesaId, LIMITE_PADRAO));
  }
}
