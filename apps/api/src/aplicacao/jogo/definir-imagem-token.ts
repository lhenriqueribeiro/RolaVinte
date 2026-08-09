import {
  MENSAGEM_TAMANHO_IMAGEM_TOKEN,
  MENSAGEM_TIPO_IMAGEM_TOKEN,
  TAMANHO_MAXIMO_IMAGEM_TOKEN_BYTES,
  TIPOS_IMAGEM_TOKEN,
  type TipoImagemToken,
  type TokenDTO,
} from '@rolavinte/shared';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import { tokenParaDTO } from '../mapeadores';
import type { CenaRepository, MesaRepository } from '../ports/repositorios';
import type {
  ArmazenamentoArquivos,
  GeradorId,
  PublicadorEventosMesa,
} from '../ports/infraestrutura';
import { carregarTokenParaEscritaDoMestre } from './acesso-token';

/** Arquivo já lido da requisição — a borda HTTP não decide nada sobre ele. */
export interface ImagemDeToken {
  tipo: string;
  conteudo: Uint8Array;
}

export const APENAS_MESTRE_DEFINE_ARTE_TOKEN = 'Apenas o mestre define a arte do token.';

/** A extensão vem do tipo validado, nunca do nome enviado pelo cliente. */
const EXTENSAO_POR_TIPO: Record<TipoImagemToken, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** Uma pasta por token dentro do bucket, para a limpeza ficar óbvia. */
function caminhoDaArte(tokenId: string, nomeArquivo: string): string {
  return `tokens/${tokenId}/${nomeArquivo}`;
}

function tipoAceito(tipo: string): TipoImagemToken | null {
  const normalizado = tipo.trim().toLowerCase();
  return TIPOS_IMAGEM_TOKEN.find((aceito) => aceito === normalizado) ?? null;
}

/**
 * Sobe a arte do token (RV-041).
 *
 * Mesma forma de `DefinirImagemFundoCena` — e de propósito: o arquivo atravessa
 * a API, o caminho é gerado pela aplicação a partir do tipo validado (nome de
 * arquivo do cliente é vetor de path traversal) e o armazenamento é a mesma
 * port, só que apontada para outro bucket pelo composition root.
 *
 * O token continua válido sem arte: a URL é opcional no DTO e o fallback de cor
 * + iniciais é o padrão, então uma imagem que suma do armazenamento degrada o
 * desenho da peça, não o mapa.
 */
export class DefinirImagemToken {
  constructor(
    private readonly cenas: CenaRepository,
    private readonly mesas: MesaRepository,
    private readonly armazenamento: ArmazenamentoArquivos,
    private readonly geradorId: GeradorId,
    private readonly publicador: PublicadorEventosMesa,
  ) {}

  async executar(
    usuarioId: string,
    tokenId: string,
    imagem: ImagemDeToken,
  ): Promise<Result<TokenDTO>> {
    const acesso = await carregarTokenParaEscritaDoMestre(
      this.cenas,
      this.mesas,
      usuarioId,
      tokenId,
      APENAS_MESTRE_DEFINE_ARTE_TOKEN,
    );
    if (!acesso.ok) return falha(acesso.erro);
    const { token, mesa } = acesso.valor;

    const tipo = tipoAceito(imagem.tipo);
    if (!tipo) return falha(ErroDominio.validacao(MENSAGEM_TIPO_IMAGEM_TOKEN));
    if (imagem.conteudo.byteLength === 0) {
      return falha(ErroDominio.validacao('A imagem enviada está vazia.'));
    }
    if (imagem.conteudo.byteLength > TAMANHO_MAXIMO_IMAGEM_TOKEN_BYTES) {
      return falha(ErroDominio.validacao(MENSAGEM_TAMANHO_IMAGEM_TOKEN));
    }

    const caminho = caminhoDaArte(token.id, `${this.geradorId.gerar()}.${EXTENSAO_POR_TIPO[tipo]}`);
    const url = await this.armazenamento.salvar(caminho, imagem.conteudo, tipo);

    // Gravar antes de apagar: se o upload falhasse, a arte antiga continua de pé.
    const caminhoAnterior = token.definirImagem(url, caminho);
    await this.cenas.salvarToken(token);

    if (caminhoAnterior && caminhoAnterior !== caminho) {
      try {
        await this.armazenamento.remover(caminhoAnterior);
      } catch {
        // Arquivo órfão no armazenamento não invalida a arte já trocada.
      }
    }

    const dto = tokenParaDTO(token);
    this.publicador.tokenAtualizado(mesa.id, dto);
    return ok(dto);
  }
}
