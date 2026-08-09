import { Cena } from '../../dominio/jogo/cena';
import { Token } from '../../dominio/jogo/token';

export interface RowCena {
  id: string;
  mesa_id: string;
  nome: string;
  largura_grid: number;
  altura_grid: number;
  cor_fundo: string;
  ativa: boolean;
  imagem_fundo_url: string | null;
  imagem_fundo_caminho: string | null;
  tamanho_celula: number;
  grid_visivel: boolean;
  cor_grid: string;
}

export interface RowToken {
  id: string;
  cena_id: string;
  nome: string;
  cor: string;
  x: number;
  y: number;
  personagem_id: string | null;
  imagem_url: string | null;
  imagem_caminho: string | null;
}

export function rowParaCena(row: RowCena): Cena {
  return Cena.reconstituir({
    id: row.id,
    mesaId: row.mesa_id,
    nome: row.nome,
    larguraGrid: row.largura_grid,
    alturaGrid: row.altura_grid,
    corFundo: row.cor_fundo,
    ativa: row.ativa,
    imagemFundoUrl: row.imagem_fundo_url,
    imagemFundoCaminho: row.imagem_fundo_caminho,
    tamanhoCelula: row.tamanho_celula,
    gridVisivel: row.grid_visivel,
    corGrid: row.cor_grid,
  });
}

export function cenaParaRow(cena: Cena): RowCena {
  return {
    id: cena.id,
    mesa_id: cena.mesaId,
    nome: cena.nome,
    largura_grid: cena.larguraGrid,
    altura_grid: cena.alturaGrid,
    cor_fundo: cena.corFundo,
    ativa: cena.ativa,
    imagem_fundo_url: cena.imagemFundoUrl,
    imagem_fundo_caminho: cena.imagemFundoCaminho,
    tamanho_celula: cena.tamanhoCelula,
    grid_visivel: cena.gridVisivel,
    cor_grid: cena.corGrid,
  };
}

export function rowParaToken(row: RowToken): Token {
  return Token.reconstituir({
    id: row.id,
    cenaId: row.cena_id,
    nome: row.nome,
    cor: row.cor,
    x: row.x,
    y: row.y,
    personagemId: row.personagem_id,
    imagemUrl: row.imagem_url,
    imagemCaminho: row.imagem_caminho,
  });
}

export function tokenParaRow(token: Token): RowToken {
  return {
    id: token.id,
    cena_id: token.cenaId,
    nome: token.nome,
    cor: token.cor,
    x: token.x,
    y: token.y,
    personagem_id: token.personagemId,
    imagem_url: token.imagemUrl,
    imagem_caminho: token.imagemCaminho,
  };
}
