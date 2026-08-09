import { MENSAGEM_TAMANHO_CELULA, TAMANHO_CELULA_MAX, TAMANHO_CELULA_MIN } from '@rolavinte/shared';
import { Entidade } from '../compartilhado/entidade';
import { ErroDominio } from '../compartilhado/erro-dominio';
import { falha, ok, type Result } from '../compartilhado/resultado';

/** Campos que o mestre ajusta depois de criar a cena (RV-030 / RV-033). */
export interface DadosEditaveisCena {
  nome: string;
  larguraGrid: number;
  alturaGrid: number;
  corFundo: string;
  /** Lado da célula em pixels — encaixa o grid na escala do mapa. */
  tamanhoCelula: number;
  gridVisivel: boolean;
  corGrid: string;
}

interface PropsCena extends DadosEditaveisCena {
  mesaId: string;
  ativa: boolean;
  /** URL pública do mapa, o que o cliente renderiza. */
  imagemFundoUrl: string | null;
  /**
   * Caminho do arquivo no armazenamento. Fica no agregado (e não é derivado da
   * URL) porque é a única forma de apagar o mapa anterior na troca de fundo:
   * a extensão muda entre um upload e outro.
   */
  imagemFundoCaminho: string | null;
}

const COR_HEXADECIMAL = /^#[0-9a-fA-F]{6}$/;

const MENSAGEM_GRID = 'Grid deve ter entre 5 e 100 células por lado.';

/**
 * Raiz do agregado de tokens: o mapa onde a partida acontece.
 *
 * Invariantes protegidas aqui: limites do grid, limites da célula, formato das
 * cores e consistência da imagem de fundo (url e caminho andam juntos). Quem
 * pode escrever é regra do agregado `Mesa` — a cena não conhece usuários.
 */
export class Cena extends Entidade {
  private constructor(
    id: string,
    private readonly props: PropsCena,
  ) {
    super(id);
  }

  static criar(dados: DadosEditaveisCena & { id: string; mesaId: string }): Result<Cena> {
    const validados = Cena.validarDadosEditaveis(dados);
    if (!validados.ok) return falha(validados.erro);
    return ok(
      new Cena(dados.id, {
        ...validados.valor,
        mesaId: dados.mesaId,
        ativa: true,
        imagemFundoUrl: null,
        imagemFundoCaminho: null,
      }),
    );
  }

  static reconstituir(dados: PropsCena & { id: string }): Cena {
    const { id, ...props } = dados;
    return new Cena(id, props);
  }

  /** Única fonte das regras de formato — `criar` e `atualizar` passam por aqui. */
  private static validarDadosEditaveis(dados: DadosEditaveisCena): Result<DadosEditaveisCena> {
    const nome = dados.nome.trim();
    if (nome.length < 1 || nome.length > 80) {
      return falha(ErroDominio.validacao('Nome da cena deve ter entre 1 e 80 caracteres.'));
    }
    if (
      !Number.isInteger(dados.larguraGrid) ||
      !Number.isInteger(dados.alturaGrid) ||
      dados.larguraGrid < 5 ||
      dados.larguraGrid > 100 ||
      dados.alturaGrid < 5 ||
      dados.alturaGrid > 100
    ) {
      return falha(ErroDominio.validacao(MENSAGEM_GRID));
    }
    if (
      !Number.isInteger(dados.tamanhoCelula) ||
      dados.tamanhoCelula < TAMANHO_CELULA_MIN ||
      dados.tamanhoCelula > TAMANHO_CELULA_MAX
    ) {
      return falha(ErroDominio.validacao(MENSAGEM_TAMANHO_CELULA));
    }
    if (!COR_HEXADECIMAL.test(dados.corFundo)) {
      return falha(ErroDominio.validacao('Cor de fundo inválida.'));
    }
    if (!COR_HEXADECIMAL.test(dados.corGrid)) {
      return falha(ErroDominio.validacao('Cor do grid inválida.'));
    }
    return ok({
      nome,
      larguraGrid: dados.larguraGrid,
      alturaGrid: dados.alturaGrid,
      corFundo: dados.corFundo,
      tamanhoCelula: dados.tamanhoCelula,
      gridVisivel: dados.gridVisivel,
      corGrid: dados.corGrid,
    });
  }

  get mesaId(): string {
    return this.props.mesaId;
  }
  get nome(): string {
    return this.props.nome;
  }
  get larguraGrid(): number {
    return this.props.larguraGrid;
  }
  get alturaGrid(): number {
    return this.props.alturaGrid;
  }
  get corFundo(): string {
    return this.props.corFundo;
  }
  get ativa(): boolean {
    return this.props.ativa;
  }
  get imagemFundoUrl(): string | null {
    return this.props.imagemFundoUrl;
  }
  get imagemFundoCaminho(): string | null {
    return this.props.imagemFundoCaminho;
  }
  get tamanhoCelula(): number {
    return this.props.tamanhoCelula;
  }
  get gridVisivel(): boolean {
    return this.props.gridVisivel;
  }
  get corGrid(): string {
    return this.props.corGrid;
  }

  /** Edição parcial: campo ausente mantém o valor atual (RV-030 / RV-033). */
  atualizar(dados: Partial<DadosEditaveisCena>): Result<void> {
    const validados = Cena.validarDadosEditaveis({
      nome: dados.nome ?? this.props.nome,
      larguraGrid: dados.larguraGrid ?? this.props.larguraGrid,
      alturaGrid: dados.alturaGrid ?? this.props.alturaGrid,
      corFundo: dados.corFundo ?? this.props.corFundo,
      tamanhoCelula: dados.tamanhoCelula ?? this.props.tamanhoCelula,
      gridVisivel: dados.gridVisivel ?? this.props.gridVisivel,
      corGrid: dados.corGrid ?? this.props.corGrid,
    });
    if (!validados.ok) return falha(validados.erro);

    this.props.nome = validados.valor.nome;
    this.props.larguraGrid = validados.valor.larguraGrid;
    this.props.alturaGrid = validados.valor.alturaGrid;
    this.props.corFundo = validados.valor.corFundo;
    this.props.tamanhoCelula = validados.valor.tamanhoCelula;
    this.props.gridVisivel = validados.valor.gridVisivel;
    this.props.corGrid = validados.valor.corGrid;
    return ok(undefined);
  }

  ativar(): void {
    this.props.ativa = true;
  }

  desativar(): void {
    this.props.ativa = false;
  }

  /**
   * Troca o mapa da cena e devolve o caminho do arquivo anterior, para que o
   * caso de uso apague o que ficou órfão no armazenamento (RV-032).
   */
  definirImagemFundo(url: string, caminho: string): string | null {
    const anterior = this.props.imagemFundoCaminho;
    this.props.imagemFundoUrl = url;
    this.props.imagemFundoCaminho = caminho;
    return anterior;
  }

  contemPosicao(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.props.larguraGrid && y < this.props.alturaGrid;
  }
}
