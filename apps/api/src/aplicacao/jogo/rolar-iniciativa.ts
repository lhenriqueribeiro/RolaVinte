import {
  definicaoDoSistema,
  iniciativaEscolhida,
  ROTULO_INICIATIVA,
  type CombateDTO,
  type MensagemDTO,
  type RolarIniciativaEntrada,
} from '@rolavinte/shared';
import type { Personagem } from '../../dominio/personagens/personagem';
import type { Mesa } from '../../dominio/mesas/mesa';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type {
  CenaRepository,
  CombateRepository,
  MesaRepository,
  PersonagemRepository,
} from '../ports/repositorios';
import type { PublicadorEventosMesa } from '../ports/infraestrutura';
import { combateParaDTO } from './combate-dto';
import type { EntradaRolagem } from './rolar-dados';

export const INICIATIVA_DE_TERCEIRO =
  'Você só pode rolar a iniciativa dos seus personagens — o resto é do mestre.';

/**
 * Recusa quando um jogador informa a própria iniciativa em vez de derivá-la (RV-066).
 *
 * `expressao` existe para o NPC sem ficha e para a iniciativa que o mestre resolve
 * digitar — e é **privilégio do mestre**. Sem esta guarda, o dono da peça mandava
 * `1d20+99` e o número entrava na ordem: a interface só oferece o campo ao mestre,
 * e proteção que mora na interface não é proteção (F4 da taxonomia).
 */
export const INICIATIVA_INFORMADA_E_DO_MESTRE =
  'Somente o mestre informa a iniciativa direto — a sua é derivada da ficha.';

/**
 * Recusa quando não há de onde tirar o bônus: a peça não tem ficha (RV-158).
 *
 * É o caso do NPC, que é comum e não pode travar a luta — e a mensagem diz o que
 * fazer, em vez de deixar o mestre adivinhando por que o botão não funcionou.
 */
export const INICIATIVA_SEM_FICHA =
  'Esta peça não tem ficha para derivar a iniciativa. Informe a expressão (o número ou "1d20+2").';

/** Recusa quando o sistema da mesa não declara como rolar iniciativa. */
export const INICIATIVA_NAO_DECLARADA =
  'O sistema desta mesa não declara como rolar iniciativa. Informe a expressão.';

/** Recusa quando a forma de rolar pedida não é uma das que o sistema declara. */
export function mensagemIniciativaDesconhecida(chave: string, nomeDoSistema: string): string {
  return `${nomeDoSistema} não oferece esta forma de rolar iniciativa: ${chave}.`;
}

/**
 * Rótulo da rolagem no chat, quando quem chama não manda um motivo.
 *
 * `rotulo` existe para que a linha diga **por que** o número é aquele quando o
 * sistema oferece escolha: `Iniciativa (Percepção) — Thorin`, `Iniciativa
 * (Furtividade) — Thorin`. O padrão é o rótulo do contrato (`ROTULO_INICIATIVA`),
 * escrito uma única vez em `packages/shared`.
 */
export function motivoIniciativa(nome: string, rotulo: string = ROTULO_INICIATIVA): string {
  return `${rotulo} — ${nome}`;
}

/** O que vai para o `RolarDados`: a expressão e a frase do chat. */
interface PedidoDeRolagem {
  expressao: string;
  motivo: string;
}

/**
 * O mínimo que este caso de uso precisa do chat: rolar uma expressão e devolver a
 * mensagem gravada.
 *
 * Port estreita (SOLID I) em vez de depender da classe `RolarDados` inteira, e
 * **injetada**, não instanciada: o registry de comandos do chat já compõe casos de
 * uso assim nos dois composition roots. O que se ganha reusando `RolarDados` é
 * decisivo: existe **uma** rolagem, então o total gravado na iniciativa é
 * literalmente o mesmo número que apareceu no chat. Rolar aqui e rolar lá seriam
 * dois resultados diferentes com a mesma expressão.
 */
export interface RoladorDeDados {
  executar(
    usuarioId: string,
    mesaId: string,
    entrada: EntradaRolagem,
  ): Promise<Result<MensagemDTO>>;
}

export interface IniciativaRolada {
  combate: CombateDTO;
  /** A mensagem que foi para o chat, com o resultado dos dados. */
  mensagem: MensagemDTO;
}

