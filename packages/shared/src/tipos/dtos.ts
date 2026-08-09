import type { ResultadoRolagem } from '../dados/motor-dados';
import type { Atributos } from '../schemas/personagens';
import type { SistemaRpg } from '../schemas/mesas';

export interface UsuarioDTO {
  id: string;
  nome: string;
  email: string;
}

export interface SessaoDTO {
  token: string;
  usuario: UsuarioDTO;
}

export type PapelNaMesa = 'mestre' | 'jogador';

export interface MesaDTO {
  id: string;
  nome: string;
  descricao: string;
  sistema: SistemaRpg;
  mestreId: string;
  mestreNome: string;
  meuPapel: PapelNaMesa;
  totalJogadores: number;
  criadoEm: string;
  /** ISO da data de encerramento; `null` enquanto a mesa está ativa (RV-023). */
  encerradaEm: string | null;
}

export interface JogadorDaMesaDTO {
  usuarioId: string;
  nome: string;
  papel: PapelNaMesa;
}

/** Resposta de `GET /mesas/:mesaId` — a mesa com a lista de participantes junto. */
export interface MesaDetalheDTO extends MesaDTO {
  jogadores: JogadorDaMesaDTO[];
}

/** Convite revogado guarda status próprio — nunca é apagado (RV-020). */
export type StatusConvite = 'pendente' | 'aceito' | 'revogado';

export interface ConviteDTO {
  id: string;
  email: string;
  status: StatusConvite;
  criadoEm: string;
}

export interface ConvitePublicoDTO {
  mesaNome: string;
  mestreNome: string;
  email: string;
}

export interface PersonagemDTO {
  id: string;
  mesaId: string;
  donoId: string;
  donoNome: string;
  nome: string;
  classe: string;
  nivel: number;
  pvAtual: number;
  pvMax: number;
  atributos: Atributos;
  anotacoes: string;
}

export interface CenaDTO {
  id: string;
  mesaId: string;
  nome: string;
  larguraGrid: number;
  alturaGrid: number;
  corFundo: string;
  ativa: boolean;
  /** URL pública do mapa; `null` enquanto a cena não tem imagem de fundo (RV-032). */
  imagemFundoUrl: string | null;
  /** Lado da célula do grid em pixels, entre 20 e 200 (RV-033). */
  tamanhoCelula: number;
  gridVisivel: boolean;
  corGrid: string;
}

export interface TokenDTO {
  id: string;
  cenaId: string;
  nome: string;
  cor: string;
  x: number;
  y: number;
  personagemId: string | null;
  /**
   * URL pública da arte do token; `null` quando não há arte (RV-041). O
   * fallback — círculo com `cor` e as iniciais de `nome` — continua sendo o
   * padrão, e é também o que a UI mostra se a imagem falhar ao carregar.
   *
   * A barra de vida (RV-042) **não** aparece aqui de propósito: o PV vive no
   * `PersonagemDTO` e só lá. O cliente cruza `personagemId` com a lista de
   * personagens que já carrega; duplicar o PV no token criaria duas fontes de
   * verdade que divergem no primeiro dano.
   */
  imagemUrl: string | null;
}

/** Resposta de `GET /mesas/:mesaId/cena` — a cena ativa (ou `null`) com seus tokens. */
export interface CenaComTokensDTO {
  cena: CenaDTO | null;
  tokens: TokenDTO[];
}

export type TipoMensagem = 'fala' | 'rolagem' | 'sistema';

export interface MensagemDTO {
  id: string;
  mesaId: string;
  autorId: string | null;
  autorNome: string;
  tipo: TipoMensagem;
  conteudo: string;
  rolagem: ResultadoRolagem | null;
  motivo: string | null;
  criadoEm: string;
}
