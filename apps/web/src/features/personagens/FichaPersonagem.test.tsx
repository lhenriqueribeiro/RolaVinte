import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  dadosIniciaisDaFicha,
  definicaoDoSistema,
  DEFINICOES_SISTEMA,
  type DefinicaoSistema,
  type PersonagemDTO,
} from '@rolavinte/shared';
import { renderizarComProvedores } from '@/testes/utilitarios';
import { FichaPersonagem } from './FichaPersonagem';

const MESA_ID = 'mesa-1';

const { requisitarFalso } = vi.hoisted(() => ({
  requisitarFalso: vi.fn<(caminho: string, opcoes?: unknown) => Promise<unknown>>(),
}));

vi.mock('@/lib/api', () => ({
  requisitar: requisitarFalso,
  enviarArquivo: vi.fn(),
  ErroApi: class ErroApi extends Error {},
}));

function personagem(campos: Partial<PersonagemDTO> = {}): PersonagemDTO {
  return {
    id: 'p1',
    mesaId: MESA_ID,
    donoId: 'u1',
    donoNome: 'Ana',
    nome: 'Thorin',
    classe: 'Ladino',
    nivel: 3,
    pvAtual: 20,
    pvMax: 30,
    atributos: {
      forca: 8,
      destreza: 16,
      constituicao: 10,
      inteligencia: 10,
      sabedoria: 10,
      carisma: 10,
    },
    anotacoes: '',
    sistema: 'generico',
    dados: {},
    ...campos,
  };
}

/** A ficha de um sistema, com os dados iniciais que aquela definição produz. */
function fichaDoSistema(definicao: DefinicaoSistema, campos: Partial<PersonagemDTO> = {}) {
  return personagem({
    sistema: definicao.chave,
    dados: dadosIniciaisDaFicha(definicao.chave),
    ...campos,
  });
}

function rotulosDeCampos(definicao: DefinicaoSistema): string[] {
  return definicao.secoes.flatMap((secao) => secao.campos.map((campo) => campo.rotulo));
}

function titulosDeSecoes(definicao: DefinicaoSistema): string[] {
  return definicao.secoes.map((secao) => secao.titulo);
}

function rotulosDePericias(definicao: DefinicaoSistema): string[] {
  return definicao.pericias.map((pericia) => pericia.rotulo);
}

beforeEach(() => {
  requisitarFalso.mockReset();
  requisitarFalso.mockResolvedValue(undefined);
});

/**
 * O teste que mede se a extensibilidade do RV-091 chegou até a tela.
 *
 * Ele não cita nome de sistema nenhum: percorre o registro de
 * `@rolavinte/shared` e, para cada definição, exige que a ficha mostre as
 * seções, os campos e as perícias **daquela** definição e **nenhum** rótulo que
 * pertença só a outra. Um `if (sistema === 'dnd5e')` no componente — ou o JSX
 * fixo que havia antes deste card — reprova na hora que o laço chega numa mesa
 * genérica.
 */
