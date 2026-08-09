import type { JogadorDaMesaDTO, MesaDTO, SistemaRpg } from '@rolavinte/shared';
import type { MesaRepository, UsuarioRepository } from '../../aplicacao/ports/repositorios';
import { Mesa, type Convite, type Participante } from '../../dominio/mesas/mesa';

interface RegistroMesa {
  id: string;
  nome: string;
  descricao: string;
  sistema: SistemaRpg;
  mestreId: string;
  participantes: Participante[];
  convites: Convite[];
  criadoEm: Date;
  encerradaEm: Date | null;
}

/**
 * Fake em memória de `MesaRepository`.
 *
 * Depende de `UsuarioRepository` para os read models (nome do mestre e dos
 * jogadores), exatamente como o adapter Supabase, que resolve esses nomes na
 * tabela `usuarios`.
 */
export class FakeMesaRepository implements MesaRepository {
  private readonly registros = new Map<string, RegistroMesa>();

  constructor(private readonly usuarios: UsuarioRepository) {}

  async salvar(mesa: Mesa): Promise<void> {
    this.registros.set(mesa.id, {
      id: mesa.id,
      nome: mesa.nome,
      descricao: mesa.descricao,
      sistema: mesa.sistema,
      mestreId: mesa.mestreId,
      participantes: mesa.participantes.map(copiarParticipante),
      convites: mesa.convites.map(copiarConvite),
      criadoEm: new Date(mesa.criadoEm),
      encerradaEm: mesa.encerradaEm ? new Date(mesa.encerradaEm) : null,
    });
  }

  async buscarPorId(id: string): Promise<Mesa | null> {
    const registro = this.registros.get(id);
    return registro ? this.hidratar(registro) : null;
  }

  async buscarPorTokenConvite(token: string): Promise<Mesa | null> {
    for (const registro of this.registros.values()) {
      if (registro.convites.some((c) => c.token === token)) return this.hidratar(registro);
    }
    return null;
  }

  async listarDoUsuario(usuarioId: string): Promise<MesaDTO[]> {
    const minhas = [...this.registros.values()].filter((m) =>
      m.participantes.some((p) => p.usuarioId === usuarioId),
    );
    const dtos = await Promise.all(
      minhas.map(async (m): Promise<MesaDTO> => {
        const mestre = await this.usuarios.buscarPorId(m.mestreId);
        const participante = m.participantes.find((p) => p.usuarioId === usuarioId);
        return {
          id: m.id,
          nome: m.nome,
          descricao: m.descricao,
          sistema: m.sistema,
          mestreId: m.mestreId,
          mestreNome: mestre?.nome ?? 'Mestre',
          meuPapel: participante?.papel ?? 'jogador',
          totalJogadores: m.participantes.length,
          criadoEm: m.criadoEm.toISOString(),
          encerradaEm: m.encerradaEm?.toISOString() ?? null,
        };
      }),
    );
    return dtos.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  }

  async listarJogadores(mesaId: string): Promise<JogadorDaMesaDTO[]> {
    const registro = this.registros.get(mesaId);
    if (!registro) return [];
    return Promise.all(
      registro.participantes.map(async (p): Promise<JogadorDaMesaDTO> => {
        const usuario = await this.usuarios.buscarPorId(p.usuarioId);
        return { usuarioId: p.usuarioId, nome: usuario?.nome ?? 'Jogador', papel: p.papel };
      }),
    );
  }

  private hidratar(registro: RegistroMesa): Mesa {
    return Mesa.reconstituir({
      id: registro.id,
      nome: registro.nome,
      descricao: registro.descricao,
      sistema: registro.sistema,
      mestreId: registro.mestreId,
      participantes: registro.participantes.map(copiarParticipante),
      convites: registro.convites.map(copiarConvite),
      criadoEm: new Date(registro.criadoEm),
      encerradaEm: registro.encerradaEm ? new Date(registro.encerradaEm) : null,
    });
  }
}

function copiarParticipante(participante: Participante): Participante {
  return { ...participante, entrouEm: new Date(participante.entrouEm) };
}

function copiarConvite(convite: Convite): Convite {
  return { ...convite, criadoEm: new Date(convite.criadoEm) };
}
