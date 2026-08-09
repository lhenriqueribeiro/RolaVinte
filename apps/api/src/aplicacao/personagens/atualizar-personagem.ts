import type { AtualizarPersonagemEntrada, PersonagemDTO } from '@rolavinte/shared';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type {
  MesaRepository,
  PersonagemRepository,
  UsuarioRepository,
} from '../ports/repositorios';
import type { PublicadorEventosMesa } from '../ports/infraestrutura';
import { montarPersonagemDTO } from './personagem-dto';

const NEGADO = 'Só o dono do personagem ou o mestre podem editar a ficha.';

export class AtualizarPersonagem {
  constructor(
    private readonly personagens: PersonagemRepository,
    private readonly mesas: MesaRepository,
    private readonly usuarios: UsuarioRepository,
    private readonly publicador: PublicadorEventosMesa,
  ) {}

  async executar(
    usuarioId: string,
    personagemId: string,
    entrada: AtualizarPersonagemEntrada,
  ): Promise<Result<PersonagemDTO>> {
    const personagem = await this.personagens.buscarPorId(personagemId);
    if (!personagem) return falha(ErroDominio.naoEncontrado('Personagem não encontrado.'));

    const mesa = await this.mesas.buscarPorId(personagem.mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));

    const dono = personagem.autorizarEscrita(usuarioId, mesa.ehMestre(usuarioId), NEGADO);
    if (!dono.ok) return falha(dono.erro);

    // A ficha entra no mesmo congelamento das demais escritas (RV-027): a UI
    // promete "somente leitura para todo mundo" ao encerrar a mesa.
    const aberta = mesa.autorizarEscritaDeParticipante(usuarioId);
    if (!aberta.ok) return falha(aberta.erro);

    const atualizado = personagem.atualizar(entrada, mesa.sistema);
    if (!atualizado.ok) return falha(atualizado.erro);

    await this.personagens.salvar(personagem);
    const usuarioDono = await this.usuarios.buscarPorId(personagem.donoId);
    const dto = montarPersonagemDTO(personagem, usuarioDono?.nome ?? 'Jogador', mesa.sistema);

    // RV-042: a barra de vida desenhada sobre o token lê o PV daqui, não do
    // token. O broadcast é o que faz o dano aparecer no mapa sem recarregar —
    // e é publicado **só no sucesso**, depois da persistência: um evento
    // emitido numa tentativa negada faria a mesa inteira renderizar um estado
    // que o banco não tem.
    this.publicador.personagemAtualizado(mesa.id, dto);
    return ok(dto);
  }
}
