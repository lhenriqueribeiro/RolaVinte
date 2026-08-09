import type { ArmazenamentoArquivos } from '../../aplicacao/ports/infraestrutura';
import { garantirSemErro, type ClienteSupabase } from '../supabase/cliente';

/**
 * Bucket dos mapas das cenas (RV-032).
 *
 * **Decisão consciente: bucket público.** A alternativa do card era bucket
 * privado com URL assinada, mas a URL fica persistida em `cenas.imagem_fundo_url`
 * e uma URL assinada expira — o mapa apareceria quebrado depois de algumas
 * horas, ou exigiria reassinar a cada leitura de cena. O conteúdo é um mapa de
 * RPG (não há dado pessoal), o caminho é imprevisível (UUID por arquivo) e a
 * escrita continua exclusiva do backend com service role.
 */
export const BUCKET_MAPAS = 'mapas';

/**
 * Bucket das artes de token (RV-041) — mesmo adapter, mesma decisão de bucket
 * público, separado dos mapas só para que a cota e a limpeza de um não afetem
 * o outro.
 */
export const BUCKET_TOKENS = 'tokens';

/** Adapter de `ArmazenamentoArquivos` sobre o Supabase Storage. */
export class SupabaseArmazenamentoArquivos implements ArmazenamentoArquivos {
  constructor(
    private readonly sb: ClienteSupabase,
    private readonly bucket: string = BUCKET_MAPAS,
  ) {}

  async salvar(caminho: string, conteudo: Uint8Array, tipo: string): Promise<string> {
    const { error } = await this.sb.storage.from(this.bucket).upload(caminho, conteudo, {
      contentType: tipo,
      // O caminho já é único por upload; `upsert` só protege contra retentativa.
      upsert: true,
    });
    garantirSemErro('salvar arquivo no storage', error);

    const { data } = this.sb.storage.from(this.bucket).getPublicUrl(caminho);
    return data.publicUrl;
  }

  async remover(caminho: string): Promise<void> {
    const { error } = await this.sb.storage.from(this.bucket).remove([caminho]);
    garantirSemErro('remover arquivo do storage', error);
  }
}
