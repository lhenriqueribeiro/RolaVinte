import type { ArmazenamentoArquivos } from '../../aplicacao/ports/infraestrutura';

export interface ArquivoArmazenado {
  caminho: string;
  tipo: string;
  bytes: number;
}

/**
 * Fake de `ArmazenamentoArquivos` — guarda os arquivos num `Map` e registra as
 * operações, para o teste provar que o mapa anterior foi de fato removido.
 */
export class FakeArmazenamentoArquivos implements ArmazenamentoArquivos {
  private readonly arquivos = new Map<string, ArquivoArmazenado>();
  private readonly removidos: string[] = [];
  /** Ligue para simular indisponibilidade do provedor. */
  falharAoSalvar = false;
  falharAoRemover = false;

  async salvar(caminho: string, conteudo: Uint8Array, tipo: string): Promise<string> {
    if (this.falharAoSalvar) throw new Error('[fake] storage indisponível');
    this.arquivos.set(caminho, { caminho, tipo, bytes: conteudo.byteLength });
    return `https://storage.teste.local/mapas/${caminho}`;
  }

  async remover(caminho: string): Promise<void> {
    if (this.falharAoRemover) throw new Error('[fake] storage indisponível');
    this.arquivos.delete(caminho);
    this.removidos.push(caminho);
  }

  get salvos(): readonly ArquivoArmazenado[] {
    return [...this.arquivos.values()];
  }

  get caminhosRemovidos(): readonly string[] {
    return this.removidos;
  }

  contem(caminho: string): boolean {
    return this.arquivos.has(caminho);
  }
}
