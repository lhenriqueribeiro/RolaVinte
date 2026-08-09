import {
  MENSAGEM_TAMANHO_IMAGEM_FUNDO,
  MENSAGEM_TIPO_IMAGEM_FUNDO,
  TAMANHO_MAXIMO_IMAGEM_FUNDO_BYTES,
  TIPOS_IMAGEM_FUNDO,
  type CenaDTO,
  type TipoImagemFundo,
} from '@rolavinte/shared';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import { cenaParaDTO } from '../mapeadores';
import type { CenaRepository, MesaRepository } from '../ports/repositorios';
import type {
  ArmazenamentoArquivos,
  GeradorId,
  PublicadorEventosMesa,
} from '../ports/infraestrutura';
import { carregarCenaParaEscritaDoMestre } from './acesso-cena';

/** Arquivo já lido da requisição — a borda HTTP não decide nada sobre ele. */
export interface ImagemDeFundo {
  tipo: string;
  conteudo: Uint8Array;
}

/** A extensão vem do tipo validado, nunca do nome enviado pelo cliente. */
const EXTENSAO_POR_TIPO: Record<TipoImagemFundo, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** Pasta do mapa dentro do bucket; um diretório por cena facilita a limpeza. */
function caminhoDoMapa(cenaId: string, nomeArquivo: string): string {
  return `cenas/${cenaId}/${nomeArquivo}`;
}

function tipoAceito(tipo: string): TipoImagemFundo | null {
  const normalizado = tipo.trim().toLowerCase();
  return TIPOS_IMAGEM_FUNDO.find((aceito) => aceito === normalizado) ?? null;
}

/**
 * Sobe a imagem do mapa como fundo da cena (RV-032).
 *
 * O arquivo atravessa a API: o front nunca fala com o armazenamento
 * (`.claude/rules/07-supabase.md`). Aqui ficam as três decisões que não podem
 * morar na rota — tipo aceito, tamanho máximo e **o nome do arquivo**, gerado
 * pela aplicação a partir do tipo validado.
 */
export class DefinirImagemFundoCena {
  constructor(
    private readonly cenas: CenaRepository,
    private readonly mesas: MesaRepository,
    private readonly armazenamento: ArmazenamentoArquivos,
    private readonly geradorId: GeradorId,
    private readonly publicador: PublicadorEventosMesa,
  ) {}

  async executar(
    usuarioId: string,
    cenaId: string,
    imagem: ImagemDeFundo,
  ): Promise<Result<CenaDTO>> {
    const acesso = await carregarCenaParaEscritaDoMestre(
      this.cenas,
      this.mesas,
      usuarioId,
      cenaId,
      'Apenas o mestre define o fundo da cena.',
    );
    if (!acesso.ok) return falha(acesso.erro);
    const { cena, mesa } = acesso.valor;

    const tipo = tipoAceito(imagem.tipo);
    if (!tipo) return falha(ErroDominio.validacao(MENSAGEM_TIPO_IMAGEM_FUNDO));
    if (imagem.conteudo.byteLength === 0) {
      return falha(ErroDominio.validacao('A imagem enviada está vazia.'));
    }
    if (imagem.conteudo.byteLength > TAMANHO_MAXIMO_IMAGEM_FUNDO_BYTES) {
      return falha(ErroDominio.validacao(MENSAGEM_TAMANHO_IMAGEM_FUNDO));
    }

    const caminho = caminhoDoMapa(cena.id, `${this.geradorId.gerar()}.${EXTENSAO_POR_TIPO[tipo]}`);
    const url = await this.armazenamento.salvar(caminho, imagem.conteudo, tipo);

    // Gravar antes de apagar: se o upload falhasse, o mapa antigo continua de pé.
    const caminhoAnterior = cena.definirImagemFundo(url, caminho);
    await this.cenas.salvar(cena);

    if (caminhoAnterior && caminhoAnterior !== caminho) {
      try {
        await this.armazenamento.remover(caminhoAnterior);
      } catch {
        // Arquivo órfão no armazenamento não invalida o fundo já trocado.
      }
    }

    const dto = cenaParaDTO(cena);
    // Reaproveita `cena:ativada` — é o evento que carrega a cena inteira, e o
    // mapa precisa aparecer para todos sem recarregar a página.
    if (cena.ativa) this.publicador.cenaAtivada(mesa.id, dto);
    return ok(dto);
  }
}
