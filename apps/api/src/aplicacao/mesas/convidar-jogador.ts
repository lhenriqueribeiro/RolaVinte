import type { ConviteDTO } from '@rolavinte/shared';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type { MesaRepository, UsuarioRepository } from '../ports/repositorios';
import type { EventBus, GeradorId, Relogio } from '../ports/infraestrutura';

export class ConvidarJogador {
  constructor(
    private readonly mesas: MesaRepository,
    private readonly usuarios: UsuarioRepository,
    private readonly geradorId: GeradorId,
    private readonly relogio: Relogio,
    private readonly eventBus: EventBus,
  ) {}

  async executar(
    usuarioId: string,
    mesaId: string,
    emailConvidado: string,
  ): Promise<Result<ConviteDTO>> {
    const mesa = await this.mesas.buscarPorId(mesaId);
    if (!mesa) return falha(ErroDominio.naoEncontrado('Mesa não encontrada.'));

    const solicitante = await this.usuarios.buscarPorId(usuarioId);
    if (!solicitante) return falha(ErroDominio.naoEncontrado('Usuário não encontrado.'));

    // Token de convite: uso único, imprevisível (2 UUIDs concatenados).
    const tokenConvite = `${this.geradorId.gerar()}${this.geradorId.gerar()}`.replaceAll('-', '');
    const convite = mesa.convidar({
      solicitanteId: usuarioId,
      nomeSolicitante: solicitante.nome,
      emailConvidado,
      conviteId: this.geradorId.gerar(),
      tokenConvite,
      agora: this.relogio.agora(),
    });
    if (!convite.ok) return falha(convite.erro);

    await this.mesas.salvar(mesa);
    this.eventBus.publicar(mesa.puxarEventos());

    return ok({
      id: convite.valor.id,
      email: convite.valor.email,
      status: convite.valor.status,
      criadoEm: convite.valor.criadoEm.toISOString(),
    });
  }
}
