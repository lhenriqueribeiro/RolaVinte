import type { CenaComTokensDTO } from '@rolavinte/shared';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import { cenaParaDTO, tokenParaDTO } from '../mapeadores';
import type { CenaRepository, MesaRepository } from '../ports/repositorios';

export class ObterCenaAtiva {
  constructor(
    private readonly cenas: CenaRepository,
    private readonly mesas: MesaRepository,
  ) {}

  async executar(usuarioId: string, mesaId: string): Promise<Result<CenaComTokensDTO>> {
    const mesa = await this.mesas.buscarPorId(mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));
    if (!mesa.ehParticipante(usuarioId)) {
      return falha(ErroDominio.naoAutorizado('Você não participa desta mesa.'));
    }

    const cena = await this.cenas.buscarAtivaDaMesa(mesaId);
    if (!cena) return ok({ cena: null, tokens: [] });

    const tokens = await this.cenas.listarTokensDaCena(cena.id);
    return ok({ cena: cenaParaDTO(cena), tokens: tokens.map(tokenParaDTO) });
  }
}
