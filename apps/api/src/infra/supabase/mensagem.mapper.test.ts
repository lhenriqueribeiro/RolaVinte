import { describe, expect, it } from 'vitest';
import type { AvaliacaoRolagem, ResultadoRolagem } from '@rolavinte/shared';
import { Mensagem } from '../../dominio/jogo/mensagem';
import { mensagemParaRow, rowParaMensagemDTO, type RowMensagem } from './mensagem.mapper';

/**
 * Ida e volta da avaliação pelo adapter Supabase (RV-154).
 *
 * **Por que o teste tem de estar aqui, e não num caso de uso.** O
 * `FakeMensagemRepository` guarda o DTO já mapeado: ele devolve exatamente o que
 * recebeu, então uma coluna esquecida no `mensagemParaRow` — ou uma chave lida
 * com o nome errado no `rowParaMensagemDTO` — passaria por toda a suíte de casos
 * de uso sem um piscar, e só apareceria em produção como um grau de sucesso que
 * desaparece quando alguém recarrega a página. É a F3 da taxonomia, e é o motivo
 * pelo qual o card exige o round-trip **no adapter**.
 */

const AGORA = new Date('2026-08-10T12:00:00Z');

const ROLAGEM: ResultadoRolagem = {
  expressao: '1d20+11',
  total: 28,
  termos: [
    {
      tipo: 'dados',
      sinal: 1,
      quantidade: 1,
      faces: 20,
      dados: [{ valor: 17, descartado: false }],
      subtotal: 17,
    },
    { tipo: 'constante', sinal: 1, valor: 11, subtotal: 11 },
  ],
};

const AVALIACAO: AvaliacaoRolagem = {
  cd: 18,
  grau: 'sucesso-critico',
  d20Natural: 17,
  efeitoNatural: null,
};

function rolagem(avaliacao: AvaliacaoRolagem | null) {
  return Mensagem.criarRolagem({
    id: '00000000-0000-4000-8000-000000000001',
    mesaId: '11111111-1111-4111-8111-111111111111',
    autorId: '22222222-2222-4222-8222-222222222222',
    autorNome: 'Seelah',
    rolagem: ROLAGEM,
    motivo: 'Furtividade — Seelah',
    avaliacao,
    agora: AGORA,
  });
}

describe('mensagem.mapper — a avaliação atravessa a ida e a volta (RV-154)', () => {
  it('a avaliação vai inteira para a linha, no nome de coluna do banco', () => {
    const row = mensagemParaRow(rolagem(AVALIACAO));

    // `avaliacao` (snake_case coincide com camelCase aqui) é a coluna criada pela
    // migration `0010`; o objeto vai como está, sem achatar nem renomear campo.
    expect(row.avaliacao).toEqual(AVALIACAO);
  });

  it('ida e volta devolve a avaliação idêntica, campo por campo', () => {
    const dto = rowParaMensagemDTO(mensagemParaRow(rolagem(AVALIACAO)));

    expect(dto.avaliacao).toEqual(AVALIACAO);
    // E o resto da mensagem não foi afetado pela coluna nova.
    expect(dto.rolagem).toEqual(ROLAGEM);
    expect(dto.motivo).toBe('Furtividade — Seelah');
    expect(dto.tipo).toBe('rolagem');
  });

  it('os quatro campos da avaliação sobrevivem, inclusive o efeito do dado natural', () => {
    const comAjuste: AvaliacaoRolagem = {
      cd: 40,
      grau: 'falha',
      d20Natural: 20,
      efeitoNatural: 'melhorou',
    };

    const dto = rowParaMensagemDTO(mensagemParaRow(rolagem(comAjuste)));

    expect(dto.avaliacao).toEqual(comAjuste);
  });

  it('rolagem sem CD grava `null`, e não um objeto vazio', () => {
    const row = mensagemParaRow(rolagem(null));

    expect(row.avaliacao).toBeNull();
    expect(rowParaMensagemDTO(row).avaliacao).toBeNull();
  });

  it('fala grava `null` — só rolagem tem avaliação', () => {
    const fala = Mensagem.criarFala({
      id: '00000000-0000-4000-8000-000000000002',
      mesaId: '11111111-1111-4111-8111-111111111111',
      autorId: '22222222-2222-4222-8222-222222222222',
      autorNome: 'Seelah',
      conteudo: 'abro a porta',
      agora: AGORA,
    });
    expect(fala.ok).toBe(true);
    if (!fala.ok) return;

    // É o mesmo invariante que o check da `0010` protege no banco.
    expect(mensagemParaRow(fala.valor).avaliacao).toBeNull();
  });
});

describe('mensagem.mapper — histórico gravado antes da 0010 (RV-154)', () => {
  it('linha sem a coluna `avaliacao` é lida como "sem CD", e não quebra', () => {
    /**
     * O caso real: no banco há rolagens gravadas antes desta migration. Contra o
     * Postgres a coluna existe e vem `null`; num payload vindo de cache — ou de
     * uma linha lida por uma consulta anterior — a chave simplesmente **não
     * existe**. O mapper tem de tolerar a ausência, não só o `null`.
     */
    const linhaAntiga = {
      id: '00000000-0000-4000-8000-000000000003',
      mesa_id: '11111111-1111-4111-8111-111111111111',
      autor_id: '22222222-2222-4222-8222-222222222222',
      autor_nome: 'Seelah',
      tipo: 'rolagem',
      conteudo: '1d20+11',
      rolagem: ROLAGEM,
      motivo: 'Furtividade — Seelah',
      destinatario_id: null,
      destinatario_nome: null,
      criado_em: AGORA.toISOString(),
    } satisfies Omit<RowMensagem, 'avaliacao'>;

    const dto = rowParaMensagemDTO(linhaAntiga as RowMensagem);

    expect(dto.avaliacao).toBeNull();
    // A rolagem antiga continua legível por inteiro: é isso que "mensagem antiga
    // não pode quebrar" significa.
    expect(dto.rolagem?.total).toBe(28);
    expect(dto.motivo).toBe('Furtividade — Seelah');
  });
});
