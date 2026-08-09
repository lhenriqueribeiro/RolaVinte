import type { TokenDTO } from '@rolavinte/shared';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import { tokenParaDTO } from '../mapeadores';
import type { CenaRepository, MesaRepository, PersonagemRepository } from '../ports/repositorios';
import type { PublicadorEventosMesa } from '../ports/infraestrutura';

export class MoverToken {
  constructor(
    private readonly cenas: CenaRepository,
    private readonly mesas: MesaRepository,
    private readonly personagens: PersonagemRepository,
    private readonly publicador: PublicadorEventosMesa,
  ) {}

  async executar(
    usuarioId: string,
    entrada: { tokenId: string; x: number; y: number },
  ): Promise<Result<TokenDTO>> {
    const token = await this.cenas.buscarTokenPorId(entrada.tokenId);
    if (!token) return falha(ErroDominio.naoEncontrado('Token não encontrado.'));

    const cena = await this.cenas.buscarPorId(token.cenaId);
    if (!cena) return falha(ErroDominio.naoEncontrado('Cena não encontrada.'));

    const mesa = await this.mesas.buscarPorId(cena.mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));
    const permitido = mesa.autorizarEscritaDeParticipante(usuarioId);
    if (!permitido.ok) return falha(permitido.erro);

    // Invariante: token de personagem é movido pelo dono ou pelo mestre;
    // token solto (NPC/objeto) só pelo mestre.
    if (!mesa.ehMestre(usuarioId)) {
      if (!token.personagemId) {
        return falha(ErroDominio.naoAutorizado('Apenas o mestre move este token.'));
      }
      const personagem = await this.personagens.buscarPorId(token.personagemId);
      if (!personagem || personagem.donoId !== usuarioId) {
        return falha(ErroDominio.naoAutorizado('Você só pode mover tokens dos seus personagens.'));
      }
    }

    const movido = token.mover(entrada.x, entrada.y, cena);
    if (!movido.ok) return falha(movido.erro);

    await this.cenas.salvarToken(token);
    const dto = tokenParaDTO(token);
    this.publicador.tokenAtualizado(mesa.id, dto);
    return ok(dto);
  }
}
