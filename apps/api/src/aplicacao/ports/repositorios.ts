import type { JogadorDaMesaDTO, MensagemDTO, MesaDTO, PersonagemDTO } from '@rolavinte/shared';
import type { Usuario } from '../../dominio/contas/usuario';
import type { Mesa } from '../../dominio/mesas/mesa';
import type { Personagem } from '../../dominio/personagens/personagem';
import type { Cena } from '../../dominio/jogo/cena';
import type { Token } from '../../dominio/jogo/token';
import type { Mensagem } from '../../dominio/jogo/mensagem';

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
  /** Read model — inclui nome do dono. */
  listarDaMesa(mesaId: string): Promise<PersonagemDTO[]>;
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

export interface MensagemRepository {
  salvar(mensagem: Mensagem): Promise<void>;
  /** Read model — mais recentes primeiro no banco, retornadas em ordem cronológica. */
  listarDaMesa(mesaId: string, limite: number): Promise<MensagemDTO[]>;
}