describe('a ficha renderiza a definição do sistema da mesa (RV-091)', () => {
  it('há sistema com seção e sistema sem seção no registro — senão o laço abaixo não prova nada', () => {
    expect(DEFINICOES_SISTEMA.length).toBeGreaterThan(1);
    expect(DEFINICOES_SISTEMA.some((d) => d.secoes.length > 0)).toBe(true);
    expect(DEFINICOES_SISTEMA.some((d) => d.secoes.length === 0)).toBe(true);
    expect(DEFINICOES_SISTEMA.some((d) => d.pericias.length > 0)).toBe(true);
    expect(DEFINICOES_SISTEMA.some((d) => d.pericias.length === 0)).toBe(true);
  });

  it.each(DEFINICOES_SISTEMA.map((d) => [d.chave, d] as const))(
    'a ficha de %s mostra as seções e perícias da própria definição, e nenhuma de outro sistema',
    (_chave, definicao) => {
      const proprios = [
        ...titulosDeSecoes(definicao),
        ...rotulosDeCampos(definicao),
        ...rotulosDePericias(definicao),
      ];
      const deOutros = DEFINICOES_SISTEMA.filter((d) => d.chave !== definicao.chave)
        .flatMap((d) => [...titulosDeSecoes(d), ...rotulosDeCampos(d), ...rotulosDePericias(d)])
        .filter((rotulo) => !proprios.includes(rotulo));

      const { unmount } = renderizarComProvedores(
        <FichaPersonagem
          personagem={fichaDoSistema(definicao)}
          podeEditar
          aoFechar={() => undefined}
        />,
      );

      for (const titulo of titulosDeSecoes(definicao)) {
        expect(screen.getByText(titulo)).toBeInTheDocument();
      }
      for (const rotulo of [...rotulosDeCampos(definicao), ...rotulosDePericias(definicao)]) {
        expect(screen.getByLabelText(rotulo)).toBeInTheDocument();
      }
      for (const rotulo of deOutros) {
        expect(screen.queryByText(rotulo)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(rotulo)).not.toBeInTheDocument();
      }

      unmount();
    },
  );

  it('a ficha genérica continua sendo a de sempre: só a metade comum, sem seção do sistema', () => {
    renderizarComProvedores(
      <FichaPersonagem personagem={personagem()} podeEditar aoFechar={() => undefined} />,
    );

    expect(screen.getByLabelText('Nome')).toHaveValue('Thorin');
    expect(screen.getByLabelText('Classe')).toHaveValue('Ladino');
    expect(screen.getByLabelText('Nível')).toHaveValue(3);
    expect(screen.getByLabelText('Valor de destreza')).toHaveValue(16);
    expect(screen.getByLabelText('Anotações')).toBeInTheDocument();
    expect(screen.queryByText('Perícias (o bônus já soma atributo e treinamento)')).toBeNull();
  });

  it('o nome do sistema fica escrito no cabeçalho, para a ficha não parecer a de outro jogo', () => {
    renderizarComProvedores(
      <FichaPersonagem
        personagem={fichaDoSistema(definicaoDoSistema('dnd5e'))}
        podeEditar
        aoFechar={() => undefined}
      />,
    );

    expect(screen.getByText(/Sistema: D&D 5e/)).toBeInTheDocument();
  });

  it.each(DEFINICOES_SISTEMA.map((d) => [d.chave, d] as const))(
    'o teste de atributo de %s usa o dado da definição, não um 1d20 escrito na tela',
    async (_chave, definicao) => {
      // A perícia já saía com `definicao.dadoDeTeste` (via `expressaoDePericia`);
      // o atributo tinha `1d20` fixo no componente. Num sistema que não é d20 as
      // duas metades da mesma ficha rolariam dados diferentes — decisão por
      // sistema tomada fora do registro, que é o que o RV-091 apaga.
      const usuario = userEvent.setup();
      const { unmount } = renderizarComProvedores(
        <FichaPersonagem
          // FOR 8 → modificador -1, um bônus que não é zero nem positivo.
          personagem={fichaDoSistema(definicao)}
          podeEditar
          aoFechar={() => undefined}
        />,
      );

      await usuario.click(screen.getAllByTitle(`Rolar ${definicao.dadoDeTeste}-1`)[0]!);

      await waitFor(() => {
        expect(requisitarFalso).toHaveBeenCalledWith(
          `/mesas/${MESA_ID}/rolagens`,
          expect.objectContaining({
            corpo: { expressao: `${definicao.dadoDeTeste}-1`, motivo: 'FOR — Thorin' },
          }),
        );
      });

      unmount();
      requisitarFalso.mockReset();
      requisitarFalso.mockResolvedValue(undefined);
    },
  );
});

describe('campos do sistema são editados e salvos (RV-091)', () => {
  it('o valor gravado aparece no campo e o salvamento manda a ficha inteira em `dados`', async () => {
    const usuario = userEvent.setup();
    const dnd = fichaDoSistema(definicaoDoSistema('dnd5e'));
    requisitarFalso.mockResolvedValue(dnd);
    renderizarComProvedores(
      <FichaPersonagem personagem={dnd} podeEditar aoFechar={() => undefined} />,
    );

    const ca = screen.getByLabelText('Classe de armadura');
    expect(ca).toHaveValue(10);
    await usuario.clear(ca);
    await usuario.type(ca, '18');
    await usuario.click(screen.getByLabelText('Inspiração'));
    await usuario.click(screen.getByRole('button', { name: 'Salvar ficha' }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(
        '/personagens/p1',
        expect.objectContaining({ metodo: 'PATCH' }),
      );
    });
    const [, opcoes] = requisitarFalso.mock.calls[0] ?? [];
    const corpo = (opcoes as { corpo: { dados: Record<string, unknown> } }).corpo;
    expect(corpo.dados).toMatchObject({ ca: 18, inspiracao: true, deslocamento: 9 });
    // A metade comum continua indo junto: o PATCH substitui a ficha inteira.
    expect(corpo).toMatchObject({ nome: 'Thorin', nivel: 3 });
  });

  it('ficha somente leitura desabilita os campos do sistema', () => {
    renderizarComProvedores(
      <FichaPersonagem
        personagem={fichaDoSistema(definicaoDoSistema('dnd5e'))}
        podeEditar={false}
        aoFechar={() => undefined}
      />,
    );

    expect(screen.getByLabelText('Classe de armadura')).toBeDisabled();
    expect(screen.getByLabelText('Inspiração')).toBeDisabled();
    expect(screen.getByLabelText('Furtividade')).toBeDisabled();
  });
});

