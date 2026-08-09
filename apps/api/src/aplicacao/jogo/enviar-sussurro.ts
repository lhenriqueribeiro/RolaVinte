import type { MensagemDTO } from '@rolavinte/shared';
import { Mensagem } from '../../dominio/jogo/mensagem';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import { mensagemParaDTO } from '../mapeadores';
import { publicarMensagem } from './publicar-mensagem';
import type { MensagemRepository, MesaRepository, UsuarioRepository } from '../ports/repositorios';
import type { GeradorId, PublicadorEventosMesa, Relogio } from '../ports/infraestrutura';

/**
 * Sussurro: fala em particular com outro participante da mesa (RV-070).
 *
 * O destinatário chega como **nome digitado** (`/sussurro @Ana ...`) e é
 * resolvido contra a lista de participantes desta mesa. Sussurrar para quem não
 * participa é 404 e nada é persistido nem transmitido — não existe caminho para
 * usar o comando como sonda de "quem tem conta neste sistema".
 */
export class EnviarSussurro {
  constructor(
    private readonly mensagens: MensagemRepository,
    private readonly mesas: MesaRepository,
    private readonly usuarios: UsuarioRepository,
    private readonly geradorId: GeradorId,
    private readonly relogio: Relogio,
    private readonly publicador: PublicadorEventosMesa,
  ) {}

  async executar(
    usuarioId: string,
    mesaId: string,
    destinatarioDigitado: string,
    conteudo: string,
  ): Promise<Result<MensagemDTO>> {
    const mesa = await this.mesas.buscarPorId(mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));
    // Mesma guarda do chat comum: participação + mesa aberta, num lugar só.
    const permitido = mesa.autorizarEscritaDeParticipante(usuarioId);
    if (!permitido.ok) return falha(permitido.erro);

    const autor = await this.usuarios.buscarPorId(usuarioId);
    if (!autor) return falha(ErroDominio.naoEncontrado('Usuário não encontrado.'));

    const destinatario = await this.resolverDestinatario(mesaId, destinatarioDigitado);
    if (!destinatario.ok) return falha(destinatario.erro);

    const mensagem = Mensagem.criarSussurro({
      id: this.geradorId.gerar(),
      mesaId,
      autorId: usuarioId,
      autorNome: autor.nome,
      destinatarioId: destinatario.valor.usuarioId,
      destinatarioNome: destinatario.valor.nome,
      conteudo,
      agora: this.relogio.agora(),
    });
    if (!mensagem.ok) return falha(mensagem.erro);

    await this.mensagens.salvar(mensagem.valor);
    const dto = mensagemParaDTO(mensagem.valor);
    publicarMensagem(this.publicador, mensagem.valor, dto);
    return ok(dto);
  }

  /**
   * Casa o nome digitado com um participante, sem diferenciar caixa nem espaços
   * nas pontas. Nome de usuário não é único no sistema, então dois participantes
   * homônimos são um conflito explícito: escolher um deles em silêncio mandaria
   * o segredo para a pessoa errada.
   */
  private async resolverDestinatario(
    mesaId: string,
    digitado: string,
  ): Promise<Result<{ usuarioId: string; nome: string }>> {
    const alvo = digitado.trim().toLocaleLowerCase('pt-BR');
    const jogadores = await this.mesas.listarJogadores(mesaId);
    const candidatos = jogadores.filter((j) => j.nome.toLocaleLowerCase('pt-BR') === alvo);

    if (candidatos.length === 0) {
      return falha(
        ErroDominio.naoEncontrado(`Ninguém chamado "${digitado.trim()}" participa desta mesa.`),
      );
    }
    if (candidatos.length > 1) {
      return falha(
        ErroDominio.conflito(
          `Mais de um participante se chama "${digitado.trim()}". Peça para diferenciarem os nomes.`,
        ),
      );
    }
    const escolhido = candidatos[0]!;
    return ok({ usuarioId: escolhido.usuarioId, nome: escolhido.nome });
  }
}
