import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type { CenaRepository, MesaRepository } from '../ports/repositorios';
import type { ArmazenamentoArquivos, PublicadorEventosMesa } from '../ports/infraestrutura';
import { removerArquivosBestEffort } from './limpeza-armazenamento';

/**
 * Remove a peça da cena (RV-040) e leva a arte dela junto (RV-047).
 *
 * O armazenamento é o dos **tokens** — bucket separado do de mapas, montado no
 * composition root. A limpeza é best-effort e acontece depois do broadcast: a
 * exclusão já está persistida, e o aviso à mesa não pode esperar (nem depender
 * de) uma chamada ao Storage.
 */
export class RemoverToken {
  constructor(
    private readonly cenas: CenaRepository,
    private readonly mesas: MesaRepository,
    private readonly publicador: PublicadorEventosMesa,
    private readonly armazenamentoTokens: ArmazenamentoArquivos,
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

    // O caminho vem da entidade, nunca reconstruído a partir da URL: a extensão
    // muda entre uploads e a URL pública tem prefixo do provedor.
    await removerArquivosBestEffort(this.armazenamentoTokens, [token.imagemCaminho]);
    return ok(undefined);
  }
}
