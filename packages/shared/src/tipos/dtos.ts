import type { AvaliacaoRolagem } from '../chat/avaliacao';
import type { ResultadoRolagem } from '../dados/motor-dados';
import type { Atributos } from '../schemas/personagens';
import type { SistemaRpg } from '../schemas/mesas';
import type { DadosFicha } from '../sistemas/tipos';

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
  /**
   * Os seis atributos, **na escala do sistema** (RV-098) — e o único lugar onde
   * eles existem.
   *
   * O número aqui só ganha sentido junto de `sistema`: 16 numa ficha de D&D 5e é
   * o valor que vale +3; 4 numa ficha de PF2e já é o +4. Quem for somar um bônus
   * passa por `definicaoDoSistema(sistema).atributos.modificador(...)` em vez de
   * supor a fórmula do d20.
   */
  atributos: Atributos;
  anotacoes: string;
  /**
   * Sistema da mesa a que a ficha pertence (RV-091), copiado no read model.
   *
   * Vem junto para que a ficha seja **autossuficiente**: quem a renderiza pede
   * `definicaoDoSistema(personagem.sistema)` e pronto, sem depender de um
   * segundo cache (`['mesa', id]`) que pode estar carregando ou desatualizado.
   * A fonte da verdade continua sendo `Mesa.sistema` — este campo é derivado
   * dela na leitura, nunca gravado na tabela `personagens`.
   */
  sistema: SistemaRpg;
  /**
   * A metade da ficha que pertence ao sistema, já validada pelo `schemaFicha`
   * dele. `{}` nos sistemas que não definem campo nenhum.
   */
  dados: DadosFicha;
}

/**
 * O que o repositório de personagens sabe devolver: tudo menos o `sistema`.
 *
 * A tabela `personagens` não guarda o sistema — ele é da `Mesa`. O caso de uso,
 * que já carregou a mesa para autorizar, completa o DTO. Assim não há coluna
 * denormalizada para divergir quando o mestre troca o sistema da mesa.
 */
export type PersonagemDaMesaDTO = Omit<PersonagemDTO, 'sistema'>;

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

/**
 * `sussurro` e `rolagem-oculta` são **restritos**: quem pode vê-los está em
 * `chat/visibilidade.ts`, num `Record` que recusa tipo novo sem decisão.
 */
export type TipoMensagem = 'fala' | 'rolagem' | 'sistema' | 'sussurro' | 'rolagem-oculta';

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
  /**
   * Destinatário do sussurro (RV-070); `null` em qualquer outro tipo. O nome vem
   * denormalizado junto, como `autorNome`, para o rótulo "sussurro para <nome>"
   * não depender de uma segunda consulta no cliente.
   *
   * Este DTO só chega a quem pode vê-lo: o filtro é do servidor, não da UI.
   */
  destinatarioId: string | null;
  destinatarioNome: string | null;
  /**
   * Grau de sucesso da rolagem contra a CD informada (RV-154); `null` quando não
   * houve CD — que é a maioria absoluta das mensagens.
   *
   * **É campo próprio, e não um pedaço de `rolagem`.** `ResultadoRolagem` é o
   * espelho exato do que o motor de dados produz, e o motor é agnóstico de
   * sistema: ele não sabe o que é uma CD e não vai passar a saber. A avaliação
   * mora ao lado, na coluna `mensagens.avaliacao` (migration `0010`).
   *
   * Quem lê precisa tolerar a **ausência** do campo, e não só o `null`: mensagem
   * gravada antes deste card e payload em cache de uma versão anterior chegam sem
   * ele. O chat trata os dois como "sem CD informada".
   */
  avaliacao: AvaliacaoRolagem | null;
}
