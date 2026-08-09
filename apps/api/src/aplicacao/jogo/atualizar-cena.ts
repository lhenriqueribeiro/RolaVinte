import type { AtualizarCenaEntrada, CenaDTO } from '@rolavinte/shared';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import { cenaParaDTO } from '../mapeadores';
import type { CenaRepository, MesaRepository } from '../ports/repositorios';
import type { PublicadorEventosMesa } from '../ports/infraestrutura';
import { carregarCenaParaEscritaDoMestre } from './acesso-cena';

/** Renomear a cena e ajustar grid/cores (RV-030 / RV-033). */
export class AtualizarCena {
  constructor(
    private readonly cenas: CenaRepository,
    private readonly mesas: MesaRepository,
    private readonly publicador: PublicadorEventosMesa,
  ) {}

  async executar(
    usuarioId: string,
    cenaId: string,
    dados: AtualizarCenaEntrada,
  ): Promise<Result<CenaDTO>> {
    const acesso = await carregarCenaParaEscritaDoMestre(
      this.cenas,
      this.mesas,
      usuarioId,
      cenaId,
      'Apenas o mestre edita cenas.',
    );
    if (!acesso.ok) return falha(acesso.erro);
    const { cena, mesa } = acesso.valor;

    const atualizada = cena.atualizar(dados);
    if (!atualizada.ok) return falha(atualizada.erro);

    await this.cenas.salvar(cena);

    const dto = cenaParaDTO(cena);
    // Só a cena ativa está na tela de alguém: mudar uma cena de bastidores não
    // precisa incomodar a mesa.
    if (cena.ativa) this.publicador.cenaAtivada(mesa.id, dto);
    return ok(dto);
  }
}
