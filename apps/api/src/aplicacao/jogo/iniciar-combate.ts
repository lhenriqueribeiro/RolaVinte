import type { CombateDTO, IniciarCombateEntrada } from '@rolavinte/shared';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import { Combate } from '../../dominio/jogo/combate';
import type { CenaRepository, CombateRepository, MesaRepository } from '../ports/repositorios';
import type { GeradorId, PublicadorEventosMesa } from '../ports/infraestrutura';
import { combateParaDTO } from './combate-dto';

/** Mensagem única do 403 — a UI e o teste de contrato citam esta constante. */
export const APENAS_MESTRE_INICIA_COMBATE = 'Apenas o mestre pode iniciar o combate.';

/** Mensagem única do 409 de "um combate ativo por mesa". */
export const COMBATE_ATIVO_EXISTE =
  'Já existe um combate ativo nesta mesa. Encerre-o antes de iniciar outro.';

export const SEM_CENA_ATIVA = 'Ative uma cena antes de iniciar o combate.';

/** Um token pedido que não está na cena ativa — o mestre precisa saber qual. */
export function mensagemTokensForaDaCena(tokenIds: readonly string[]): string {
  return `Estes tokens não estão na cena ativa: ${tokenIds.join(', ')}.`;
}

/**
 * Inicia o combate com os tokens que o mestre escolheu na cena ativa (RV-061).
 *
 * ## As duas trancas de "um combate ativo por mesa"
 *
 * Aqui: uma consulta a `buscarAtivoDaMesa` antes de gravar, que é o que produz o
 * **409 com mensagem em PT-BR** para o mestre. No banco: o índice único parcial
 * `idx_combates_ativo_por_mesa` da migration `0012`, que é o que resta quando dois
 * cliques quase simultâneos fazem as duas leituras verem "nenhum ativo". A
 * primeira sem a segunda deixa a corrida aberta; a segunda sem a primeira
 * responderia 500 a um erro que o usuário causa e entende.
 *
 * ## Por que os tokens são conferidos contra a cena ativa
 *
 * `tokenIds` vem do cliente. Sem a conferência, um id de token de **outra mesa**
 * entraria na ordem de iniciativa: o nome de uma peça alheia apareceria no painel
 * (vazamento) e a FK da `0012` aceitaria a linha, porque o token existe. A
 * verificação é de participação na cena, não de existência.
 */
export class IniciarCombate {
  constructor(
    private readonly combates: CombateRepository,
    private readonly cenas: CenaRepository,
    private readonly mesas: MesaRepository,
    private readonly geradorId: GeradorId,
    private readonly publicador: PublicadorEventosMesa,
  ) {}

  async executar(usuarioId: string, entrada: IniciarCombateEntrada): Promise<Result<CombateDTO>> {
    const mesa = await this.mesas.buscarPorId(entrada.mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));

    const permitido = mesa.autorizarEscritaDoMestre(usuarioId, APENAS_MESTRE_INICIA_COMBATE);
    if (!permitido.ok) return falha(permitido.erro);

    const emCurso = await this.combates.buscarAtivoDaMesa(mesa.id);
    if (emCurso) return falha(ErroDominio.conflito(COMBATE_ATIVO_EXISTE));

    const cena = await this.cenas.buscarAtivaDaMesa(mesa.id);
    if (!cena) return falha(ErroDominio.validacao(SEM_CENA_ATIVA));

    const tokens = await this.cenas.listarTokensDaCena(cena.id);
    const porId = new Map(tokens.map((t) => [t.id, t]));
    const forasteiros = entrada.tokenIds.filter((id) => !porId.has(id));
    if (forasteiros.length > 0) {
      return falha(ErroDominio.validacao(mensagemTokensForaDaCena(forasteiros)));
    }

    // A ordem de entrada define o desempate, e é a ordem em que o mestre listou os
    // tokens — determinística, e não a ordem em que o banco devolveu a cena.
    const criado = Combate.criar({
      id: this.geradorId.gerar(),
      mesaId: mesa.id,
      cenaId: cena.id,
      participantes: entrada.tokenIds.map((id) => ({
        tokenId: id,
        // O nome é copiado do token no instante em que a luta começa: o painel é o
        // registro de quem entrou, e renomear a peça depois não reescreve a ordem.
        nome: porId.get(id)?.nome ?? 'Participante',
      })),
    });
    if (!criado.ok) return falha(criado.erro);

    await this.combates.salvar(criado.valor);
    const dto = combateParaDTO(criado.valor);
    // Depois de persistir, e só no sucesso: um evento publicado numa tentativa
    // recusada faria a mesa inteira renderizar um combate que o banco não tem.
    this.publicador.combateAtualizado(mesa.id, dto);
    return ok(dto);
  }
}