/**
 * Rola a iniciativa de um participante e grava o total na ordem (RV-061, RV-158).
 *
 * ## Com o que se rola — a pergunta que o RV-158 respondeu
 *
 * A iniciativa é do **sistema**, não do combate: Percepção em Pathfinder 2e,
 * Destreza em D&D 5e. Este caso de uso pergunta ao registro de sistemas (ver
 * `pedidoDeRolagem`) em vez de aceitar do cliente o bônus de quem tem ficha — e
 * é isto que dá a `DefinicaoSistema.rolagensPadrao` o primeiro consumidor de
 * produção que ele tem desde que nasceu (F2 da taxonomia).
 *
 * ## Quem pode rolar
 *
 * O mestre rola por qualquer participante, e é o **único** que informa um número
 * direto (`expressao`). O jogador rola **só** pelo token do próprio personagem — a
 * mesma regra que `MoverToken` aplica ao arrastar a peça, e pela mesma razão: a peça
 * de outro jogador não é sua — e a iniciativa dele é sempre **derivada da ficha**,
 * porque escolher o próprio número não é rolar iniciativa. A guarda de mesa
 * (`autorizarEscritaDeParticipante`) vem antes e cobre participação e mesa
 * encerrada juntas; a checagem de dono vem depois porque só ela precisa carregar a
 * ficha.
 *
 * ## Por que o chat vem antes de gravar a iniciativa
 *
 * `RolarDados` é quem rola, e ele já valida a expressão, aplica a guarda de mesa e
 * publica a mensagem. Se ele recusar (expressão inválida, mesa encerrada), nada é
 * gravado no combate — que é o desfecho certo: uma iniciativa sem rolagem
 * correspondente no chat seria um número que ninguém pode auditar.
 */
export class RolarIniciativa {
  constructor(
    private readonly combates: CombateRepository,
    private readonly cenas: CenaRepository,
    private readonly mesas: MesaRepository,
    private readonly personagens: PersonagemRepository,
    private readonly rolador: RoladorDeDados,
    private readonly publicador: PublicadorEventosMesa,
  ) {}

  async executar(
    usuarioId: string,
    combateId: string,
    entrada: RolarIniciativaEntrada,
  ): Promise<Result<IniciativaRolada>> {
    const combate = await this.combates.buscarPorId(combateId);
    if (!combate) return falha(ErroDominio.naoEncontrado('Combate não encontrado.'));

    const mesa = await this.mesas.buscarPorId(combate.mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));

    const permitido = mesa.autorizarEscritaDeParticipante(usuarioId);
    if (!permitido.ok) return falha(permitido.erro);

    // A guarda do agregado vem **antes** de rolar, e não só dentro de
    // `definirIniciativa`: lá ela recusaria depois de `RolarDados` já ter gravado e
    // transmitido a rolagem, e a mesa veria no chat um "Iniciativa — Thorin: 23"
    // que a ordem de iniciativa não tem, com a requisição respondendo 409. É a
    // mesma razão pela qual `AplicarDano` consulta `garantirEmCurso` no começo.
    const emCurso = combate.garantirEmCurso();
    if (!emCurso.ok) return falha(emCurso.erro);

    const participante = combate.participantes.find((p) => p.tokenId === entrada.tokenId);
    if (!participante) {
      return falha(ErroDominio.naoEncontrado('Participante não está no combate.'));
    }

    // A ficha da peça responde a duas perguntas — "é sua?" (autorização do
    // jogador) e "qual é o bônus?" (a derivação do RV-158) —, e por isso é
    // carregada **uma vez**. Quando o mestre já informou a expressão, ela não é
    // carregada: nada precisaria dela, e uma leitura a mais por rolagem de
    // iniciativa é custo sem contrapartida.
    const ehMestre = mesa.ehMestre(usuarioId);
    const ficha =
      ehMestre && entrada.expressao !== undefined ? null : await this.fichaDoToken(entrada.tokenId);

    if (!ehMestre && ficha?.donoId !== usuarioId) {
      return falha(ErroDominio.naoAutorizado(INICIATIVA_DE_TERCEIRO));
    }

    // Informar a iniciativa é privilégio do mestre, e a ordem importa: a recusa por
    // peça de terceiro vem antes porque é a mais informativa para quem errou o token.
    // Informar a iniciativa é privilégio do mestre, e a ordem importa: a recusa por
    // peça de terceiro vem antes porque é a mais informativa para quem errou o token.
    if (!ehMestre && entrada.expressao !== undefined) {
      return falha(ErroDominio.naoAutorizado(INICIATIVA_INFORMADA_E_DO_MESTRE));
    }

