import type { CenaDTO, CriarCenaEntrada } from '@rolavinte/shared';
import { Cena } from '../../dominio/jogo/cena';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import { cenaParaDTO } from '../mapeadores';
import type { CenaRepository, MesaRepository } from '../ports/repositorios';
import type { GeradorId, PublicadorEventosMesa } from '../ports/infraestrutura';

export class CriarCena {
  constructor(
    private readonly cenas: CenaRepository,
    private readonly mesas: MesaRepository,
    private readonly geradorId: GeradorId,
    private readonly publicador: PublicadorEventosMesa,
  ) {}

  async executar(usuarioId: string, entrada: CriarCenaEntrada): Promise<Result<CenaDTO>> {
    const mesa = await this.mesas.buscarPorId(entrada.mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));
    const permitido = mesa.autorizarEscritaDoMestre(usuarioId, 'Apenas o mestre cria cenas.');
    if (!permitido.ok) return falha(permitido.erro);

    const cena = Cena.criar({
      id: this.geradorId.gerar(),
      mesaId: entrada.mesaId,
      nome: entrada.nome,
      larguraGrid: entrada.larguraGrid,
      alturaGrid: entrada.alturaGrid,
      corFundo: entrada.corFundo,
      tamanhoCelula: entrada.tamanhoCelula,
      gridVisivel: entrada.gridVisivel,
      corGrid: entrada.corGrid,
    });
    if (!cena.ok) return falha(cena.erro);

    // Nova cena nasce ativa; as demais são desativadas (uma cena ativa por mesa).
    await this.cenas.desativarTodasDaMesa(entrada.mesaId);
    await this.cenas.salvar(cena.valor);

    const dto = cenaParaDTO(cena.valor);
    this.publicador.cenaAtivada(entrada.mesaId, dto);
    return ok(dto);
  }
}
