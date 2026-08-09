import type { PapelNaMesa, SistemaRpg, StatusConvite } from '@rolavinte/shared';
import { Entidade } from '../compartilhado/entidade';
import { ErroDominio } from '../compartilhado/erro-dominio';
import { falha, ok, type Result } from '../compartilhado/resultado';
import { Email } from '../contas/email';
import { JogadorConvidado } from './eventos';

export interface Participante {
  usuarioId: string;
  papel: PapelNaMesa;
  entrouEm: Date;
}

export interface Convite {
  id: string;
  email: string;
  token: string;
  status: StatusConvite;
  criadoEm: Date;
}

/** Campos que o mestre pode corrigir depois da criação (RV-024). */
export interface DadosEditaveisMesa {
  nome: string;
  descricao: string;
  sistema: SistemaRpg;
}

const COOLDOWN_REENVIO_MS = 60_000;

/** Mensagem única de mesa encerrada — o contrato do RV-023 depende dela. */
export const MESA_ENCERRADA = 'Esta mesa foi encerrada.';

interface PropsMesa {
  nome: string;
  descricao: string;
  sistema: SistemaRpg;
  mestreId: string;
  participantes: Participante[];
  convites: Convite[];
  criadoEm: Date;
  encerradaEm: Date | null;
}

/**
 * Agregado raiz do contexto de mesas. Invariantes protegidas aqui:
 * - exatamente um mestre, que é sempre participante;
 * - só o mestre convida, revoga convite, remove jogador, edita e encerra;
 * - o mestre não sai nem se remove da própria mesa;
 * - convite pendente por email tem cooldown de reenvio;
 * - convite só é aceito uma vez, pelo email convidado, e nunca depois de revogado;
 * - mesa encerrada é somente leitura (a guarda vive aqui, não nos casos de uso).
 */
export class Mesa extends Entidade {
  private constructor(
    id: string,
    private readonly props: PropsMesa,
  ) {
    super(id);
  }

  static criar(dados: {
    id: string;
    nome: string;
    descricao: string;
    sistema: SistemaRpg;
    mestreId: string;
    agora: Date;
  }): Result<Mesa> {
    const validados = Mesa.validarDadosEditaveis(dados);
    if (!validados.ok) return falha(validados.erro);
    return ok(
      new Mesa(dados.id, {
        ...validados.valor,
        mestreId: dados.mestreId,
        participantes: [{ usuarioId: dados.mestreId, papel: 'mestre', entrouEm: dados.agora }],
        convites: [],
        criadoEm: dados.agora,
        encerradaEm: null,
      }),
    );
  }

  static reconstituir(dados: PropsMesa & { id: string }): Mesa {
    const { id, ...props } = dados;
    return new Mesa(id, props);
  }

  /**
   * Única fonte das regras de formato de nome/descrição/sistema — `criar` e
   * `atualizar` passam por aqui, então não existe validação duplicada (RV-024).
   */
  private static validarDadosEditaveis(dados: DadosEditaveisMesa): Result<DadosEditaveisMesa> {
    const nome = dados.nome.trim();
    if (nome.length < 3 || nome.length > 80) {
      return falha(ErroDominio.validacao('Nome da mesa deve ter entre 3 e 80 caracteres.'));
    }
    return ok({ nome, descricao: dados.descricao.trim(), sistema: dados.sistema });
  }

  get nome(): string {
    return this.props.nome;
  }
  get descricao(): string {
    return this.props.descricao;
  }
  get sistema(): SistemaRpg {
    return this.props.sistema;
  }
  get mestreId(): string {
    return this.props.mestreId;
  }
  get criadoEm(): Date {
    return this.props.criadoEm;
  }
  get encerradaEm(): Date | null {
    return this.props.encerradaEm;
  }
  get encerrada(): boolean {
    return this.props.encerradaEm !== null;
  }
  get participantes(): readonly Participante[] {
    return this.props.participantes;
  }
  get convites(): readonly Convite[] {
    return this.props.convites;
  }

