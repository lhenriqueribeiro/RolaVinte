import type {
  CursorMensagens,
  JogadorDaMesaDTO,
  MensagemDTO,
  MesaDTO,
  PersonagemDaMesaDTO,
} from '@rolavinte/shared';
import type { Usuario } from '../../dominio/contas/usuario';
import type { Mesa } from '../../dominio/mesas/mesa';
import type { Personagem } from '../../dominio/personagens/personagem';
import type { Cena } from '../../dominio/jogo/cena';
import type { Token } from '../../dominio/jogo/token';
import type { Mensagem } from '../../dominio/jogo/mensagem';
import type { Combate } from '../../dominio/jogo/combate';

export interface UsuarioRepository {
  salvar(usuario: Usuario): Promise<void>;
  buscarPorId(id: string): Promise<Usuario | null>;
  buscarPorEmail(email: string): Promise<Usuario | null>;
}

export interface MesaRepository {
  salvar(mesa: Mesa): Promise<void>;
  buscarPorId(id: string): Promise<Mesa | null>;
  buscarPorTokenConvite(token: string): Promise<Mesa | null>;
  /** Read model para o dashboard — inclui nome do mestre e contagem de jogadores. */
  listarDoUsuario(usuarioId: string): Promise<MesaDTO[]>;
  listarJogadores(mesaId: string): Promise<JogadorDaMesaDTO[]>;
}

export interface PersonagemRepository {
  salvar(personagem: Personagem): Promise<void>;
  buscarPorId(id: string): Promise<Personagem | null>;
  /**
   * Exclui a ficha (RV-093). Os tokens que a referenciavam permanecem na cena
   * com `personagem_id` nulo — é `on delete set null` no banco desde a 0001.
   */
  remover(id: string): Promise<void>;
  /**
   * Read model — inclui nome do dono, **sem** o sistema: ele é da `Mesa`, e
   * quem completa o `PersonagemDTO` é o caso de uso, que já carregou a mesa
   * para autorizar.
   */
  listarDaMesa(mesaId: string): Promise<PersonagemDaMesaDTO[]>;
}

export interface CenaRepository {
  salvar(cena: Cena): Promise<void>;
  buscarPorId(id: string): Promise<Cena | null>;
  buscarAtivaDaMesa(mesaId: string): Promise<Cena | null>;
  /** Todas as cenas da mesa, da mais antiga para a mais recente (RV-030). */
  listarDaMesa(mesaId: string): Promise<Cena[]>;
  desativarTodasDaMesa(mesaId: string): Promise<void>;
  /** Remove a cena e, em cascata, os tokens dela (RV-030). */
  remover(cenaId: string): Promise<void>;
  salvarToken(token: Token): Promise<void>;
  buscarTokenPorId(id: string): Promise<Token | null>;
  removerToken(id: string): Promise<void>;
  listarTokensDaCena(cenaId: string): Promise<Token[]>;
}

/**
 * Repositório do agregado `Combate` (RV-060).
 *
 * Sem `remover`: encerrar um combate é mudança de estado (`ativo = false`), não
 * exclusão — o histórico da luta fica, e é isso que permite "encerrei e comecei
 * outro" sem apagar nada. Como não há delete, também não há recurso externo para
 * ficar órfão (F7): o combate não possui arquivo em Storage.
 */
export interface CombateRepository {
  /**
   * Persiste o agregado **inteiro**, participantes incluídos.
   *
   * Upsert sozinho não basta, pela mesma razão de `MesaRepository.salvar`:
   * remover um participante só apaga a linha do agregado em memória, e sem o
   * `delete` de sincronização ele reapareceria na leitura seguinte (F3 da
   * taxonomia). Quem implementa esta port é responsável pelas duas metades.
   */
  salvar(combate: Combate): Promise<void>;
  buscarPorId(id: string): Promise<Combate | null>;
  /**
   * O combate ativo da mesa, ou `null`. É a consulta que sustenta a invariante
   * "um combate ativo por mesa" no caso de uso — a outra tranca é o índice único
   * parcial da migration `0012`.
   */
  buscarAtivoDaMesa(mesaId: string): Promise<Combate | null>;
}

/** Uma página do histórico do chat (RV-073). */
export interface PaginaHistorico {
  limite: number;
  /**
   * Cursor da mensagem mais antiga já carregada; `null` na primeira página.
   *
   * Cursor e não `offset` — e o desempate por `id` é parte do contrato, não
   * detalhe do adapter: um repositório que ordenasse só por `criadoEm` devolveria
   * a mesma mensagem em duas páginas assim que duas caíssem no mesmo instante.
   */
  antesDe: CursorMensagens | null;
}

export interface MensagemRepository {
  salvar(mensagem: Mensagem): Promise<void>;
  /**
   * Read model — mais recentes primeiro no banco, retornadas em ordem cronológica.
   *
   * `solicitanteId` **não** é conveniência: sussurro e rolagem oculta são
   * excluídos já na consulta (RV-070/RV-071). Filtrar depois de trazer, ou no
   * cliente, seria deixar o segredo sair do servidor — e o `limite` passaria a
   * contar mensagens que o solicitante nem pode ver.
   *
   * O mesmo vale para o cursor (RV-073): a janela é recortada **depois** do
   * filtro de visibilidade, então uma página nunca fica curta por causa do
   * segredo alheio nem deixa um buraco de onde um terceiro pudesse inferir que
   * existe mensagem privada ali.
   */
  listarDaMesa(
    mesaId: string,
    solicitanteId: string,
    pagina: PaginaHistorico,
  ): Promise<MensagemDTO[]>;
}
