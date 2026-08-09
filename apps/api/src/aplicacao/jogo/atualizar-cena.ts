import type { AtualizarCenaEntrada, CenaDTO } from '@rolavinte/shared';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import { cenaParaDTO } from '../mapeadores';
import type { CenaRepository, MesaRepository } from '../ports/repositorios';
import type { PublicadorEventosMesa } from '../ports/infraestrutura';
import { carregarCenaParaEscritaDoMestre } from './acesso-cena';

/**
 * Recusa da redução de grid (RV-036) — o número de peças é a informação que o
 * mestre precisa para agir; "tamanho inválido" não diz o que fazer.
 */
export function mensagemTokensForaDoGrid(quantidade: number): string {
  return quantidade === 1
    ? 'Reduzir o grid deixaria 1 peça fora do mapa. Mova-a para dentro da nova área antes de encolher a cena.'
    : `Reduzir o grid deixaria ${quantidade} peças fora do mapa. Mova-as para dentro da nova área antes de encolher a cena.`;
}

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

    // RV-036: encolher o grid é a única edição que pode abandonar peças fora do
    // mapa. A política é **recusar**, não reposicionar: mover token de terceiro
    // sem o mestre pedir é surpresa pior que um 409, e a API não move nada que
    // não tenha sido pedido. A consulta só acontece quando algum lado diminui —
    // um ajuste de cor não paga uma leitura de tokens.
    if (cena.reduziriaGrid(dados)) {
      const tokens = await this.cenas.listarTokensDaCena(cena.id);
      const fora = cena.posicoesForaDoGrid(dados, tokens);
      if (fora.length > 0) {
        return falha(ErroDominio.conflito(mensagemTokensForaDoGrid(fora.length)));
      }
    }

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
