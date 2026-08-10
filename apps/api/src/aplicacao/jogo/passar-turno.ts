import type { CombateDTO } from '@rolavinte/shared';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type { CombateRepository, MesaRepository } from '../ports/repositorios';
import type { PublicadorEventosMesa } from '../ports/infraestrutura';
import { carregarCombateParaEscritaDoMestre } from './acesso-combate';
import { avisarNoChat, textoNovaRodada, type DependenciasAviso } from './aviso-de-combate';
import { combateParaDTO } from './combate-dto';

/**
 * Mensagem única do 403.
 *
 * Decisão do RV-062, escrita no card: **só o mestre passa o turno.** "Encerrar meu
 * turno" pelo jogador fica para depois, e o motivo é corrida — dois clientes
 * clicando ao mesmo tempo avançariam dois turnos, e a mesa perderia a vez de
 * alguém sem que ninguém soubesse por quê.
 */
export const APENAS_MESTRE_PASSA_TURNO = 'Apenas o mestre pode passar o turno.';

/**
 * Passa a vez ao próximo participante e, quando a ordem dá a volta, avança a
 * rodada e anuncia no chat (RV-062).
 *
 * O aviso de rodada é **best-effort** (ver `avisarNoChat`): o turno é a operação
 * de negócio, e uma falha ao escrever "Rodada 2" não pode desfazer um combate já
 * gravado.
 */
export class PassarTurno {
  constructor(
    private readonly combates: CombateRepository,
    private readonly mesas: MesaRepository,
    private readonly publicador: PublicadorEventosMesa,
    private readonly aviso: DependenciasAviso,
  ) {}

  async executar(usuarioId: string, combateId: string): Promise<Result<CombateDTO>> {
    const acesso = await carregarCombateParaEscritaDoMestre(
      this.combates,
      this.mesas,
      usuarioId,
      combateId,
      APENAS_MESTRE_PASSA_TURNO,
    );
    if (!acesso.ok) return falha(acesso.erro);
    const { combate, mesa } = acesso.valor;

    // Combate encerrado e combate sem participantes são recusados aqui, pelo
    // agregado, com `conflito` → 409. Nenhuma das duas condições é reimplementada
    // neste caso de uso.
    const turno = combate.proximoTurno();
    if (!turno.ok) return falha(turno.erro);

    await this.combates.salvar(combate);

    if (turno.valor.novaRodada) {
      await avisarNoChat(this.aviso, mesa.id, textoNovaRodada(turno.valor.rodada));
    }

    const dto = combateParaDTO(combate);
    this.publicador.combateAtualizado(mesa.id, dto);
    return ok(dto);
  }
}