  ehMestre(usuarioId: string): boolean {
    return this.props.mestreId === usuarioId;
  }

  ehParticipante(usuarioId: string): boolean {
    return this.props.participantes.some((p) => p.usuarioId === usuarioId);
  }

  /**
   * Porta de entrada de toda escrita feita por um participante em qualquer
   * contexto da mesa (chat, rolagem, tokens). Concentra participação + mesa
   * aberta num lugar só: os casos de uso não repetem `if (mesa.encerrada)`.
   */
  autorizarEscritaDeParticipante(usuarioId: string): Result<void> {
    if (!this.ehParticipante(usuarioId)) {
      return falha(ErroDominio.naoAutorizado('Você não participa desta mesa.'));
    }
    return this.garantirAberta();
  }

  /** Mesma guarda, para as escritas privativas do mestre (cenas, tokens). */
  autorizarEscritaDoMestre(usuarioId: string, mensagemNegada: string): Result<void> {
    if (!this.ehMestre(usuarioId)) {
      return falha(ErroDominio.naoAutorizado(mensagemNegada));
    }
    return this.garantirAberta();
  }

  private garantirAberta(): Result<void> {
    if (this.encerrada) return falha(ErroDominio.conflito(MESA_ENCERRADA));
    return ok(undefined);
  }

  atualizar(solicitanteId: string, dados: Partial<DadosEditaveisMesa>): Result<void> {
    const permitido = this.autorizarEscritaDoMestre(
      solicitanteId,
      'Apenas o mestre pode editar a mesa.',
    );
    if (!permitido.ok) return falha(permitido.erro);

    const validados = Mesa.validarDadosEditaveis({
      nome: dados.nome ?? this.props.nome,
      descricao: dados.descricao ?? this.props.descricao,
      sistema: dados.sistema ?? this.props.sistema,
    });
    if (!validados.ok) return falha(validados.erro);

    this.props.nome = validados.valor.nome;
    this.props.descricao = validados.valor.descricao;
    this.props.sistema = validados.valor.sistema;
    return ok(undefined);
  }

  encerrar(solicitanteId: string, agora: Date): Result<void> {
    if (!this.ehMestre(solicitanteId)) {
      return falha(ErroDominio.naoAutorizado('Apenas o mestre pode encerrar a mesa.'));
    }
    if (this.encerrada) return falha(ErroDominio.conflito('Esta mesa já foi encerrada.'));
    this.props.encerradaEm = agora;
    return ok(undefined);
  }

  convidar(dados: {
    solicitanteId: string;
    nomeSolicitante: string;
    emailConvidado: string;
    conviteId: string;
    tokenConvite: string;
    agora: Date;
  }): Result<Convite> {
    const permitido = this.autorizarEscritaDoMestre(
      dados.solicitanteId,
      'Apenas o mestre pode convidar jogadores.',
    );
    if (!permitido.ok) return falha(permitido.erro);

    const email = Email.criar(dados.emailConvidado);
    if (!email.ok) return falha(email.erro);

    const pendenteRecente = this.props.convites.find(
      (c) =>
        c.email === email.valor.valor &&
        c.status === 'pendente' &&
        dados.agora.getTime() - c.criadoEm.getTime() < COOLDOWN_REENVIO_MS,
    );
    if (pendenteRecente) {
      return falha(
        ErroDominio.conflito('Convite já enviado há pouco para este email. Aguarde um minuto.'),
      );
    }

    const convite: Convite = {
      id: dados.conviteId,
      email: email.valor.valor,
      token: dados.tokenConvite,
      status: 'pendente',
      criadoEm: dados.agora,
    };
    this.props.convites.push(convite);
    this.registrarEvento(
      new JogadorConvidado(dados.agora, {
        mesaId: this.id,
        mesaNome: this.props.nome,
        emailConvidado: convite.email,
        tokenConvite: convite.token,
        nomeMestre: dados.nomeSolicitante,
      }),
    );
    return ok(convite);
  }

