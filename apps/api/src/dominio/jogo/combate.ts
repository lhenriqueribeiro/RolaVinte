import {
  INICIATIVA_MAXIMA,
  INICIATIVA_MINIMA,
  MAXIMO_PARTICIPANTES_COMBATE,
  MENSAGEM_INICIATIVA,
  MENSAGEM_NOME_PARTICIPANTE,
  MENSAGEM_PARTICIPANTES_COMBATE,
  MENSAGEM_PARTICIPANTE_DUPLICADO,
} from '@rolavinte/shared';
import { Entidade } from '../compartilhado/entidade';
import { ErroDominio } from '../compartilhado/erro-dominio';
import { falha, ok, type Result } from '../compartilhado/resultado';

/**
 * Um lugar na ordem de iniciativa.
 *
 * `ordemDesempate` é o número de entrada no combate e **nunca muda depois de
 * atribuído**: é ele que torna a ordem estável entre duas leituras quando duas
 * iniciativas empatam. Não sai no DTO — ver `ParticipanteCombateDTO`.
 */
export interface ParticipanteCombate {
  tokenId: string;
  nome: string;
  /** `null` enquanto ninguém rolou. */
  iniciativa: number | null;
  ordemDesempate: number;
}

/** O que se sabe de um participante antes de ele entrar na ordem. */
export interface NovoParticipante {
  tokenId: string;
  nome: string;
}

/** O que `proximoTurno` devolve — o suficiente para o caso de uso anunciar a virada. */
export interface ResultadoTurno {
  rodada: number;
  /** `true` quando o turno voltou ao primeiro e a rodada avançou. */
  novaRodada: boolean;
  participante: ParticipanteCombate;
}

interface PropsCombate {
  mesaId: string;
  cenaId: string;
  rodada: number;
  /** Posição do turno **na lista ordenada**. Sempre válida: ver `reposicionarTurno`. */
  indiceTurno: number;
  ativo: boolean;
  participantes: ParticipanteCombate[];
}

export const COMBATE_ENCERRADO = 'Este combate já foi encerrado.';
export const COMBATE_SEM_PARTICIPANTES = 'Este combate não tem participantes.';

/**
 * Ordem canônica do combate: iniciativa **decrescente**, empate resolvido por
 * `ordemDesempate` crescente, e quem ainda não rolou fica no fim.
 *
 * O comparador é **total** de propósito. `Array.prototype.sort` é estável desde
 * o ES2019, mas estabilidade de `sort` só preserva a ordem de *entrada* — e a
 * ordem de entrada, aqui, é a ordem em que o Postgres devolveu as linhas, que
 * não é garantida. Um comparador que devolvesse `0` para dois participantes
 * empatados deixaria a sequência do painel trocar entre dois `GET`, e o mestre
 * veria a mesa embaralhar sozinha no meio da luta. Como `ordemDesempate` é único
 * dentro do combate, este comparador nunca devolve `0` para participantes
 * distintos: a ordem é função só dos dados.
 *
 * Sem iniciativa vai para o fim porque quem não rolou não pode passar na frente
 * de quem tirou 3 — e, entre os que não rolaram, vale a ordem de entrada.
 */
function compararParticipantes(a: ParticipanteCombate, b: ParticipanteCombate): number {
  if (a.iniciativa !== b.iniciativa) {
    if (a.iniciativa === null) return 1;
    if (b.iniciativa === null) return -1;
    return b.iniciativa - a.iniciativa;
  }
  return a.ordemDesempate - b.ordemDesempate;
}

/**
 * Raiz do agregado de combate: a ordem de iniciativa, a rodada e o turno.
 *
 * Invariantes protegidas aqui:
 * - a lista está **sempre** na ordem canônica, e a ordem é estável entre leituras;
 * - `indiceTurno` aponta **sempre** para um participante existente (ou é 0 numa
 *   lista vazia);
 * - passar o turno no último participante avança a rodada e volta ao primeiro;
 * - combate encerrado é somente leitura;
 * - um `tokenId` aparece no máximo uma vez.
 *
 * O que **não** é regra daqui: quem pode escrever (é do agregado `Mesa`, via
 * `autorizarEscritaDoMestre`), quanto de PV cada um tem (é do `Personagem`) e o
 * vínculo peça↔ficha (é do `Token`). O combate só conhece `tokenId`, que é a
 * comunicação entre contextos por id de `.claude/rules/02-ddd.md`.
 *
 * "Um combate ativo por mesa" **não** é invariante deste agregado: nenhum
 * combate consegue enxergar outro. Ela é protegida pelo caso de uso `IniciarCombate`
 * (409) e pelo índice único parcial da migration `0012` — o agregado não pode
 * mentir sobre o que não vê.
 */
