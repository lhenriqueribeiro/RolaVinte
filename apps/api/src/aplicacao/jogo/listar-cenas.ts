import type { CenaDTO } from '@rolavinte/shared';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import { cenaParaDTO } from '../mapeadores';
import type { CenaRepository, MesaRepository } from '../ports/repositorios';

/** Mensagem única do 403 — o contrato do RV-030 depende dela. */
export const APENAS_MESTRE_LISTA_CENAS =
  'Apenas o mestre vê a lista de cenas. Jogadores enxergam somente a cena ativa.';

/**
 * Gestão de cenas do mestre (RV-030). É leitura, então não passa pela guarda de
 * escrita: mesa encerrada continua consultável, como manda o RV-023.
 */
export class ListarCenas {
  constructor(
    private readonly cenas: CenaRepository,
    private readonly mesas: MesaRepository,
  ) {}

  async executar(usuarioId: string, mesaId: string): Promise<Result<CenaDTO[]>> {
    const mesa = await this.mesas.buscarPorId(mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));
    if (!mesa.ehMestre(usuarioId)) {
      return falha(ErroDominio.naoAutorizado(APENAS_MESTRE_LISTA_CENAS));
    }

    const cenas = await this.cenas.listarDaMesa(mesaId);
    return ok(cenas.map(cenaParaDTO));
  }
}
