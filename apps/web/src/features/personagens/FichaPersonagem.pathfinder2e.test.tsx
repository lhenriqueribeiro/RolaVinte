import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  acrescentarSaber,
  atributosIniciais,
  chaveDeSaber,
  dadosIniciaisDaFicha,
  definicaoDoSistema,
  type Atributos,
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
 * Seelah, nível 5, com Destreza +4 e Inteligência +1 (RV-098).
 *
 * Os modificadores vão na coluna comum `atributos`, na escala do sistema
 * (−5..+8), que desde o RV-098 é a **única** casa do atributo. Se algum dia a
 * fórmula do d20 for aplicada aqui, `(4 − 10) / 2` daria −3 e todos os números
 * deste arquivo cairiam junto.
 */
function seelah(dados: DadosFicha, nivel = 5, atributos = MODIFICADORES_DE_SEELAH): PersonagemDTO {
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
    atributos,
    anotacoes: '',
    sistema: 'pathfinder2e',
    dados,
  };
}

const MODIFICADORES_DE_SEELAH: Atributos = {
  ...atributosIniciais('pathfinder2e'),
  destreza: 4,
  inteligencia: 1,
};

/** A metade do sistema da ficha de Seelah — sem modificador nenhum (RV-098). */
function fichaDeSeelah(): DadosFicha {
  return dadosIniciaisDaFicha('pathfinder2e');
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

  it('Percepção não aparece entre as perícias — ela é defesa (RV-155)', () => {
    renderizarComProvedores(
      <FichaPersonagem
        personagem={seelah(fichaDeSeelah())}
        podeEditar
        aoFechar={() => undefined}
      />,
    );

    // A asserção era global até o RV-155 ("Percepção não aparece em lugar nenhum"),
    // e passou a ser por seção: desde aquele card a Percepção **existe** na ficha,
    // nas defesas, com dado próprio. O que continua proibido é ela estar entre as
    // perícias, e é isso que se verifica — dentro do `fieldset` de perícias.
    const pericias = screen.getByRole('group', { name: /Perícias/ });
    expect(within(pericias).queryByLabelText('Percepção')).toBeNull();
    expect(within(pericias).queryByText('Percepção')).toBeNull();

    // E a contraprova, para o teste não passar por a Percepção ter desaparecido da
    // ficha inteira: ela está nas defesas, com botão de dado.
    expect(screen.getByRole('button', { name: /^Rolar Percepção/ })).toBeInTheDocument();
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
          ...seelah(dadosIniciaisDaFicha('dnd5e'), 5, atributosIniciais('dnd5e')),
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
