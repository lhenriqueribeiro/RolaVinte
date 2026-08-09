import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type { CenaRepository, MesaRepository } from '../ports/repositorios';
import type { PublicadorEventosMesa } from '../ports/infraestrutura';

export class RemoverToken {
  constructor(
    private readonly cenas: CenaRepository,
    private readonly mesas: MesaRepository,
    private readonly publicador: PublicadorEventosMesa,
  ) {}

  async executar(usuarioId: string, tokenId: string): Promise<Result<void>> {
    const token = await this.cenas.buscarTokenPorId(tokenId);
    if (!token) return falha(ErroDominio.naoEncontrado('Token não encontrado.'));

    const cena = await this.cenas.buscarPorId(token.cenaId);
    if (!cena) return falha(ErroDominio.naoEncontrado('Cena não encontrada.'));

    const mesa = await this.mesas.buscarPorId(cena.mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));
    const permitido = mesa.autorizarEscritaDoMestre(usuarioId, 'Apenas o mestre remove tokens.');
    if (!permitido.ok) return falha(permitido.erro);

    await this.cenas.removerToken(tokenId);
    this.publicador.tokenRemovido(mesa.id, { tokenId, cenaId: cena.id });
    return ok(undefined);
  }
}