    const pedido = this.pedidoDeRolagem(mesa, participante.nome, ficha, entrada);
    if (!pedido.ok) return falha(pedido.erro);

    const rolagem = await this.rolador.executar(usuarioId, mesa.id, pedido.valor);
    if (!rolagem.ok) return falha(rolagem.erro);

    // O total é lido da mensagem que acabou de ser gravada: o número da ordem de
    // iniciativa e o número que a mesa viu no chat são o mesmo, por construção.
    const total = rolagem.valor.rolagem?.total;
    if (total === undefined) {
      // Estado impossível pelo contrato de `RolarDados` (rolagem sempre tem
      // resultado), tratado como falha em vez de `!` para não virar um 500 caso o
      // contrato mude.
      return falha(ErroDominio.validacao('A rolagem não produziu um total.'));
    }

    const definida = combate.definirIniciativa(entrada.tokenId, total);
    if (!definida.ok) return falha(definida.erro);

    await this.combates.salvar(combate);
    const dto = combateParaDTO(combate);
    this.publicador.combateAtualizado(mesa.id, dto);
    return ok({ combate: dto, mensagem: rolagem.valor });
  }

  /**
   * Com o que este participante rola, e o que o chat vai dizer (RV-158).
   *
   * A ordem de precedência é a do contrato (`rolarIniciativaSchema`):
   *
   * 1. `expressao` informada **manda** — é o NPC sem ficha e a iniciativa que o
   *    mestre resolveu digitar. O combate não trava esperando uma ficha. Quem chega
   *    aqui com `expressao` já passou pela guarda de papel do `executar`: jogador
   *    nenhum informa o próprio número.
   * 2. Sem expressão, o bônus é **derivado da ficha pelo sistema da mesa**, e a
   *    forma de rolar sai de `DefinicaoSistema.rolagensPadrao`: Percepção em
   *    Pathfinder 2e, Destreza em D&D 5e, a alternativa que o mestre escolheu
   *    quando a cena pede outra perícia.
   *
   * **Não há `if (mesa.sistema === …)` aqui, e não pode haver** (DoD do card): este
   * método não sabe o nome de sistema nenhum. Ele pergunta ao registro, que é o
   * único lugar do repositório autorizado a associar sistema a comportamento. Uma
   * mesa de D&D não passa a rolar Percepção porque o PF2e entrou no código.
   */
  private pedidoDeRolagem(
    mesa: Mesa,
    nomeParticipante: string,
    ficha: Personagem | null,
    entrada: RolarIniciativaEntrada,
  ): Result<PedidoDeRolagem> {
    const motivoInformado = entrada.motivo.trim();
    if (entrada.expressao !== undefined) {
      return ok({
        expressao: entrada.expressao,
        motivo: motivoInformado || motivoIniciativa(nomeParticipante),
      });
    }
    if (!ficha) return falha(ErroDominio.validacao(INICIATIVA_SEM_FICHA));

    const definicao = definicaoDoSistema(mesa.sistema);
    const opcao = iniciativaEscolhida(
      definicao,
      { nivel: ficha.nivel, atributos: ficha.atributos, dados: ficha.dados },
      entrada.rolagem,
    );
    if (!opcao) {
      // Duas recusas distintas porque o mestre precisa saber qual é o caso: ou o
      // sistema não declara iniciativa nenhuma, ou a forma pedida não é uma delas.
      const chavePedida = entrada.rolagem ?? '';
      return falha(
        ErroDominio.validacao(
          chavePedida === ''
            ? INICIATIVA_NAO_DECLARADA
            : mensagemIniciativaDesconhecida(chavePedida, definicao.nome),
        ),
      );
    }
    return ok({
      expressao: opcao.expressao,
      motivo: motivoInformado || motivoIniciativa(nomeParticipante, opcao.rotulo),
    });
  }

  /** A ficha vinculada à peça; `null` quando a peça não tem ficha (o NPC). */
  private async fichaDoToken(tokenId: string): Promise<Personagem | null> {
    const token = await this.cenas.buscarTokenPorId(tokenId);
    if (!token?.personagemId) return null;
    return (await this.personagens.buscarPorId(token.personagemId)) ?? null;
  }
}
