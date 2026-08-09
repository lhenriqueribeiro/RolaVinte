import type { CriarPersonagemEntrada, PersonagemDTO } from '@rolavinte/shared';
import { Personagem } from '../../dominio/personagens/personagem';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type {
  MesaRepository,
  PersonagemRepository,
  UsuarioRepository,
} from '../ports/repositorios';
import type { GeradorId } from '../ports/infraestrutura';

export class CriarPersonagem {
  constructor(
    private readonly personagens: PersonagemRepository,
    private readonly mesas: MesaRepository,
    private readonly usuarios: UsuarioRepository,
    private readonly geradorId: GeradorId,
  ) {}

  async executar(
    usuarioId: string,
    mesaId: string,
    entrada: CriarPersonagemEntrada,
  ): Promise<Result<PersonagemDTO>> {
    const mesa = await this.mesas.buscarPorId(mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));
    const permitido = mesa.autorizarEscritaDeParticipante(usuarioId);
    if (!permitido.ok) return falha(permitido.erro);

    const dono = await this.usuarios.buscarPorId(usuarioId);
    if (!dono) return falha(ErroDominio.naoEncontrado('Usuário não encontrado.'));

    const personagem = Personagem.criar({
      id: this.geradorId.gerar(),
      mesaId,
      donoId: usuarioId,
      nome: entrada.nome,
      classe: entrada.classe,
      nivel: entrada.nivel,
      pvMax: entrada.pvMax,
      atributos: entrada.atributos,
      anotacoes: entrada.anotacoes,
    });
    if (!personagem.ok) return falha(personagem.erro);

    await this.personagens.salvar(personagem.valor);
    const p = personagem.valor;
    return ok({
      id: p.id,
      mesaId: p.mesaId,
      donoId: p.donoId,
      donoNome: dono.nome,
      nome: p.nome,
      classe: p.classe,
      nivel: p.nivel,
      pvAtual: p.pvAtual,
      pvMax: p.pvMax,
      atributos: p.atributos,
      anotacoes: p.anotacoes,
    });
  }
}
