import {
  mensagemEhRestrita,
  mensagemVisivelPara,
  type AvaliacaoRolagem,
  type ResultadoRolagem,
  type TipoMensagem,
} from '@rolavinte/shared';
import { Entidade } from '../compartilhado/entidade';
import { ErroDominio } from '../compartilhado/erro-dominio';
import { falha, ok, type Result } from '../compartilhado/resultado';

interface PropsMensagem {
  mesaId: string;
  autorId: string | null;
  autorNome: string;
  tipo: TipoMensagem;
  conteudo: string;
  rolagem: ResultadoRolagem | null;
  motivo: string | null;
  /**
   * Grau de sucesso contra a CD informada (RV-154). `null` sempre que não houve
   * CD — o que inclui **toda** fala, todo sussurro e a rolagem livre (`/r 1d20`),
   * que continua sendo a rolagem que sempre foi.
   *
   * Só as duas fábricas de rolagem aceitam este dado: uma fala com grau de
   * sucesso é estado impossível, e o banco também o recusa (check da `0010`).
   */
  avaliacao: AvaliacaoRolagem | null;
  /** Preenchido só no sussurro (RV-070). Rolagem oculta é visível só ao autor. */
  destinatarioId: string | null;
  destinatarioNome: string | null;
  criadoEm: Date;
}

const TAMANHO_MAXIMO_CONTEUDO = 2000;

/**
 * O que as duas fábricas de rolagem recebem. Extraído para um lugar só porque a
 * assinatura passou a ter um campo opcional (`avaliacao`, RV-154) e três cópias
 * dela divergiriam na primeira mudança.
 */
export interface DadosRolagem {
  id: string;
  mesaId: string;
  autorId: string;
  autorNome: string;
  rolagem: ResultadoRolagem;
  motivo: string;
  /** Grau de sucesso já apurado pelo sistema da mesa; ausente = sem CD. */
  avaliacao?: AvaliacaoRolagem | null;
  agora: Date;
}

/**
 * Uma entrada do chat da mesa.
 *
 * Além de fala e rolagem, existem dois tipos **restritos** (RV-070/RV-071):
 * `sussurro`, que só autor e destinatário veem, e `rolagem-oculta`, que só o
 * autor vê. A regra de quem vê o quê não fica espalhada: `visivelPara` delega
 * a `mensagemVisivelPara` de `@rolavinte/shared`, o mesmo predicado que o
 * repositório usa para montar a consulta e que impede o dado de sair do
 * servidor.
 */
export class Mensagem extends Entidade {
  private constructor(
    id: string,
    private readonly props: PropsMensagem,
  ) {
    super(id);
  }

  /** Validação única do texto — fala e sussurro têm exatamente as mesmas regras. */
  private static validarConteudo(conteudo: string): Result<string> {
    const limpo = conteudo.trim();
    if (limpo.length === 0) return falha(ErroDominio.validacao('Mensagem vazia.'));
    if (limpo.length > TAMANHO_MAXIMO_CONTEUDO) {
      return falha(ErroDominio.validacao('Mensagem longa demais.'));
    }
    return ok(limpo);
  }

  static criarFala(dados: {
    id: string;
    mesaId: string;
    autorId: string;
    autorNome: string;
    conteudo: string;
    agora: Date;
  }): Result<Mensagem> {
    const conteudo = Mensagem.validarConteudo(dados.conteudo);
    if (!conteudo.ok) return falha(conteudo.erro);
    return ok(
      new Mensagem(dados.id, {
        mesaId: dados.mesaId,
        autorId: dados.autorId,
        autorNome: dados.autorNome,
        tipo: 'fala',
        conteudo: conteudo.valor,
        rolagem: null,
        motivo: null,
        avaliacao: null,
        destinatarioId: null,
        destinatarioNome: null,
        criadoEm: dados.agora,
      }),
    );
  }