describe('perícias com rolagem em um clique (RV-090)', () => {
  function fichaComFurtividade(grau: string) {
    const definicao = definicaoDoSistema('dnd5e');
    return fichaDoSistema(definicao, {
      dados: definicao.definirGrauDePericia(dadosIniciaisDaFicha('dnd5e'), 'furtividade', grau),
    });
  }

  it('mostra o bônus somado e o grau em texto, nunca só em cor', () => {
    renderizarComProvedores(
      <FichaPersonagem
        personagem={fichaComFurtividade('proficiente')}
        podeEditar
        aoFechar={() => undefined}
      />,
    );

    expect(screen.getByLabelText('Furtividade')).toHaveValue('proficiente');
    expect(screen.getByRole('button', { name: 'Rolar Furtividade (1d20+5)' })).toHaveTextContent(
      '+5',
    );
    // Atletismo sai de Força 8 (−1) e continua destreinado.
    expect(screen.getByRole('button', { name: 'Rolar Atletismo (1d20-1)' })).toBeInTheDocument();
  });

  it('um clique publica a rolagem com o motivo que identifica perícia e personagem', async () => {
    const usuario = userEvent.setup();
    renderizarComProvedores(
      <FichaPersonagem
        personagem={fichaComFurtividade('proficiente')}
        podeEditar
        aoFechar={() => undefined}
      />,
    );

    await usuario.click(screen.getByRole('button', { name: 'Rolar Furtividade (1d20+5)' }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(`/mesas/${MESA_ID}/rolagens`, {
        metodo: 'POST',
        corpo: { expressao: '1d20+5', motivo: 'Furtividade — Thorin' },
      });
    });
  });

  it('trocar o grau recalcula o bônus na hora, antes de salvar', async () => {
    const usuario = userEvent.setup();
    renderizarComProvedores(
      <FichaPersonagem
        personagem={fichaComFurtividade('destreinado')}
        podeEditar
        aoFechar={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: 'Rolar Furtividade (1d20+3)' })).toBeInTheDocument();

    await usuario.selectOptions(screen.getByLabelText('Furtividade'), 'especialista');

    expect(screen.getByRole('button', { name: 'Rolar Furtividade (1d20+7)' })).toBeInTheDocument();
  });

  it('o grau escolhido é gravado pelo caminho da definição, não escrevendo em `dados` na mão', async () => {
    const usuario = userEvent.setup();
    const ficha = fichaComFurtividade('destreinado');
    requisitarFalso.mockResolvedValue(ficha);
    renderizarComProvedores(
      <FichaPersonagem personagem={ficha} podeEditar aoFechar={() => undefined} />,
    );

    await usuario.selectOptions(screen.getByLabelText('Furtividade'), 'proficiente');
    await usuario.click(screen.getByRole('button', { name: 'Salvar ficha' }));

    await waitFor(() => expect(requisitarFalso).toHaveBeenCalled());
    const [, opcoes] = requisitarFalso.mock.calls[0] ?? [];
    const corpo = (opcoes as { corpo: { dados: Record<string, unknown> } }).corpo;
    // O formato de `dados.pericias` é decisão do sistema; o que se exige aqui é
    // que o salvo seja exatamente o que a definição produz.
    expect(corpo.dados).toEqual(
      definicaoDoSistema('dnd5e').definirGrauDePericia(
        dadosIniciaisDaFicha('dnd5e'),
        'furtividade',
        'proficiente',
      ),
    );
  });
});

describe('mesa encerrada continua congelando a ficha (RV-027)', () => {
  it('a rolagem de perícia trava com o motivo escrito, e nada é enviado', async () => {
    const usuario = userEvent.setup();
    renderizarComProvedores(
      <FichaPersonagem
        personagem={fichaDoSistema(definicaoDoSistema('dnd5e'))}
        podeEditar={false}
        motivoBloqueio="Esta mesa foi encerrada."
        aoFechar={() => undefined}
      />,
    );

    const botao = screen.getByRole('button', { name: 'Rolar Furtividade (1d20+3)' });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute('title', 'Esta mesa foi encerrada.');
    expect(screen.getByRole('button', { name: 'Rolar Percepção (1d20+0)' })).toBeDisabled();

    await usuario.click(botao);

    expect(requisitarFalso).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Salvar ficha' })).toBeNull();
  });
});
