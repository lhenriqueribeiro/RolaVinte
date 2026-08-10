import {
  ehCondicaoConhecida,
  MENSAGEM_CONDICAO_DESCONHECIDA,
  normalizarCondicoes,
  type CondicaoToken,
} from '@rolavinte/shared';
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
  /**
   * Condições ativas (RV-064) — sempre normalizadas: sem repetição e na ordem
   * do catálogo. Só `aplicarCondicao`/`removerCondicao` escrevem aqui.
   */
  condicoes: CondicaoToken[];
}

/** Estado do token vindo do banco, onde as condições ainda são texto cru. */
export interface DadosReconstituicaoToken extends Omit<PropsToken, 'condicoes'> {
  id: string;
  condicoes: readonly string[];
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
        // A peça nasce limpa: condição é sempre marcada por alguém (RV-064).
        condicoes: [],
      }),
    );
  }

  /**
   * Hidrata o token do banco.
   *
   * `condicoes` chega como `text[]` cru e passa por `normalizarCondicoes`: uma
   * chave que saiu do catálogo (ou que alguém escreveu direto no Postgres) é
   * **descartada** em vez de virar um marcador que a tela não sabe desenhar.
   * Não é revalidar invariante histórica — é traduzir texto para o vocabulário
   * que existe hoje, que é o trabalho desta fábrica.
   */
  static reconstituir(dados: DadosReconstituicaoToken): Token {
    const { id, condicoes, ...props } = dados;
    return new Token(id, { ...props, condicoes: normalizarCondicoes(condicoes) });
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
  /** Condições ativas, sem repetição e na ordem do catálogo (RV-064). */
  get condicoes(): readonly CondicaoToken[] {
    return this.props.condicoes;
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

  /**
   * Marca uma condição (RV-064). **Idempotente**: aplicar "caído" duas vezes
   * deixa uma — o conjunto é normalizado a cada escrita, então não existe estado
   * em que a mesma chave apareça duas vezes.
   *
   * A chave entra como `string` de propósito. O `condicaoSchema` já recusa
   * desconhecida na borda HTTP, mas a proteção não pode morar só na forma de
   * quem chama (F4): quem forjar a requisição, ou um caso de uso futuro que
   * monte a chave em código, encontra a mesma recusa aqui.
   */
  aplicarCondicao(chave: string): Result<void> {
    if (!ehCondicaoConhecida(chave)) {
      return falha(ErroDominio.validacao(MENSAGEM_CONDICAO_DESCONHECIDA));
    }
    this.props.condicoes = normalizarCondicoes([...this.props.condicoes, chave]);
    return ok(undefined);
  }

  /**
   * Desmarca uma condição. Remover o que não está marcado é sucesso sem efeito:
   * dois clientes desmarcando "caído" ao mesmo tempo não podem produzir erro
   * para o segundo, que pediu exatamente o estado que já vale.
   */
  removerCondicao(chave: string): Result<void> {
    if (!ehCondicaoConhecida(chave)) {
      return falha(ErroDominio.validacao(MENSAGEM_CONDICAO_DESCONHECIDA));
    }
    this.props.condicoes = this.props.condicoes.filter((atual) => atual !== chave);
    return ok(undefined);
  }

  /** Está marcada? Consulta — não autoriza nada. */
  temCondicao(chave: string): boolean {
    return ehCondicaoConhecida(chave) && this.props.condicoes.includes(chave);
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
