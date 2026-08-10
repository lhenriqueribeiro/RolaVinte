import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  acrescentarSaber,
  chaveDeSaber,
  dadosIniciaisDaFicha,
  definicaoDoSistema,
  type DadosFicha,
  type PersonagemDTO,
} from '@rolavinte/shared';
import { renderizarComProvedores } from '@/testes/utilitarios';
import { FichaPersonagem } from './FichaPersonagem';

/**
 * Perícias de PF2e na ficha (RV-153).
 *
 * O que este arquivo prova é a ponta que nenhum teste puro alcança: que o
 * número calculado em `@rolavinte/shared` é **o mesmo** que o botão publica no
 * chat, e que a linha do Saber que o jogador criou vira uma rolagem própria.
 *
 * Nenhuma conta é refeita aqui: os bônus esperados estão escritos à mão, como
 * um jogador os somaria na mesa. Se o componente passar a fazer aritmética, é
 * aqui que aparece — o card proíbe bônus calculado dentro do JSX.
 */

const MESA_ID = 'mesa-1';

const { requisitarFalso } = vi.hoisted(() => ({
  requisitarFalso: vi.fn<(caminho: string, opcoes?: unknown) => Promise<unknown>>(),
}));

vi.mock('@/lib/api', () => ({
  requisitar: requisitarFalso,
  enviarArquivo: vi.fn(),
  ErroApi: class ErroApi extends Error {},
}));

const definicao = definicaoDoSistema('pathfinder2e');

/**
 * Seelah, nível 5. As colunas comuns vão **altas** de propósito: no d20 clássico
 * elas dariam +5, e neste sistema não valem nada. Qualquer queda para
 * `modificadorAtributo()` apareceria como um bônus inflado nos números abaixo.
 */
function seelah(dados: DadosFicha, nivel = 5): PersonagemDTO {
  return {
    id: 'p1',
    mesaId: MESA_ID,
    donoId: 'u1',
    donoNome: 'Bruno',
    nome: 'Seelah',
    classe: 'Paladina',
    nivel,
    pvAtual: 40,
    pvMax: 40,
    atributos: {
      forca: 20,
      destreza: 20,
      constituicao: 20,
      inteligencia: 20,
      sabedoria: 20,
      carisma: 20,
    },
    anotacoes: '',
    sistema: 'pathfinder2e',
    dados,
  };
}

/** Ficha com Destreza +4, Inteligência +1 e Sabedoria +0 gravados. */
function fichaDeSeelah(): DadosFicha {
  return {
    ...dadosIniciaisDaFicha('pathfinder2e'),
    modificadorDestreza: 4,
    modificadorInteligencia: 1,
  };
}

function comGrau(dados: DadosFicha, pericia: string, grau: string): DadosFicha {
  return definicao.definirGrauDePericia(dados, pericia, grau);
}

beforeEach(() => {
  requisitarFalso.mockReset();
  requisitarFalso.mockResolvedValue(undefined);
});

