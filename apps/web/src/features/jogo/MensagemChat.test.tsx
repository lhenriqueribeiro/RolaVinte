import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AvaliacaoRolagem, MensagemDTO, ResultadoRolagem } from '@rolavinte/shared';
import { MensagemChat } from './MensagemChat';

/**
 * O selo de grau de sucesso no chat (RV-154).
 *
 * Dois riscos concretos, e é por eles que este arquivo existe:
 *
 * 1. **A cor não pode ser a informação.** No jsdom nenhuma classe de Tailwind é
 *    interpretada, então todo teste aqui procura **texto** — que é justamente a
 *    garantia que o DoD pede. Se o selo dependesse de cor, estes testes falhariam.
 * 2. **Mensagem antiga não pode quebrar.** Há rolagens gravadas antes deste card
 *    no banco real. Elas chegam sem a chave `avaliacao`, e não com `null`.
 */

const EU = 'u1';

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

function mensagemDeRolagem(avaliacao: AvaliacaoRolagem | null): MensagemDTO {
  return {
    id: 'm1',
    mesaId: 'mesa-1',
    autorId: EU,
    autorNome: 'Seelah',
    tipo: 'rolagem',
    conteudo: '1d20+11',
    rolagem: ROLAGEM,
    motivo: 'Furtividade — Seelah',
    criadoEm: '2026-08-10T12:00:00.000Z',
    destinatarioId: null,
    destinatarioNome: null,
    avaliacao,
  };
}

/**
 * Uma mensagem **no formato antigo**: sem a chave `avaliacao`.
 *
 * O `delete` é o ponto do teste, não um atalho — o tipo promete
 * `AvaliacaoRolagem | null` e o runtime entrega `undefined`. Escrever
 * `avaliacao: null` aqui testaria outro caso (o que a API manda hoje) e deixaria
 * o histórico do banco real descoberto.
 */
function mensagemNoFormatoAntigo(): MensagemDTO {
  const mensagem: Record<string, unknown> = { ...mensagemDeRolagem(null) };
  delete mensagem['avaliacao'];
  return mensagem as unknown as MensagemDTO;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('selo de grau de sucesso (RV-154)', () => {
  it('sucesso crítico aparece em texto, com a CD ao lado', () => {
    render(
      <MensagemChat
        mensagem={mensagemDeRolagem({
          cd: 18,
          grau: 'sucesso-critico',
          d20Natural: 17,
          efeitoNatural: null,
        })}
        usuarioId={EU}
      />,
    );

    // O cenário de aceite do card: o total 28 e "Sucesso crítico".
    expect(screen.getByText('28', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/Sucesso crítico/)).toBeInTheDocument();
    expect(screen.getByText(/contra CD 18/)).toBeInTheDocument();
  });

  it('os quatro graus são distinguíveis por texto, sem depender de cor', () => {
    const graus = [
      ['sucesso-critico', 'Sucesso crítico'],
      ['sucesso', 'Sucesso'],
      ['falha', 'Falha'],
      ['falha-critica', 'Falha crítica'],
    ] as const;

    for (const [grau, esperado] of graus) {
      const { unmount } = render(
        <MensagemChat
          mensagem={mensagemDeRolagem({ cd: 18, grau, d20Natural: 12, efeitoNatural: null })}
          usuarioId={EU}
        />,
      );
      expect(screen.getByText(new RegExp(`^${esperado}`))).toBeInTheDocument();
      unmount();
    }
  });

  it('20 natural que virou falha diz "Falha" E explica o ajuste em texto', () => {
    // O segundo cenário do card: 20 natural **não** é sucesso automático, e a
    // tela precisa dizer por que o grau subiu — senão a mesa acha que é bug.
    render(
      <MensagemChat
        mensagem={mensagemDeRolagem({
          cd: 40,
          grau: 'falha',
          d20Natural: 20,
          efeitoNatural: 'melhorou',
        })}
        usuarioId={EU}
      />,
    );

    expect(screen.getByText(/^Falha/)).toBeInTheDocument();
    expect(screen.getByText('20 natural: um grau acima.')).toBeInTheDocument();
    expect(screen.queryByText(/Sucesso/)).not.toBeInTheDocument();
  });

  it('20 natural sem efeito não afirma que melhorou nada', () => {
    render(
      <MensagemChat
        mensagem={mensagemDeRolagem({
          cd: 18,
          grau: 'sucesso-critico',
          d20Natural: 20,
          efeitoNatural: 'sem-efeito',
        })}
        usuarioId={EU}
      />,
    );

    expect(screen.getByText(/já estava no limite da escala/)).toBeInTheDocument();
    expect(screen.queryByText(/um grau acima/)).not.toBeInTheDocument();
  });

  it('rolagem sem CD não ganha selo, e continua mostrando o total', () => {
    render(<MensagemChat mensagem={mensagemDeRolagem(null)} usuarioId={EU} />);

    expect(screen.getByText('28', { exact: false })).toBeInTheDocument();
    expect(screen.queryByText(/contra CD/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sucesso|Falha/)).not.toBeInTheDocument();
  });
});

describe('histórico gravado antes deste card (RV-154)', () => {
  it('mensagem sem a chave `avaliacao` renderiza inteira, sem selo e sem erro no console', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<MensagemChat mensagem={mensagemNoFormatoAntigo()} usuarioId={EU} />);

    expect(screen.getByText('1d20+11')).toBeInTheDocument();
    expect(screen.getByText('28', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/Furtividade — Seelah/)).toBeInTheDocument();
    expect(screen.queryByText(/contra CD/)).not.toBeInTheDocument();
    expect(erro).not.toHaveBeenCalled();
  });

  it('fala antiga, sem rolagem nem avaliação, continua igual', () => {
    const fala: MensagemDTO = { ...mensagemNoFormatoAntigo(), tipo: 'fala', rolagem: null };

    render(<MensagemChat mensagem={fala} usuarioId={EU} />);

    expect(screen.getByText('Seelah')).toBeInTheDocument();
    expect(screen.queryByText(/contra CD/)).not.toBeInTheDocument();
  });
});

describe('o selo conversa com a privacidade da mensagem (RV-071 + RV-154)', () => {
  it('rolagem oculta avaliada mantém o rótulo de segredo E mostra o grau', () => {
    const oculta: MensagemDTO = {
      ...mensagemDeRolagem({ cd: 22, grau: 'sucesso', d20Natural: 15, efeitoNatural: null }),
      tipo: 'rolagem-oculta',
    };

    render(<MensagemChat mensagem={oculta} usuarioId={EU} />);

    // Quem vê isto é só o mestre; o selo não pode apagar o aviso de que é secreto.
    expect(screen.getByText(/só você vê este resultado/)).toBeInTheDocument();
    expect(screen.getByText(/^Sucesso/)).toBeInTheDocument();
    expect(screen.getByText(/contra CD 22/)).toBeInTheDocument();
  });
});
