import type { CenaComTokensDTO } from '@rolavinte/shared';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import { cenaParaDTO, tokenParaDTO } from '../mapeadores';
import type { CenaRepository, MesaRepository } from '../ports/repositorios';
import type { PublicadorEventosMesa } from '../ports/infraestrutura';
import { carregarCenaParaEscritaDoMestre } from './acesso-cena';

/**
 * Troca a cena ativa da mesa em um clique (RV-031).
 *
 * Devolve a cena **com os tokens** para que o mestre não dependa de um refetch
 * logo após a troca; os demais participantes recebem `cena:ativada` e buscam os
 * tokens pelo caminho normal.
 */
export class AtivarCena {
  constructor(
    private readonly cenas: CenaRepository,
    private readonly mesas: MesaRepository,
    private readonly publicador: PublicadorEventosMesa,
  ) {}

  async executar(usuarioId: string, cenaId: string): Promise<Result<CenaComTokensDTO>> {
    const acesso = await carregarCenaParaEscritaDoMestre(
      this.cenas,
      this.mesas,
      usuarioId,
      cenaId,
      'Apenas o mestre ativa cenas.',
    );
    if (!acesso.ok) return falha(acesso.erro);
    const { cena, mesa } = acesso.valor;

    // Uma cena ativa por mesa: desativa todas e ativa esta em seguida.
    await this.cenas.desativarTodasDaMesa(mesa.id);
    cena.ativar();
    await this.cenas.salvar(cena);

    const dto = cenaParaDTO(cena);
    this.publicador.cenaAtivada(mesa.id, dto);

    const tokens = await this.cenas.listarTokensDaCena(cena.id);
    return ok({ cena: dto, tokens: tokens.map(tokenParaDTO) });
  }
}
