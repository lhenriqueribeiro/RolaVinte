import {
  atributosIniciais,
  validarAtributosDoSistema,
  validarDadosDaFicha,
  type Atributos,
  type DadosFicha,
  type SistemaRpg,
} from '@rolavinte/shared';
import { Entidade } from '../compartilhado/entidade';
import { ErroDominio } from '../compartilhado/erro-dominio';
import { falha, ok, type Result } from '../compartilhado/resultado';

/** Limite de `nome`, o mesmo na criação, na edição e na cópia. */
const NOME_MINIMO = 2;
const NOME_MAXIMO = 60;
const MENSAGEM_NOME = `Nome do personagem deve ter entre ${NOME_MINIMO} e ${NOME_MAXIMO} caracteres.`;

/** Sufixo da ficha duplicada (RV-093). */
const SUFIXO_COPIA = ' (cópia)';

interface PropsPersonagem {
  mesaId: string;
  donoId: string;
  nome: string;
  classe: string;
  nivel: number;
  pvAtual: number;
  pvMax: number;
  /**
   * Os seis atributos, **na escala do sistema da mesa** (RV-098).
   *
   * É o único lugar onde o atributo existe. Até o RV-098 o PF2e mantinha uma
   * segunda cópia (o modificador) dentro de `dados`, e a ficha lia essa cópia
   * enquanto a criação exigia e gravava esta coluna: quem informava Força 18 via
   * o valor desaparecer. A escala (1..30 ou −5..+8) é declarada pela definição do
   * sistema e conferida por `validarAtributosDoSistema` em toda escrita.
   */
  atributos: Atributos;
  anotacoes: string;
  /**
   * A metade da ficha que pertence ao sistema da mesa (RV-091).
   *
   * O `Personagem` **não** guarda o sistema: quem o define é a `Mesa`, e
   * duplicar o valor aqui criaria duas verdades para divergir na primeira
   * edição da mesa. Por isso todo método que precisa validar `dados` recebe o
   * `sistema` como parâmetro — é o contexto de `mesas` informando o de
   * `personagens`, por valor, como manda `.claude/rules/02-ddd.md`.
   */
  dados: DadosFicha;
}

export interface CamposAtualizacaoPersonagem {
  nome?: string;
  classe?: string;
  nivel?: number;
  pvAtual?: number;
  pvMax?: number;
  atributos?: Atributos;
  anotacoes?: string;
  /** Substitui a ficha do sistema por inteiro; `undefined` não mexe nela. */
  dados?: DadosFicha;
}

export interface DadosCriacaoPersonagem {
  id: string;
  mesaId: string;
  donoId: string;
  nome: string;
  classe: string;
  nivel: number;
  pvMax: number;
  /** Omitido nasce no padrão da escala do sistema (`atributosIniciais`, RV-098). */
  atributos?: Atributos;
  anotacoes: string;
  /** Omitido nasce com os padrões do sistema (`dadosIniciaisDaFicha`). */
  dados?: DadosFicha;
}

export class Personagem extends Entidade {
  private constructor(
    id: string,
    private readonly props: PropsPersonagem,
  ) {
    super(id);
  }

  static criar(dados: DadosCriacaoPersonagem, sistema: SistemaRpg): Result<Personagem> {
    const nome = dados.nome.trim();
    if (nome.length < NOME_MINIMO || nome.length > NOME_MAXIMO) {
      return falha(ErroDominio.validacao(MENSAGEM_NOME));
    }
    if (dados.pvMax < 1) return falha(ErroDominio.validacao('PV máximo deve ser positivo.'));

    // Mesmo na criação a ficha do sistema passa pelo schema: `dadosIniciaisDaFicha`
    // sai daqui quando o cliente não manda nada, e o que ele manda é conferido.
    const ficha = validarDadosDaFicha(sistema, dados.dados);
    if (!ficha.ok) return falha(ErroDominio.validacao(ficha.erro));

    // O atributo informado na criação é conferido contra a escala do sistema e
    // **gravado** (RV-098): exigir, guardar e ignorar era o defeito. Omitido,
    // nasce no padrão daquela escala — nunca num 10 que só serve ao d20.
    const atributos = Personagem.validarAtributos(dados.atributos, sistema);
    if (!atributos.ok) return falha(atributos.erro);

    const { id, dados: _dadosBrutos, atributos: _atributosBrutos, ...resto } = dados;
    return ok(
      new Personagem(id, {
        ...resto,
        nome,
        pvAtual: dados.pvMax,
        atributos: atributos.valor,
        dados: ficha.dados,
      }),
    );
  }

  /**
   * A escala do atributo é do sistema, e é conferida em toda escrita (RV-098).
   *
   * Fica no agregado, e não no caso de uso, porque é invariante da ficha: um
   * personagem com Força 18 numa mesa de PF2e não é um estado que exista, venha a
   * escrita de onde vier.
   */
  private static validarAtributos(
    informados: Atributos | undefined,
    sistema: SistemaRpg,
  ): Result<Atributos> {
    if (informados === undefined) return ok(atributosIniciais(sistema));
    const validado = validarAtributosDoSistema(sistema, informados);
    return validado.ok ? ok(validado.atributos) : falha(ErroDominio.validacao(validado.erro));
  }

  /**
   * Hidrata do banco. **Não** revalida: uma ficha gravada antes de o sistema da
   * mesa mudar continua carregando, e o congelamento acontece na próxima
   * escrita, onde há como avisar o usuário. Revalidar aqui tornaria a ficha
   * ilegível — o pior desfecho possível para o dono dela.
   */
  static reconstituir(dados: PropsPersonagem & { id: string }): Personagem {
    const { id, ...props } = dados;
    return new Personagem(id, props);
  }

