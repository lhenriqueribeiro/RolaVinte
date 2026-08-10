import {
  CONDICAO_INCONSCIENTE,
  type AtualizarPersonagemEntrada,
  type PersonagemDTO,
} from '@rolavinte/shared';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type {
  CenaRepository,
  CombateRepository,
  MesaRepository,
  PersonagemRepository,
} from '../ports/repositorios';
import type { PublicadorEventosMesa } from '../ports/infraestrutura';
import { carregarCombateParaEscritaDoMestre } from './acesso-combate';
import { marcarCondicaoNoToken } from './alternar-condicao-token';
import { avisarNoChat, textoAlteracaoPv, type DependenciasAviso } from './aviso-de-combate';

export const APENAS_MESTRE_APLICA_DANO =
  'Apenas o mestre aplica dano e cura pelo painel de combate — na sua ficha, o PV continua seu.';

export const TOKEN_SEM_FICHA =
  'Este token não tem ficha vinculada: o PV vive na ficha do personagem, então não há o que somar aqui.';

/**
 * O mínimo que este caso de uso precisa da edição de ficha.
 *
 * Port estreita (SOLID I) satisfeita estruturalmente por `AtualizarPersonagem`, e
 * injetada pelo composition root. **Não** existe um segundo caminho de escrita de
 * PV: quem grava é sempre aquele caso de uso, que já valida `0 ≤ pvAtual ≤ pvMax`
 * e já publica `personagem:atualizado` — o evento que faz a barra de vida sobre o
 * token acompanhar ao vivo (RV-042). Escrever o PV aqui seria a F12 da taxonomia
 * no campo mais visível da ficha.
 */
export interface EditorDeFicha {
  executar(
    usuarioId: string,
    personagemId: string,
    entrada: AtualizarPersonagemEntrada,
  ): Promise<Result<PersonagemDTO>>;
}

/**
 * Dano e cura pelo painel de combate (RV-065).
 *
 * ## Quem pode
 *
 * O mestre, e só ele — a história do card é a dele ("não abrir a ficha a cada
 * golpe"), e é ele quem pode marcar condição no token (RV-064). O jogador continua
 * editando o PV na própria ficha, pelo caminho que já existe: dar-lhe esta rota
 * criaria duas autorizações para o mesmo efeito, uma delas capaz de marcar
 * `inconsciente` numa peça alheia.
 *
 * ## Por que o teto e o piso são aplicados AQUI
 *
 * `delta` é a intenção ("levou 7"), e o card exige que 10 de dano em quem tem 3 PV
 * pare em **0**, não em −7. Se o valor cru fosse mandado para a ficha, o
 * `AtualizarPersonagem` recusaria com 400 e o mestre veria um erro de validação
 * onde deveria ver um personagem caído. O grampo é regra deste caso de uso; a
 * invariante `0 ≤ pvAtual ≤ pvMax` continua sendo do agregado `Personagem`, como
 * segunda tranca para qualquer caminho de escrita futuro.
 *
 * ## Por que não publica `combate:atualizado`
 *
 * Nada no agregado `Combate` muda: o PV nunca esteve nele nem no token (RV-042). O
 * painel lê o PV do cache de personagens, que o `personagem:atualizado` mantém
 * vivo, e o ícone de inconsciente chega pelo `token:atualizado`. Publicar um
 * terceiro evento com a mesma notícia daria três oportunidades de divergir.
 */
export class AplicarDano {
  constructor(
    private readonly combates: CombateRepository,
    private readonly cenas: CenaRepository,
    private readonly mesas: MesaRepository,
    private readonly personagens: PersonagemRepository,
    private readonly editorDeFicha: EditorDeFicha,
    private readonly publicador: PublicadorEventosMesa,
    private readonly aviso: DependenciasAviso,
  ) {}

  async executar(
    usuarioId: string,
    combateId: string,
    tokenId: string,
    delta: number,
  ): Promise<Result<PersonagemDTO>> {
    const acesso = await carregarCombateParaEscritaDoMestre(
      this.combates,
      this.mesas,
      usuarioId,
      combateId,
      APENAS_MESTRE_APLICA_DANO,
    );
    if (!acesso.ok) return falha(acesso.erro);
    const { combate, mesa } = acesso.valor;

    const emCurso = combate.garantirEmCurso();
    if (!emCurso.ok) return falha(emCurso.erro);

    // O token tem de estar NESTE combate. Sem esta checagem, a rota viraria uma
    // segunda porta para editar o PV de qualquer ficha da mesa, com autorização
    // diferente da da ficha — e sem a linha no chat fazer sentido.
    const participante = combate.participantes.find((p) => p.tokenId === tokenId);
    if (!participante) {
      return falha(ErroDominio.naoEncontrado('Participante não está no combate.'));
    }

    const token = await this.cenas.buscarTokenPorId(tokenId);
    if (!token) return falha(ErroDominio.naoEncontrado('Token não encontrado.'));
    if (!token.personagemId) return falha(ErroDominio.validacao(TOKEN_SEM_FICHA));

    const personagem = await this.personagens.buscarPorId(token.personagemId);
    if (!personagem) return falha(ErroDominio.naoEncontrado('Personagem não encontrado.'));

    const pvAtual = Math.min(Math.max(personagem.pvAtual + delta, 0), personagem.pvMax);
    const atualizado = await this.editorDeFicha.executar(usuarioId, personagem.id, { pvAtual });
    if (!atualizado.ok) return falha(atualizado.erro);

    await this.sincronizarInconsciente(mesa.id, token, pvAtual);
    await avisarNoChat(
      this.aviso,
      mesa.id,
      textoAlteracaoPv(participante.nome, delta, atualizado.valor.pvAtual, atualizado.valor.pvMax),
    );
    return ok(atualizado.valor);
  }

  /**
   * PV em 0 marca `inconsciente` na peça; PV de volta acima de 0 desmarca.
   *
   * A simetria é decisão deste card, e não do enunciado: o cenário só pede a
   * marcação, mas curar alguém e deixar o ícone de inconsciente na peça seria uma
   * promessa falsa na tela (F6) — o mestre teria de lembrar de desmarcar à mão
   * exatamente na situação em que o painel existe para poupar essa lembrança.
   *
   * A escrita passa por `marcarCondicaoNoToken` (RV-064), que grava e publica
   * `token:atualizado` num lugar só; e só é chamada quando o estado precisa mudar,
   * para não gastar um broadcast por cura de quem estava de pé.
   *
   * `inconsciente` **não** encerra o turno de ninguém nem tira o participante da
   * ordem: em Pathfinder 2e um personagem morrendo continua tendo turnos (teste de
   * recuperação). Decidir isso silenciosamente seria legislar sobre a regra do
   * sistema; a marcação é anotação de mesa.
   */
  private async sincronizarInconsciente(
    mesaId: string,
    token: Parameters<typeof marcarCondicaoNoToken>[3],
    pvAtual: number,
  ): Promise<void> {
    const deveEstar = pvAtual === 0;
    if (token.temCondicao(CONDICAO_INCONSCIENTE) === deveEstar) return;
    await marcarCondicaoNoToken(this.cenas, this.publicador, mesaId, token, {
      condicao: CONDICAO_INCONSCIENTE,
      aplicada: deveEstar,
    });
  }
}
