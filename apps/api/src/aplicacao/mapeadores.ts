import type { CenaDTO, MensagemDTO, TokenDTO, UsuarioDTO } from '@rolavinte/shared';
import type { Usuario } from '../dominio/contas/usuario';
import type { Cena } from '../dominio/jogo/cena';
import type { Mensagem } from '../dominio/jogo/mensagem';
import type { Token } from '../dominio/jogo/token';

export function usuarioParaDTO(usuario: Usuario): UsuarioDTO {
  return { id: usuario.id, nome: usuario.nome, email: usuario.email.valor };
}

export function mensagemParaDTO(mensagem: Mensagem): MensagemDTO {
  return {
    id: mensagem.id,
    mesaId: mensagem.mesaId,
    autorId: mensagem.autorId,
    autorNome: mensagem.autorNome,
    tipo: mensagem.tipo,
    conteudo: mensagem.conteudo,
    rolagem: mensagem.rolagem,
    motivo: mensagem.motivo,
    criadoEm: mensagem.criadoEm.toISOString(),
    destinatarioId: mensagem.destinatarioId,
    destinatarioNome: mensagem.destinatarioNome,
  };
}

export function cenaParaDTO(cena: Cena): CenaDTO {
  return {
    id: cena.id,
    mesaId: cena.mesaId,
    nome: cena.nome,
    larguraGrid: cena.larguraGrid,
    alturaGrid: cena.alturaGrid,
    corFundo: cena.corFundo,
    ativa: cena.ativa,
    // O caminho no armazenamento não sai daqui: o cliente só precisa da URL.
    imagemFundoUrl: cena.imagemFundoUrl,
    tamanhoCelula: cena.tamanhoCelula,
    gridVisivel: cena.gridVisivel,
    corGrid: cena.corGrid,
  };
}

export function tokenParaDTO(token: Token): TokenDTO {
  return {
    id: token.id,
    cenaId: token.cenaId,
    nome: token.nome,
    cor: token.cor,
    x: token.x,
    y: token.y,
    personagemId: token.personagemId,
    // Como na cena: o caminho no armazenamento fica no agregado, só a URL sai.
    imagemUrl: token.imagemUrl,
  };
}
