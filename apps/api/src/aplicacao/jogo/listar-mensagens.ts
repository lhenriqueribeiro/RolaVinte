import { LIMITE_MENSAGENS_PADRAO, type MensagemDTO } from '@rolavinte/shared';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type { MensagemRepository, MesaRepository, PaginaHistorico } from '../ports/repositorios';

/**
 * Primeira página, do tamanho padrão — o que uma chamada sem querystring pede.
 * Congelado porque é compartilhado por todas as chamadas que omitem a página.
 */
const PRIMEIRA_PAGINA: PaginaHistorico = Object.freeze({
  limite: LIMITE_MENSAGENS_PADRAO,
  antesDe: null,
});

/**
 * Histórico do chat. Leitura, então mesa encerrada continua consultável
 * (`ehParticipante`, coerente com o RV-023).
 *
 * A privacidade de sussurro e rolagem oculta (RV-070/RV-071) é do repositório:
 * `solicitanteId` desce até a consulta e as mensagens restritas de terceiros
 * nunca entram no resultado. Não há filtro depois daqui — se houvesse, o dado
 * já teria sido carregado e um erro de mapeamento o entregaria.
 *
 * A paginação (RV-073) desce pelo mesmo caminho, e pelo mesmo motivo: recortar
 * a janela aqui, depois de trazer o bolo inteiro do banco, seria carregar o
 * segredo alheio para descartá-lo — e voltaria a dar teto ao histórico.
 */
export class ListarMensagens {
  constructor(
    private readonly mensagens: MensagemRepository,
    private readonly mesas: MesaRepository,
  ) {}

  async executar(
    usuarioId: string,
    mesaId: string,
    pagina: PaginaHistorico = PRIMEIRA_PAGINA,
  ): Promise<Result<MensagemDTO[]>> {
    const mesa = await this.mesas.buscarPorId(mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));
    if (!mesa.ehParticipante(usuarioId)) {
      return falha(ErroDominio.naoAutorizado('Você não participa desta mesa.'));
    }
    return ok(await this.mensagens.listarDaMesa(mesaId, usuarioId, pagina));
  }
}
