import type { Atributos, PersonagemDTO } from '@rolavinte/shared';
import type { PersonagemRepository, UsuarioRepository } from '../../aplicacao/ports/repositorios';
import { Personagem } from '../../dominio/personagens/personagem';

interface RegistroPersonagem {
  id: string;
  mesaId: string;
  donoId: string;
  nome: string;
  classe: string;
  nivel: number;
  pvAtual: number;
  pvMax: number;
  atributos: Atributos;
  anotacoes: string;
}

/** Fake em memória de `PersonagemRepository` (read model com nome do dono, como no Supabase). */
export class FakePersonagemRepository implements PersonagemRepository {
  private readonly registros = new Map<string, RegistroPersonagem>();

  constructor(private readonly usuarios: UsuarioRepository) {}

  async salvar(personagem: Personagem): Promise<void> {
    this.registros.set(personagem.id, {
      id: personagem.id,
      mesaId: personagem.mesaId,
      donoId: personagem.donoId,
      nome: personagem.nome,
      classe: personagem.classe,
      nivel: personagem.nivel,
      pvAtual: personagem.pvAtual,
      pvMax: personagem.pvMax,
      atributos: { ...personagem.atributos },
      anotacoes: personagem.anotacoes,
    });
  }

  async buscarPorId(id: string): Promise<Personagem | null> {
    const registro = this.registros.get(id);
    return registro
      ? Personagem.reconstituir({ ...registro, atributos: { ...registro.atributos } })
      : null;
  }

  async listarDaMesa(mesaId: string): Promise<PersonagemDTO[]> {
    const daMesa = [...this.registros.values()].filter((p) => p.mesaId === mesaId);
    const dtos = await Promise.all(
      daMesa.map(async (p): Promise<PersonagemDTO> => {
        const dono = await this.usuarios.buscarPorId(p.donoId);
        return {
          id: p.id,
          mesaId: p.mesaId,
          donoId: p.donoId,
          donoNome: dono?.nome ?? 'Jogador',
          nome: p.nome,
          classe: p.classe,
          nivel: p.nivel,
          pvAtual: p.pvAtual,
          pvMax: p.pvMax,
          atributos: { ...p.atributos },
          anotacoes: p.anotacoes,
        };
      }),
    );
    return dtos.sort((a, b) => a.nome.localeCompare(b.nome));
  }
}