  /**
   * Revoga um convite pendente. O convite não é apagado: vira `revogado`,
   * preservando o histórico de quem foi chamado para a mesa (RV-020).
   */
  revogarConvite(solicitanteId: string, conviteId: string): Result<void> {
    const permitido = this.autorizarEscritaDoMestre(
      solicitanteId,
      'Apenas o mestre pode gerir os convites da mesa.',
    );
    if (!permitido.ok) return falha(permitido.erro);

    const convite = this.props.convites.find((c) => c.id === conviteId);
    if (!convite) return falha(ErroDominio.naoEncontrado('Convite não encontrado.'));
    if (convite.status === 'aceito') {
      return falha(ErroDominio.conflito('Este convite já foi aceito e não pode ser revogado.'));
    }
    if (convite.status === 'revogado') {
      return falha(ErroDominio.conflito('Este convite já foi revogado.'));
    }

    convite.status = 'revogado';
    return ok(undefined);
  }

  aceitarConvite(dados: {
    token: string;
    usuarioId: string;
    emailUsuario: string;
    agora: Date;
  }): Result<void> {
    const aberta = this.garantirAberta();
    if (!aberta.ok) return falha(aberta.erro);

    const convite = this.props.convites.find((c) => c.token === dados.token);
    if (!convite) return falha(ErroDominio.naoEncontrado('Convite não encontrado.'));
    if (convite.status === 'revogado') {
      return falha(ErroDominio.naoEncontrado('Convite não encontrado ou já utilizado.'));
    }
    if (convite.status === 'aceito') {
      return falha(ErroDominio.conflito('Este convite já foi utilizado.'));
    }
    if (convite.email !== dados.emailUsuario.trim().toLowerCase()) {
      return falha(ErroDominio.naoAutorizado('Este convite foi enviado para outro email.'));
    }
    if (this.ehParticipante(dados.usuarioId)) {
      return falha(ErroDominio.conflito('Você já participa desta mesa.'));
    }
    convite.status = 'aceito';
    this.props.participantes.push({
      usuarioId: dados.usuarioId,
      papel: 'jogador',
      entrouEm: dados.agora,
    });
    return ok(undefined);
  }

  /** Remoção pelo mestre (RV-021). O mestre nunca remove a si mesmo. */
  removerJogador(solicitanteId: string, usuarioId: string): Result<void> {
    const permitido = this.autorizarEscritaDoMestre(
      solicitanteId,
      'Apenas o mestre pode remover jogadores.',
    );
    if (!permitido.ok) return falha(permitido.erro);

    if (this.ehMestre(usuarioId)) {
      return falha(
        ErroDominio.naoAutorizado(
          'O mestre não pode remover a si mesmo. Encerre a mesa ou transfira a mestrança.',
        ),
      );
    }
    return this.desligarParticipante(usuarioId, 'Este usuário não participa desta mesa.');
  }

  /** Saída voluntária (RV-022). O mestre não abandona a própria mesa. */
  /**
   * Sair não passa por `garantirAberta`: arquivar a campanha não pode prender o
   * jogador a ela para sempre. Sem isso, mesa encerrada fica presa no painel de
   * quem não joga mais — o oposto do que o RV-022 existe para resolver.
   */
  sair(usuarioId: string): Result<void> {
    if (this.ehMestre(usuarioId)) {
      return falha(
        ErroDominio.naoAutorizado(
          'O mestre não pode sair da própria mesa. Transfira a mestrança ou encerre a mesa.',
        ),
      );
    }
    return this.desligarParticipante(usuarioId, 'Você não participa desta mesa.');
  }

  private desligarParticipante(usuarioId: string, mensagemAusente: string): Result<void> {
    const indice = this.props.participantes.findIndex((p) => p.usuarioId === usuarioId);
    if (indice < 0) return falha(ErroDominio.naoEncontrado(mensagemAusente));
    this.props.participantes.splice(indice, 1);
    return ok(undefined);
  }
}
