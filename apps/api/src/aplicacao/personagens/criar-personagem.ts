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
import { montarPersonagemDTO } from './personagem-dto';

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

    // O sistema é da mesa (RV-091). É ele que decide o que a ficha aceita em
    // `dados`, e o agregado recusa campo fora da definição — 400, não silêncio.
    // Desde o RV-098 vale o mesmo para `atributos`: o que o cliente informar é
    // conferido contra a escala do sistema e gravado; omitido, o agregado usa o
    // padrão daquela escala. Nada de campo exigido aqui e ignorado na leitura.
    const personagem = Personagem.criar(
      {
        id: this.geradorId.gerar(),
        mesaId,
        donoId: usuarioId,
        nome: entrada.nome,
        classe: entrada.classe,
        nivel: entrada.nivel,
        pvMax: entrada.pvMax,
        atributos: entrada.atributos,
        anotacoes: entrada.anotacoes,
        dados: entrada.dados,
      },
      mesa.sistema,
    );
    if (!personagem.ok) return falha(personagem.erro);

    await this.personagens.salvar(personagem.valor);
    return ok(montarPersonagemDTO(personagem.valor, dono.nome, mesa.sistema));
  }
}