  /**
   * Sussurro (RV-070): mesma fala, com destinatário. O destinatário é resolvido
   * pelo caso de uso (precisa da lista de participantes da mesa) e chega aqui
   * já validado como participante.
   */
  static criarSussurro(dados: {
    id: string;
    mesaId: string;
    autorId: string;
    autorNome: string;
    destinatarioId: string;
    destinatarioNome: string;
    conteudo: string;
    agora: Date;
  }): Result<Mensagem> {
    const conteudo = Mensagem.validarConteudo(dados.conteudo);
    if (!conteudo.ok) return falha(conteudo.erro);
    return ok(
      new Mensagem(dados.id, {
        mesaId: dados.mesaId,
        autorId: dados.autorId,
        autorNome: dados.autorNome,
        tipo: 'sussurro',
        conteudo: conteudo.valor,
        rolagem: null,
        motivo: null,
        avaliacao: null,
        destinatarioId: dados.destinatarioId,
        destinatarioNome: dados.destinatarioNome,
        criadoEm: dados.agora,
      }),
    );
  }

  static criarRolagem(dados: DadosRolagem): Mensagem {
    return Mensagem.montarRolagem(dados, 'rolagem');
  }

  /**
   * Rolagem oculta do mestre (RV-071): mesmo resultado, visível só ao autor.
   * Não tem destinatário — quem rola é quem vê, e mais ninguém. A autorização
   * ("é o mestre?") é do caso de uso, que reusa a guarda do agregado `Mesa`.
   */
  static criarRolagemOculta(dados: DadosRolagem): Mensagem {
    return Mensagem.montarRolagem(dados, 'rolagem-oculta');
  }

  private static montarRolagem(dados: DadosRolagem, tipo: 'rolagem' | 'rolagem-oculta'): Mensagem {
    return new Mensagem(dados.id, {
      mesaId: dados.mesaId,
      autorId: dados.autorId,
      autorNome: dados.autorNome,
      tipo,
      conteudo: dados.rolagem.expressao,
      rolagem: dados.rolagem,
      motivo: dados.motivo.trim() || null,
      // Quem avalia é a definição do sistema da mesa, no caso de uso: a entidade
      // guarda o veredito, não a regra. Ausente = rolagem sem CD (RV-154).
      avaliacao: dados.avaliacao ?? null,
      destinatarioId: null,
      destinatarioNome: null,
      criadoEm: dados.agora,
    });
  }

  static reconstituir(dados: PropsMensagem & { id: string }): Mensagem {
    const { id, ...props } = dados;
    return new Mensagem(id, props);
  }

  get mesaId(): string {
    return this.props.mesaId;
  }
  get autorId(): string | null {
    return this.props.autorId;
  }
  get autorNome(): string {
    return this.props.autorNome;
  }
  get tipo(): TipoMensagem {
    return this.props.tipo;
  }
  get conteudo(): string {
    return this.props.conteudo;
  }
  get rolagem(): ResultadoRolagem | null {
    return this.props.rolagem;
  }
  get motivo(): string | null {
    return this.props.motivo;
  }
  get avaliacao(): AvaliacaoRolagem | null {
    return this.props.avaliacao;
  }
  get destinatarioId(): string | null {
    return this.props.destinatarioId;
  }
  get destinatarioNome(): string | null {
    return this.props.destinatarioNome;
  }
  get criadoEm(): Date {
    return this.props.criadoEm;
  }

  /** Quem recebe esta mensagem em tempo real e a enxerga no histórico. */
  visivelPara(usuarioId: string): boolean {
    return mensagemVisivelPara(this.props, usuarioId);
  }

  /** `true` quando a mensagem não pode ir para a sala inteira da mesa. */
  get restrita(): boolean {
    return mensagemEhRestrita(this.props.tipo);
  }

  /**
   * Usuários que devem receber o broadcast quando a mensagem é restrita.
   * Vazio para mensagem pública — essa vai para a sala da mesa inteira.
   */
  get destinatariosPrivados(): readonly string[] {
    if (this.props.tipo === 'sussurro') {
      const alvos = new Set<string>();
      if (this.props.autorId) alvos.add(this.props.autorId);
      if (this.props.destinatarioId) alvos.add(this.props.destinatarioId);
      return [...alvos];
    }
    if (this.props.tipo === 'rolagem-oculta' && this.props.autorId) return [this.props.autorId];
    return [];
  }
}
