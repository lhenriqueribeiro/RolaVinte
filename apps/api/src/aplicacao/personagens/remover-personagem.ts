import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type { MesaRepository, PersonagemRepository } from '../ports/repositorios';

const NEGADO = 'Só o dono do personagem ou o mestre podem excluir a ficha.';

/**
 * Exclui uma ficha (RV-093).
 *
 * Três guardas, nesta ordem e todas no caso de uso — nenhuma delas mora só na
 * interface (F4 da taxonomia):
 *
 * 1. a ficha existe;
 * 2. quem pede é o dono **ou** o mestre da mesa (`Personagem.autorizarEscrita`,
 *    a mesma guarda da edição — F5);
 * 3. a mesa está aberta (`Mesa.autorizarEscritaDeParticipante`, que cobre
 *    participação e encerramento juntos).
 *
 * O que acontece com os tokens é decisão do banco: `tokens.personagem_id` é
 * `on delete set null` desde a migration 0001, então as peças **permanecem na
 * cena**, desvinculadas e sem barra de vida — a barra é desenhada a partir do
 * `PersonagemDTO`, e ele deixou de existir. Nada de Storage a limpar: a arte
 * pertence ao token, não à ficha.
 */
export class RemoverPersonagem {
  constructor(
    private readonly personagens: PersonagemRepository,
    private readonly mesas: MesaRepository,
  ) {}

  async executar(usuarioId: string, personagemId: string): Promise<Result<void>> {
    const personagem = await this.personagens.buscarPorId(personagemId);
    if (!personagem) return falha(ErroDominio.naoEncontrado('Personagem não encontrado.'));

    const mesa = await this.mesas.buscarPorId(personagem.mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));

    const dono = personagem.autorizarEscrita(usuarioId, mesa.ehMestre(usuarioId), NEGADO);
    if (!dono.ok) return falha(dono.erro);

    const aberta = mesa.autorizarEscritaDeParticipante(usuarioId);
    if (!aberta.ok) return falha(aberta.erro);

    await this.personagens.remover(personagemId);
    return ok(undefined);
  }
}
