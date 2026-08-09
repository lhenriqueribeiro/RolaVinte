import type { CriarTokenEntrada, TokenDTO } from '@rolavinte/shared';
import { Token } from '../../dominio/jogo/token';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import { tokenParaDTO } from '../mapeadores';
import type { CenaRepository, MesaRepository } from '../ports/repositorios';
import type { GeradorId, PublicadorEventosMesa } from '../ports/infraestrutura';

export class CriarToken {
  constructor(
    private readonly cenas: CenaRepository,
    private readonly mesas: MesaRepository,
    private readonly geradorId: GeradorId,
    private readonly publicador: PublicadorEventosMesa,
  ) {}

  async executar(usuarioId: string, entrada: CriarTokenEntrada): Promise<Result<TokenDTO>> {
    const cena = await this.cenas.buscarPorId(entrada.cenaId);
    if (!cena) return falha(ErroDominio.naoEncontrado('Cena não encontrada.'));

    const mesa = await this.mesas.buscarPorId(cena.mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));
    const permitido = mesa.autorizarEscritaDoMestre(
      usuarioId,
      'Apenas o mestre adiciona tokens à cena.',
    );
    if (!permitido.ok) return falha(permitido.erro);

    const token = Token.criar({
      id: this.geradorId.gerar(),
      cena,
      cenaId: cena.id,
      nome: entrada.nome,
      cor: entrada.cor,
      x: entrada.x,
      y: entrada.y,
      personagemId: entrada.personagemId,
    });
    if (!token.ok) return falha(token.erro);

    await this.cenas.salvarToken(token.valor);
    const dto = tokenParaDTO(token.valor);
    this.publicador.tokenCriado(mesa.id, dto);
    return ok(dto);
  }
}