export class Combate extends Entidade {
  private constructor(
    id: string,
    private readonly props: PropsCombate,
  ) {
    super(id);
  }

  static criar(dados: {
    id: string;
    mesaId: string;
    cenaId: string;
    participantes: readonly NovoParticipante[];
  }): Result<Combate> {
    const participantes = Combate.montarParticipantes(dados.participantes);
    if (!participantes.ok) return falha(participantes.erro);

    const combate = new Combate(dados.id, {
      mesaId: dados.mesaId,
      cenaId: dados.cenaId,
      rodada: 1,
      indiceTurno: 0,
      ativo: true,
      participantes: participantes.valor,
    });
    combate.ordenarParticipantes();
    return ok(combate);
  }

  /**
   * Hidrata do banco. **Ordena e reposiciona o turno**, e isso não é zelo
   * excessivo:
   *
   * - as linhas de `combate_participantes` chegam na ordem que o Postgres
   *   escolher, e a ordem canônica é do domínio, não do `order by`;
   * - `combate_participantes.token_id` tem `on delete cascade`, então apagar um
   *   token some com o participante **pelas costas da aplicação**. Sem o
   *   reposicionamento, um `indice_turno` gravado como 4 num combate que voltou
   *   com 2 participantes apontaria para o vazio, e `participanteDoTurno` seria
   *   `undefined` num campo tipado como não-nulo.
   *
   * Como `reconstituir`, não revalida invariante histórica (nome, faixa de
   * iniciativa): combate gravado antes de um limite mudar continua legível.
   */
  static reconstituir(dados: PropsCombate & { id: string }): Combate {
    const { id, ...props } = dados;
    const combate = new Combate(id, { ...props, participantes: [...props.participantes] });
    combate.ordenarParticipantes();
    combate.reposicionarTurno(null);
    return combate;
  }

  /** Valida a lista de entrada e atribui o desempate na ordem informada. */
  private static montarParticipantes(
    novos: readonly NovoParticipante[],
  ): Result<ParticipanteCombate[]> {
    if (novos.length < 1 || novos.length > MAXIMO_PARTICIPANTES_COMBATE) {
      return falha(ErroDominio.validacao(MENSAGEM_PARTICIPANTES_COMBATE));
    }
    if (new Set(novos.map((p) => p.tokenId)).size !== novos.length) {
      return falha(ErroDominio.validacao(MENSAGEM_PARTICIPANTE_DUPLICADO));
    }
    const participantes: ParticipanteCombate[] = [];
    for (const [indice, novo] of novos.entries()) {
      const nome = Combate.validarNome(novo.nome);
      if (!nome.ok) return falha(nome.erro);
      participantes.push({
        tokenId: novo.tokenId,
        nome: nome.valor,
        iniciativa: null,
        ordemDesempate: indice + 1,
      });
    }
    return ok(participantes);
  }

  private static validarNome(nome: string): Result<string> {
    const limpo = nome.trim();
    if (limpo.length < 1 || limpo.length > 60) {
      return falha(ErroDominio.validacao(MENSAGEM_NOME_PARTICIPANTE));
    }
    return ok(limpo);
  }

  get mesaId(): string {
    return this.props.mesaId;
  }
  get cenaId(): string {
    return this.props.cenaId;
  }
  get rodada(): number {
    return this.props.rodada;
  }
  get indiceTurno(): number {
    return this.props.indiceTurno;
  }
  get ativo(): boolean {
    return this.props.ativo;
  }

  /** A lista **já na ordem canônica** — quem lê renderiza na ordem em que veio. */
  get participantes(): readonly ParticipanteCombate[] {
    return this.props.participantes;
  }

  /** Quem está no turno; `null` só quando não há participante nenhum. */
  get participanteDoTurno(): ParticipanteCombate | null {
    return this.props.participantes[this.props.indiceTurno] ?? null;
  }

  /**
   * Reaplica a ordem canônica e a devolve.
   *
   * A ordem já é mantida a cada mutação e pela reconstituição, então isto é
   * idempotente — existe como método público porque "ordenar" é o vocabulário do
   * card e porque um chamador precisa poder pedir a ordem sem saber se alguma
   * escrita aconteceu antes.
   */
  ordenar(): readonly ParticipanteCombate[] {
    const noTurno = this.ancoraDoTurno();
    this.ordenarParticipantes();
    this.reposicionarTurno(noTurno);
    return this.props.participantes;
  }