  /**
   * Nome da cópia, cabendo no limite de 60 caracteres (RV-093).
   *
   * Um nome de 58 caracteres mais " (cópia)" daria 66 e a duplicação falharia
   * com um erro de validação que o usuário não causou nem consegue evitar —
   * então o nome base é encurtado, e não a operação recusada.
   */
  static nomeDaCopia(nome: string): string {
    const base = nome.trim();
    const disponivel = NOME_MAXIMO - SUFIXO_COPIA.length;
    const encurtado = base.length > disponivel ? base.slice(0, disponivel).trimEnd() : base;
    return `${encurtado}${SUFIXO_COPIA}`;
  }

  get mesaId(): string {
    return this.props.mesaId;
  }
  get donoId(): string {
    return this.props.donoId;
  }
  get nome(): string {
    return this.props.nome;
  }
  get classe(): string {
    return this.props.classe;
  }
  get nivel(): number {
    return this.props.nivel;
  }
  get pvAtual(): number {
    return this.props.pvAtual;
  }
  get pvMax(): number {
    return this.props.pvMax;
  }
  get atributos(): Atributos {
    return this.props.atributos;
  }
  get anotacoes(): string {
    return this.props.anotacoes;
  }
  get dados(): DadosFicha {
    return this.props.dados;
  }

  /**
   * Ponto único de autorização da ficha: dono ou mestre da mesa (RV-027,
   * RV-093).
   *
   * Editar, excluir e duplicar compartilham exatamente esta regra. Reescrevê-la
   * em cada caso de uso é o defeito F5 da taxonomia — foi assim que o
   * congelamento de mesa encerrada furou nas fichas. Quem chama continua
   * obrigado a passar por `Mesa.autorizarEscritaDeParticipante`: esta guarda
   * responde "quem", a da mesa responde "quando".
   */
  autorizarEscrita(
    usuarioId: string,
    ehMestreDaMesa: boolean,
    mensagemNegada: string,
  ): Result<void> {
    if (ehMestreDaMesa || this.props.donoId === usuarioId) return ok(undefined);
    return falha(ErroDominio.naoAutorizado(mensagemNegada));
  }

  atualizar(campos: CamposAtualizacaoPersonagem, sistema: SistemaRpg): Result<void> {
    // A ficha do sistema é validada **antes** de qualquer mutação: uma recusa no
    // meio deixaria o agregado meio atualizado em memória.
    let fichaNova: DadosFicha | undefined;
    if (campos.dados !== undefined) {
      const ficha = validarDadosDaFicha(sistema, campos.dados);
      if (!ficha.ok) return falha(ErroDominio.validacao(ficha.erro));
      fichaNova = ficha.dados;
    }

    // Mesma disciplina para o atributo (RV-098): validado antes de qualquer
    // mutação, contra a escala do sistema da mesa.
    let atributosNovos: Atributos | undefined;
    if (campos.atributos !== undefined) {
      const validado = validarAtributosDoSistema(sistema, campos.atributos);
      if (!validado.ok) return falha(ErroDominio.validacao(validado.erro));
      atributosNovos = validado.atributos;
    }

    if (campos.nome !== undefined) {
      const nome = campos.nome.trim();
      if (nome.length < NOME_MINIMO || nome.length > NOME_MAXIMO) {
        return falha(ErroDominio.validacao(MENSAGEM_NOME));
      }
      this.props.nome = nome;
    }
    if (campos.pvMax !== undefined) {
      if (campos.pvMax < 1) return falha(ErroDominio.validacao('PV máximo deve ser positivo.'));
      this.props.pvMax = campos.pvMax;
      this.props.pvAtual = Math.min(this.props.pvAtual, campos.pvMax);
    }
    if (campos.pvAtual !== undefined) {
      if (campos.pvAtual < 0 || campos.pvAtual > this.props.pvMax) {
        return falha(ErroDominio.validacao('PV atual deve estar entre 0 e o PV máximo.'));
      }
      this.props.pvAtual = campos.pvAtual;
    }
    if (campos.classe !== undefined) this.props.classe = campos.classe.trim();
    if (campos.nivel !== undefined) {
      if (campos.nivel < 1 || campos.nivel > 20)
        return falha(ErroDominio.validacao('Nível deve ser 1..20.'));
      this.props.nivel = campos.nivel;
    }
    if (campos.anotacoes !== undefined) this.props.anotacoes = campos.anotacoes;
    if (atributosNovos !== undefined) this.props.atributos = atributosNovos;
    if (fichaNova !== undefined) this.props.dados = fichaNova;
    return ok(undefined);
  }

  /**
   * Cópia com id novo, nome sufixado e **PV cheio** (RV-093).
   *
   * Passa por `criar` de propósito, em vez de clonar as props: a cópia nasce
   * sujeita às mesmas invariantes de uma ficha nova, inclusive a validação da
   * ficha do sistema e da escala dos atributos (RV-098). Se a mesa trocou de
   * sistema desde que o original foi gravado, a duplicação recusa com 400 em vez
   * de propagar dados que aquela mesa já não sabe ler — e o mesmo vale para uma
   * ficha de PF2e gravada antes da migration `0009`, cujo atributo está na escala
   * do d20: melhor recusar dizendo o motivo que multiplicar o número errado.
   */
  duplicar(novoId: string, sistema: SistemaRpg): Result<Personagem> {
    return Personagem.criar(
      {
        id: novoId,
        mesaId: this.props.mesaId,
        donoId: this.props.donoId,
        nome: Personagem.nomeDaCopia(this.props.nome),
        classe: this.props.classe,
        nivel: this.props.nivel,
        pvMax: this.props.pvMax,
        atributos: { ...this.props.atributos },
        anotacoes: this.props.anotacoes,
        dados: structuredClone(this.props.dados),
      },
      sistema,
    );
  }
}
