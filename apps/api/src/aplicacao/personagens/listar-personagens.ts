import type { PersonagemDTO } from '@rolavinte/shared';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type { MesaRepository, PersonagemRepository } from '../ports/repositorios';

export class ListarPersonagens {
  constructor(
    private readonly personagens: PersonagemRepository,
    private readonly mesas: MesaRepository,
  ) {}

  async executar(usuarioId: string, mesaId: string): Promise<Result<PersonagemDTO[]>> {
    const mesa = await this.mesas.buscarPorId(mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));
    if (!mesa.ehParticipante(usuarioId)) {
      return falha(ErroDominio.naoAutorizado('Você não participa desta mesa.'));
    }
    return ok(await this.personagens.listarDaMesa(mesaId));
  }
}