  /**
   * Entra alguém na luta depois do começo (reforço, monstro que aparece).
   *
   * Passa por `preservandoTurno` porque um participante com iniciativa alta
   * aterrissa **antes** de quem está no turno, e um `indiceTurno` cru passaria a
   * apontar para o vizinho: o mestre veria o destaque saltar de peça sem ter
   * passado o turno.
   */
  adicionar(novo: NovoParticipante): Result<void> {
    const ativo = this.garantirAtivo();
    if (!ativo.ok) return falha(ativo.erro);

    if (this.props.participantes.some((p) => p.tokenId === novo.tokenId)) {
      return falha(ErroDominio.conflito('Este token já está no combate.'));
    }
    if (this.props.participantes.length >= MAXIMO_PARTICIPANTES_COMBATE) {
      return falha(ErroDominio.conflito(MENSAGEM_PARTICIPANTES_COMBATE));
    }
    const nome = Combate.validarNome(novo.nome);
    if (!nome.ok) return falha(nome.erro);

    const desempate = Math.max(0, ...this.props.participantes.map((p) => p.ordemDesempate)) + 1;
    return this.preservandoTurno(() => {
      this.props.participantes.push({
        tokenId: novo.tokenId,
        nome: nome.valor,
        iniciativa: null,
        ordemDesempate: desempate,
      });
      return ok(undefined);
    });
  }

  /**
   * Sai da luta (morreu, fugiu, o mestre errou o token).
   *
   * O turno nunca fica órfão: quem sai antes de quem está no turno só desloca o
   * índice (e `preservandoTurno` segue o mesmo `tokenId`); quem sai **estando** no
   * turno deixa o índice apontando para o participante que ocupava a posição
   * seguinte — ou seja, o próximo da ordem.
   */
  remover(tokenId: string): Result<void> {
    const ativo = this.garantirAtivo();
    if (!ativo.ok) return falha(ativo.erro);

    const indice = this.props.participantes.findIndex((p) => p.tokenId === tokenId);
    if (indice < 0) return falha(ErroDominio.naoEncontrado('Participante não está no combate.'));

    return this.preservandoTurno(() => {
      this.props.participantes.splice(indice, 1);
      return ok(undefined);
    });
  }

  /**
   * Grava a iniciativa rolada e reordena.
   *
   * O turno segue a **pessoa**, não a posição: rolar a iniciativa de alguém no
   * meio da luta reordena a lista, e é o mesmo participante que continua na vez.
   */
  definirIniciativa(tokenId: string, valor: number): Result<void> {
    const ativo = this.garantirAtivo();
    if (!ativo.ok) return falha(ativo.erro);

    if (!Number.isInteger(valor) || valor < INICIATIVA_MINIMA || valor > INICIATIVA_MAXIMA) {
      return falha(ErroDominio.validacao(MENSAGEM_INICIATIVA));
    }
    const participante = this.props.participantes.find((p) => p.tokenId === tokenId);
    if (!participante) {
      return falha(ErroDominio.naoEncontrado('Participante não está no combate.'));
    }
    return this.preservandoTurno(() => {
      participante.iniciativa = valor;
      return ok(undefined);
    });
  }

  /**
   * Passa a vez. No último participante, a rodada avança e o turno volta ao
   * primeiro — é a única forma de a rodada mudar.
   *
   * Combate vazio **não quebra**: recusa com `conflito` e deixa rodada e índice
   * como estavam. Uma exceção aqui seria 500 numa situação que o mestre alcança
   * sozinho (removeu o último participante e clicou em "próximo turno"), e um
   * `ok` silencioso mentiria dizendo que a vez passou.
   */
  proximoTurno(): Result<ResultadoTurno> {
    const ativo = this.garantirAtivo();
    if (!ativo.ok) return falha(ativo.erro);

    const total = this.props.participantes.length;
    if (total === 0) return falha(ErroDominio.conflito(COMBATE_SEM_PARTICIPANTES));

    const seguinte = this.props.indiceTurno + 1;
    const novaRodada = seguinte >= total;
    this.props.indiceTurno = novaRodada ? 0 : seguinte;
    if (novaRodada) this.props.rodada += 1;

    const participante = this.props.participantes[this.props.indiceTurno];
    // `total > 0` e o índice acabou de ser posto na faixa: o `?? ` existe só para
    // o compilador, e um estado que o alcançasse seria bug, não fluxo.
    if (!participante) return falha(ErroDominio.conflito(COMBATE_SEM_PARTICIPANTES));
    return ok({ rodada: this.props.rodada, novaRodada, participante });
  }