describe('perícias de PF2e na ficha (RV-153)', () => {
  it('o bônus exibido é nível + treinamento + modificador, e o destreinado não soma o nível', () => {
    // Cenários do card: nível 5, treinado em Furtividade com Destreza +4 → +11;
    // destreinado em Arcanismo com Inteligência +1 → +1.
    renderizarComProvedores(
      <FichaPersonagem
        personagem={seelah(comGrau(fichaDeSeelah(), 'furtividade', 'treinado'))}
        podeEditar
        aoFechar={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: 'Rolar Furtividade (1d20+11)' })).toHaveTextContent(
      '+11',
    );
    expect(screen.getByRole('button', { name: 'Rolar Arcanismo (1d20+1)' })).toHaveTextContent(
      '+1',
    );
    expect(screen.getByLabelText('Furtividade')).toHaveValue('treinado');
  });

  it('um clique publica a rolagem com o bônus e o motivo certos', async () => {
    const usuario = userEvent.setup();
    renderizarComProvedores(
      <FichaPersonagem
        personagem={seelah(comGrau(fichaDeSeelah(), 'furtividade', 'treinado'))}
        podeEditar
        aoFechar={() => undefined}
      />,
    );

    await usuario.click(screen.getByRole('button', { name: 'Rolar Furtividade (1d20+11)' }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(`/mesas/${MESA_ID}/rolagens`, {
        metodo: 'POST',
        corpo: { expressao: '1d20+11', motivo: 'Furtividade — Seelah' },
      });
    });
  });

  it('trocar o grau recalcula antes de salvar, e o nível 20 destreinado continua valendo o modificador', async () => {
    const usuario = userEvent.setup();
    renderizarComProvedores(
      <FichaPersonagem
        personagem={seelah(fichaDeSeelah(), 20)}
        podeEditar
        aoFechar={() => undefined}
      />,
    );

    // Nível 20 e destreinado: +4 da Destreza, e nada do nível. Se algum dia isto
    // virar +24, todo destreinado do sistema inflou em silêncio.
    expect(screen.getByRole('button', { name: 'Rolar Furtividade (1d20+4)' })).toBeInTheDocument();

    await usuario.selectOptions(screen.getByLabelText('Furtividade'), 'lendario');

    // Lendário no nível 20: 20 + 8 + 4.
    expect(screen.getByRole('button', { name: 'Rolar Furtividade (1d20+32)' })).toBeInTheDocument();
  });

  it('Percepção não aparece entre as perícias', () => {
    renderizarComProvedores(
      <FichaPersonagem
        personagem={seelah(fichaDeSeelah())}
        podeEditar
        aoFechar={() => undefined}
      />,
    );

    expect(screen.queryByLabelText('Percepção')).toBeNull();
    expect(screen.queryByText('Percepção')).toBeNull();
  });

  it('a ação de treinado aparece indisponível com o motivo, e não some da tela', async () => {
    const usuario = userEvent.setup();
    renderizarComProvedores(
      <FichaPersonagem
        personagem={seelah(fichaDeSeelah())}
        podeEditar
        aoFechar={() => undefined}
      />,
    );

    const linhaMedicina = screen.getByLabelText('Medicina').closest('li');
    expect(linhaMedicina).not.toBeNull();
    const medicina = within(linhaMedicina as HTMLElement);
    await usuario.click(medicina.getByText(/Ações que exigem treinamento/));

    const acao = medicina.getByText('Tratar Ferimentos').closest('li');
    expect(acao).toHaveTextContent('indisponível');
    expect(acao).toHaveTextContent('Exige ao menos treinado em Medicina.');
  });
});

