import { comandoEhAviso, interpretarComando, type MensagemDTO } from '@rolavinte/shared';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, type Result } from '../../dominio/compartilhado/resultado';
import type { RegistroComandosChat } from './comandos-chat';

/**
 * Caso de uso único de "alguém digitou uma linha no chat" (RV-074).
 *
 * O servidor reinterpreta o texto cru com o mesmo parser do front. Não existe
 * campo "tipo" vindo do cliente de propósito: `/oculto` é privilégio do mestre,
 * e um cliente que pudesse declarar o tipo estaria escolhendo o caminho de
 * autorização. Aqui ele escolhe só as letras que digitou.
 *
 * O despacho é uma consulta ao registry. Acrescentar um comando não muda uma
 * linha deste arquivo.
 */
export class ProcessarComandoChat {
  constructor(private readonly registro: RegistroComandosChat) {}

  async executar(usuarioId: string, mesaId: string, texto: string): Promise<Result<MensagemDTO>> {
    const comando = interpretarComando(texto);
    if (comandoEhAviso(comando)) return falha(ErroDominio.validacao(comando.aviso));

    const manipulador = this.registro.buscar(comando.tipo);
    if (!manipulador) {
      // Inalcançável enquanto o Record de manipuladores for total; fica como
      // Result em vez de exceção para nunca derrubar a requisição por isso.
      return falha(ErroDominio.validacao('Este comando ainda não está disponível nesta mesa.'));
    }
    return manipulador({ usuarioId, mesaId }, comando);
  }
}
