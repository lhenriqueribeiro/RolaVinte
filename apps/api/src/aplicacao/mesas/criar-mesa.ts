import type { CriarMesaEntrada, MesaDTO } from '@rolavinte/shared';
import { Mesa } from '../../dominio/mesas/mesa';
import { ErroDominio } from '../../dominio/compartilhado/erro-dominio';
import { falha, ok, type Result } from '../../dominio/compartilhado/resultado';
import type { MesaRepository, UsuarioRepository } from '../ports/repositorios';
import type { GeradorId, Relogio } from '../ports/infraestrutura';
import { mesaParaDTO } from './mesa-dto';

export class CriarMesa {
  constructor(
    private readonly mesas: MesaRepository,
    private readonly usuarios: UsuarioRepository,
    private readonly geradorId: GeradorId,
    private readonly relogio: Relogio,
  ) {}

  async executar(usuarioId: string, entrada: CriarMesaEntrada): Promise<Result<MesaDTO>> {
    const mestre = await this.usuarios.buscarPorId(usuarioId);
    if (!mestre) return falha(ErroDominio.naoEncontrado('Usuário não encontrado.'));

    const mesa = Mesa.criar({
      id: this.geradorId.gerar(),
      nome: entrada.nome,
      descricao: entrada.descricao,
      sistema: entrada.sistema,
      mestreId: usuarioId,
      agora: this.relogio.agora(),
    });
    if (!mesa.ok) return falha(mesa.erro);

    await this.mesas.salvar(mesa.valor);
    return ok(mesaParaDTO(mesa.valor, { usuarioId, mestreNome: mestre.nome }));
  }
}