describe('Saber é uma família na ficha (RV-153)', () => {
  function fichaComDoisSaberes(): DadosFicha {
    let dados = acrescentarSaber(fichaDeSeelah(), 'Guerra');
    dados = acrescentarSaber(dados, 'Náutico');
    return comGrau(dados, chaveDeSaber('Guerra'), 'treinado');
  }

  it('duas especializações aparecem em linhas separadas, com bônus diferentes', async () => {
    const usuario = userEvent.setup();
    renderizarComProvedores(
      <FichaPersonagem
        personagem={seelah(fichaComDoisSaberes())}
        podeEditar
        aoFechar={() => undefined}
      />,
    );

    // Saber sai de Inteligência, que aqui é +1. Guerra é treinada no nível 5
    // (5 + 2 de proficiência + 1) → +8; Náutico é destreinado, e o nível não
    // entra → +1. Duas linhas, dois números, a mesma ficha.
    const guerra = screen.getByRole('button', { name: 'Rolar Saber (Guerra) (1d20+8)' });
    expect(
      screen.getByRole('button', { name: 'Rolar Saber (Náutico) (1d20+1)' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Saber (Guerra)')).toHaveValue('treinado');
    expect(screen.getByLabelText('Saber (Náutico)')).toHaveValue('destreinado');

    await usuario.click(guerra);

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(`/mesas/${MESA_ID}/rolagens`, {
        metodo: 'POST',
        corpo: { expressao: '1d20+8', motivo: 'Saber (Guerra) — Seelah' },
      });
    });
  });

  it('o jogador cria uma especialização e ela é salva pelo caminho da definição', async () => {
    const usuario = userEvent.setup();
    const ficha = seelah(fichaDeSeelah());
    requisitarFalso.mockResolvedValue(ficha);
    renderizarComProvedores(
      <FichaPersonagem personagem={ficha} podeEditar aoFechar={() => undefined} />,
    );

    const adicionar = screen.getByRole('button', { name: /Adicionar Saber/ });
    // Campo vazio: o botão fica desabilitado **com o motivo escrito**, e não
    // some da tela.
    expect(adicionar).toBeDisabled();
    expect(adicionar).toHaveAttribute('title', expect.stringContaining('antes de adicionar'));

    await usuario.type(screen.getByLabelText('Especialização de Saber'), 'Guerra');
    expect(adicionar).toBeEnabled();
    await usuario.click(adicionar);

    expect(screen.getByLabelText('Saber (Guerra)')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Rolar Saber (Guerra) (1d20+1)' }),
    ).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Salvar ficha' }));

    await waitFor(() => expect(requisitarFalso).toHaveBeenCalled());
    const [, opcoes] = requisitarFalso.mock.calls[0] ?? [];
    const corpo = (opcoes as { corpo: { dados: DadosFicha } }).corpo;
    // O formato de `dados.saberes` é decisão do sistema: o que se exige é que o
    // salvo seja exatamente o que a definição produz.
    expect(corpo.dados).toEqual(acrescentarSaber(fichaDeSeelah(), 'Guerra'));
  });

  it('remover a especialização tira a linha, e a perícia fixa não tem esse botão', async () => {
    const usuario = userEvent.setup();
    renderizarComProvedores(
      <FichaPersonagem
        personagem={seelah(fichaComDoisSaberes())}
        podeEditar
        aoFechar={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Remover Furtividade' })).toBeNull();

    await usuario.click(screen.getByRole('button', { name: 'Remover Saber (Guerra)' }));

    expect(screen.queryByLabelText('Saber (Guerra)')).toBeNull();
    expect(screen.getByLabelText('Saber (Náutico)')).toBeInTheDocument();
  });

  it('ficha somente leitura não cria nem remove especialização', () => {
    renderizarComProvedores(
      <FichaPersonagem
        personagem={seelah(fichaComDoisSaberes())}
        podeEditar={false}
        aoFechar={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: /Adicionar Saber/ })).toBeDisabled();
    expect(screen.getByLabelText('Especialização de Saber')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remover Saber (Guerra)' })).toBeDisabled();
    expect(screen.getByLabelText('Saber (Guerra)')).toBeDisabled();
  });

  it('sistema sem família não mostra o formulário de especialização', () => {
    renderizarComProvedores(
      <FichaPersonagem
        personagem={{
          ...seelah(dadosIniciaisDaFicha('dnd5e')),
          sistema: 'dnd5e',
        }}
        podeEditar
        aoFechar={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: /Adicionar/ })).toBeNull();
    expect(screen.queryByLabelText('Especialização de Saber')).toBeNull();
  });
});

describe('mesa encerrada congela também as perícias de PF2e (RV-027)', () => {
  it('a rolagem trava com o motivo escrito e nada é enviado', async () => {
    const usuario = userEvent.setup();
    renderizarComProvedores(
      <FichaPersonagem
        personagem={seelah(comGrau(fichaDeSeelah(), 'furtividade', 'treinado'))}
        podeEditar={false}
        motivoBloqueio="Esta mesa foi encerrada."
        aoFechar={() => undefined}
      />,
    );

    const botao = screen.getByRole('button', { name: 'Rolar Furtividade (1d20+11)' });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute('title', 'Esta mesa foi encerrada.');

    await usuario.click(botao);

    expect(requisitarFalso).not.toHaveBeenCalled();
  });
});
