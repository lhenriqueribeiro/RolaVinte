import type { PersonagemDTO } from '@rolavinte/shared';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type {
  MesaRepository,
  PersonagemRepository,
  UsuarioRepository,
} from '../ports/repositorios';
import type { GeradorId } from '../ports/infraestrutura';
import { montarPersonagemDTO } from './personagem-dto';

const NEGADO = 'Só o dono do personagem ou o mestre podem duplicar a ficha.';

/**
 * Duplica uma ficha (RV-093): id novo, nome sufixado com "(cópia)", PV cheio.
 *
 * A cópia pertence ao **dono do original**, não a quem clicou. Quando o mestre
 * duplica a ficha de um jogador, é a ficha daquele jogador que ganha uma cópia
 * — passar a posse para o mestre tiraria do jogador o acesso de escrita ao que
 * é dele, em silêncio.
 */
export class DuplicarPersonagem {
  constructor(
    private readonly personagens: PersonagemRepository,
    private readonly mesas: MesaRepository,
    private readonly usuarios: UsuarioRepository,
    private readonly geradorId: GeradorId,
  ) {}

  async executar(usuarioId: string, personagemId: string): Promise<Result<PersonagemDTO>> {
    const original = await this.personagens.buscarPorId(personagemId);
    if (!original) return falha(ErroDominio.naoEncontrado('Personagem não encontrado.'));

    const mesa = await this.mesas.buscarPorId(original.mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));

    const dono = original.autorizarEscrita(usuarioId, mesa.ehMestre(usuarioId), NEGADO);
    if (!dono.ok) return falha(dono.erro);

    const aberta = mesa.autorizarEscritaDeParticipante(usuarioId);
    if (!aberta.ok) return falha(aberta.erro);

    const copia = original.duplicar(this.geradorId.gerar(), mesa.sistema);
    if (!copia.ok) return falha(copia.erro);

    await this.personagens.salvar(copia.valor);
    const usuarioDono = await this.usuarios.buscarPorId(copia.valor.donoId);
    return ok(montarPersonagemDTO(copia.valor, usuarioDono?.nome ?? 'Jogador', mesa.sistema));
  }
}