  /** Encerra a luta. O combate não é apagado: vira histórico e libera a próxima. */
  encerrar(): Result<void> {
    const ativo = this.garantirAtivo();
    if (!ativo.ok) return falha(ativo.erro);
    this.props.ativo = false;
    return ok(undefined);
  }

  /**
   * "Esta luta ainda está em curso?" — a guarda que toda escrita atravessa.
   *
   * Pública porque o RV-065 escreve o PV **através** do combate sem mutar este
   * agregado (o PV é do `Personagem`), e precisa da mesma recusa em vez de um
   * `if (combate.ativo)` solto no caso de uso: guarda reimplementada é a F5 da
   * taxonomia, e a mensagem tem de ser uma só.
   */
  garantirEmCurso(): Result<void> {
    if (!this.props.ativo) return falha(ErroDominio.conflito(COMBATE_ENCERRADO));
    return ok(undefined);
  }

  private garantirAtivo(): Result<void> {
    return this.garantirEmCurso();
  }

  /**
   * Executa uma mutação da lista e devolve o turno para **quem** estava nele.
   *
   * É o ponto único de "o índice do turno acompanha a reordenação". Cada mutação
   * fazendo isso na mão seria a mesma regra copiada quatro vezes, e a cópia
   * esquecida é justamente a que embaralha o destaque no meio da luta.
   */
  private preservandoTurno<T>(acao: () => T): T {
    const noTurno = this.ancoraDoTurno();
    const resultado = acao();
    this.ordenarParticipantes();
    this.reposicionarTurno(noTurno);
    return resultado;
  }

  /**
   * A luta ainda não começou: ninguém agiu, e o combate está na fase de montar a
   * ordem.
   *
   * Derivado de `rodada === 1 && indiceTurno === 0`, e não de uma flag nova, porque
   * é **exatamente** o estado inicial: passar o turno a partir do índice 0 na
   * rodada 1 leva ao índice 1 (ou à rodada 2, com um participante só), então
   * nenhuma sequência de passagens de turno volta aqui.
   */
  private get emPreparacao(): boolean {
    return this.props.rodada === 1 && this.props.indiceTurno === 0;
  }

  /**
   * A quem o turno deve voltar depois de a lista ser reordenada — e é aqui que
   * mora a única sutileza real deste agregado.
   *
   * **Durante a luta, o turno acompanha a PESSOA.** Rolar a iniciativa de alguém
   * na rodada 3 reordena a lista, e a vez continua sendo de quem estava agindo;
   * um índice cru faria o destaque saltar para o vizinho sem ninguém ter passado o
   * turno.
   *
   * **Na preparação, o turno acompanha o TOPO DA ORDEM** (`null` cai no clamp, que
   * devolve 0). Ninguém agiu ainda: à medida que a mesa rola iniciativa, quem
   * fica em primeiro é quem começa. Sem esta distinção, o combate começaria sempre
   * com a vez do primeiro token que o mestre selecionou — e o mestre teria de
   * passar o turno às cegas até chegar em quem tirou a iniciativa mais alta.
   */
  private ancoraDoTurno(): string | null {
    if (this.emPreparacao) return null;
    return this.participanteDoTurno?.tokenId ?? null;
  }

  private ordenarParticipantes(): void {
    this.props.participantes.sort(compararParticipantes);
  }

  /**
   * Põe o índice do turno de volta num participante existente.
   *
   * `tokenId` informado e ainda presente → o turno o segue, onde ele tenha
   * parado. Ausente (foi removido, ou veio `null` da reconstituição) → o índice é
   * apenas trazido para dentro da faixa com `min(indice, último)`.
   *
   * O `min` é o que resolve a remoção de quem estava no turno: como o `splice`
   * puxa os seguintes uma casa para trás, o índice preservado já aponta para o
   * **próximo** da ordem. E quando o removido era o último, o índice cai no novo
   * último — de propósito: a rodada não terminou por alguém ter morrido, e o
   * próximo clique em "passar turno" é que a fecha e vira a rodada. Mandar o
   * turno para o primeiro aqui repetiria a rodada inteira de graça.
   */
  private reposicionarTurno(tokenId: string | null): void {
    const total = this.props.participantes.length;
    if (total === 0) {
      this.props.indiceTurno = 0;
      return;
    }
    const encontrado =
      tokenId === null ? -1 : this.props.participantes.findIndex((p) => p.tokenId === tokenId);
    this.props.indiceTurno =
      encontrado >= 0 ? encontrado : Math.min(Math.max(this.props.indiceTurno, 0), total - 1);
  }
}
