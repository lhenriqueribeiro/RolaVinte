import type { CenaRepository } from '../../aplicacao/ports/repositorios';
import { Cena } from '../../dominio/jogo/cena';
import { Token } from '../../dominio/jogo/token';

interface RegistroCena {
  id: string;
  mesaId: string;
  nome: string;
  larguraGrid: number;
  alturaGrid: number;
  corFundo: string;
  ativa: boolean;
  imagemFundoUrl: string | null;
  imagemFundoCaminho: string | null;
  tamanhoCelula: number;
  gridVisivel: boolean;
  corGrid: string;
}

interface RegistroToken {
  id: string;
  cenaId: string;
  nome: string;
  cor: string;
  x: number;
  y: number;
  personagemId: string | null;
  imagemUrl: string | null;
  imagemCaminho: string | null;
}

/** Fake em memória de `CenaRepository` — cenas e tokens da cena. */
export class FakeCenaRepository implements CenaRepository {
  private readonly cenas = new Map<string, RegistroCena>();
  private readonly tokens = new Map<string, RegistroToken>();
  /**
   * Espião do RV-036: a guarda de redução de grid só pode consultar os tokens
   * quando algum lado do grid diminui — um ajuste de cor não paga uma query.
   */
  chamadasListarTokensDaCena = 0;

  async salvar(cena: Cena): Promise<void> {
    this.cenas.set(cena.id, {
      id: cena.id,
      mesaId: cena.mesaId,
      nome: cena.nome,
      larguraGrid: cena.larguraGrid,
      alturaGrid: cena.alturaGrid,
      corFundo: cena.corFundo,
      ativa: cena.ativa,
      imagemFundoUrl: cena.imagemFundoUrl,
      imagemFundoCaminho: cena.imagemFundoCaminho,
      tamanhoCelula: cena.tamanhoCelula,
      gridVisivel: cena.gridVisivel,
      corGrid: cena.corGrid,
    });
  }

  async buscarPorId(id: string): Promise<Cena | null> {
    const registro = this.cenas.get(id);
    return registro ? Cena.reconstituir({ ...registro }) : null;
  }

  async buscarAtivaDaMesa(mesaId: string): Promise<Cena | null> {
    for (const registro of this.cenas.values()) {
      if (registro.mesaId === mesaId && registro.ativa) return Cena.reconstituir({ ...registro });
    }
    return null;
  }

  async listarDaMesa(mesaId: string): Promise<Cena[]> {
    return [...this.cenas.values()]
      .filter((c) => c.mesaId === mesaId)
      .map((c) => Cena.reconstituir({ ...c }));
  }

  async desativarTodasDaMesa(mesaId: string): Promise<void> {
    for (const registro of this.cenas.values()) {
      if (registro.mesaId === mesaId) registro.ativa = false;
    }
  }

  /**
   * Apaga a cena **e os tokens dela**. A cascata é do banco
   * (`tokens.cena_id ... on delete cascade`); sem replicá-la aqui o fake diria
   * que os tokens sobrevivem e esconderia a divergência com a produção.
   */
  async remover(cenaId: string): Promise<void> {
    this.cenas.delete(cenaId);
    for (const token of [...this.tokens.values()]) {
      if (token.cenaId === cenaId) this.tokens.delete(token.id);
    }
  }

  async salvarToken(token: Token): Promise<void> {
    this.tokens.set(token.id, {
      id: token.id,
      cenaId: token.cenaId,
      nome: token.nome,
      cor: token.cor,
      x: token.x,
      y: token.y,
      personagemId: token.personagemId,
      imagemUrl: token.imagemUrl,
      imagemCaminho: token.imagemCaminho,
    });
  }

  async buscarTokenPorId(id: string): Promise<Token | null> {
    const registro = this.tokens.get(id);
    return registro ? Token.reconstituir({ ...registro }) : null;
  }

  async removerToken(id: string): Promise<void> {
    this.tokens.delete(id);
  }

  async listarTokensDaCena(cenaId: string): Promise<Token[]> {
    this.chamadasListarTokensDaCena += 1;
    return [...this.tokens.values()]
      .filter((t) => t.cenaId === cenaId)
      .map((t) => Token.reconstituir({ ...t }));
  }
}
