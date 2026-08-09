import { Entidade } from '../compartilhado/entidade';
import { ErroDominio } from '../compartilhado/erro-dominio';
import { falha, ok, type Result } from '../compartilhado/resultado';
import type { Cena } from './cena';

/** O que o mestre corrige depois de criar a peça (RV-040). */
export interface DadosEditaveisToken {
  nome: string;
  cor: string;
}

/** Dados de nascimento do token: posição entra aqui, arte não (RV-041). */
export interface DadosCriacaoToken extends DadosEditaveisToken {
  cenaId: string;
  x: number;
  y: number;
  personagemId: string | null;
}

interface PropsToken extends DadosCriacaoToken {
  /** URL pública da arte; `null` mantém o fallback de cor + iniciais. */
  imagemUrl: string | null;
  /**
   * Caminho do arquivo no armazenamento — mesma razão da `Cena`: a extensão
   * muda entre uploads, então não dá para derivar o caminho da URL na hora de
   * apagar a arte anterior. Nunca sai no `TokenDTO`.
   */
  imagemCaminho: string | null;
}

const COR_HEXADECIMAL = /^#[0-9a-fA-F]{6}$/;

export const MENSAGEM_NOME_TOKEN = 'Nome do token deve ter entre 1 e 60 caracteres.';
export const MENSAGEM_COR_TOKEN = 'Cor do token inválida.';

/**
 * Peça posicionável na cena.
 *
 * O token **não** guarda pontos de vida (RV-042): quando há `personagemId`, o
 * PV é lido do agregado `Personagem`. Copiar o PV para cá criaria duas fontes
 * de verdade que divergiriam no primeiro dano aplicado pela ficha.
 *
 * Quem pode escrever é regra do agregado `Mesa` — o token não conhece usuários.
 */
export class Token extends Entidade {
  private constructor(
    id: string,
    private readonly props: PropsToken,
  ) {
    super(id);
  }

  static criar(dados: DadosCriacaoToken & { id: string; cena: Cena }): Result<Token> {
    if (!dados.cena.contemPosicao(dados.x, dados.y)) {
      return falha(ErroDominio.validacao('Posição fora dos limites da cena.'));
    }
    const validados = Token.validarDadosEditaveis(dados);
    if (!validados.ok) return falha(validados.erro);

    return ok(
      new Token(dados.id, {
        ...validados.valor,
        cenaId: dados.cenaId,
        x: dados.x,
        y: dados.y,
        personagemId: dados.personagemId,
        imagemUrl: null,
        imagemCaminho: null,
      }),
    );
  }

  static reconstituir(dados: PropsToken & { id: string }): Token {
    const { id, ...props } = dados;
    return new Token(id, props);
  }

  /** Única fonte das regras de nome e cor — `criar` e `atualizar` passam por aqui. */
  private static validarDadosEditaveis(dados: DadosEditaveisToken): Result<DadosEditaveisToken> {
    const nome = dados.nome.trim();
    if (nome.length < 1 || nome.length > 60) {
      return falha(ErroDominio.validacao(MENSAGEM_NOME_TOKEN));
    }
    if (!COR_HEXADECIMAL.test(dados.cor)) {
      return falha(ErroDominio.validacao(MENSAGEM_COR_TOKEN));
    }
    return ok({ nome, cor: dados.cor });
  }

  get cenaId(): string {
    return this.props.cenaId;
  }
  get nome(): string {
    return this.props.nome;
  }
  get cor(): string {
    return this.props.cor;
  }
  get x(): number {
    return this.props.x;
  }
  get y(): number {
    return this.props.y;
  }
  get personagemId(): string | null {
    return this.props.personagemId;
  }
  get imagemUrl(): string | null {
    return this.props.imagemUrl;
  }
  get imagemCaminho(): string | null {
    return this.props.imagemCaminho;
  }

  /**
   * Edição parcial (RV-040): campo ausente mantém o valor atual, e a validação
   * roda antes de qualquer atribuição — entrada inválida não deixa o token com
   * metade da alteração aplicada.
   */
  atualizar(dados: Partial<DadosEditaveisToken>): Result<void> {
    const validados = Token.validarDadosEditaveis({
      nome: dados.nome ?? this.props.nome,
      cor: dados.cor ?? this.props.cor,
    });
    if (!validados.ok) return falha(validados.erro);

    this.props.nome = validados.valor.nome;
    this.props.cor = validados.valor.cor;
    return ok(undefined);
  }

  renomear(nome: string): Result<void> {
    return this.atualizar({ nome });
  }

  recolorir(cor: string): Result<void> {
    return this.atualizar({ cor });
  }

  /**
   * Troca a arte do token e devolve o caminho do arquivo anterior, para que o
   * caso de uso apague o que ficou órfão no armazenamento (RV-041).
   */
  definirImagem(url: string, caminho: string): string | null {
    const anterior = this.props.imagemCaminho;
    this.props.imagemUrl = url;
    this.props.imagemCaminho = caminho;
    return anterior;
  }

  mover(x: number, y: number, cena: Cena): Result<void> {
    if (cena.id !== this.props.cenaId) {
      return falha(ErroDominio.validacao('Token não pertence a esta cena.'));
    }
    if (!cena.contemPosicao(x, y)) {
      return falha(ErroDominio.validacao('Posição fora dos limites da cena.'));
    }
    this.props.x = x;
    this.props.y = y;
    return ok(undefined);
  }
}
