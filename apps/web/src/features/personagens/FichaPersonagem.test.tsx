import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  atributosIniciais,
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

/**
 * O valor que, **na escala daquele sistema**, produz o modificador pedido
 * (RV-098).
 *
 * O teste diz o modificador que quer — −1 de Força, +3 de Destreza — e a escala
 * responde com o número a gravar: 8 e 16 no d20 clássico, −1 e +3 no PF2e. Sem
 * isto, a fixture teria de escrever valores de uma escala só, e o laço que
 * percorre o registro estaria medindo a fórmula do d20 em todo sistema.
 */
function valorParaModificador(definicao: DefinicaoSistema, modificador: number): number {
  const { minimo, maximo } = definicao.atributos;
  for (let valor = minimo; valor <= maximo; valor += 1) {
    if (definicao.atributos.modificador(valor) === modificador) return valor;
  }
  throw new Error(
    `Nenhum valor da escala de "${definicao.chave}" produz o modificador ${modificador}.`,
  );
}

/**
 * A ficha de um sistema, com os dados iniciais daquela definição e os atributos
 * na escala dela: Força −1 e Destreza +3, quaisquer que sejam os números.
 */
function fichaDoSistema(definicao: DefinicaoSistema, campos: Partial<PersonagemDTO> = {}) {
  return personagem({
    sistema: definicao.chave,
    dados: dadosIniciaisDaFicha(definicao.chave),
    atributos: {
      ...atributosIniciais(definicao.chave),
      forca: valorParaModificador(definicao, -1),
      destreza: valorParaModificador(definicao, 3),
    },
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

/**
 * Os rótulos das defesas derivadas daquele sistema (RV-155).
 *
 * Eles entram no laço pelos dois lados: o sistema **mostra** os seus e **não**
 * mostra os de outro. Sem isto, o "Percepção" das defesas do PF2e seria lido como
 * vazamento da perícia homônima de D&D 5e — dois sistemas podem ter o mesmo nome
 * para coisas de naturezas diferentes, e é o `proprios` que resolve o empate.
 */
function rotulosDeDefesas(definicao: DefinicaoSistema): string[] {
  return definicao
    .defesas({
      nivel: 1,
      atributos: atributosIniciais(definicao.chave),
      dados: dadosIniciaisDaFicha(definicao.chave),
    })
    .map((defesa) => defesa.rotulo);
}

/**
 * Os dois lados da escala de atributo (RV-098): há sistema que deriva o
 * modificador de um valor (o d20 clássico, 1..30) e há sistema em que o número
 * gravado **é** o modificador (o PF2e, −5..+8).
 *
 * Antes do RV-098 a diferença era um booleano `usaAtributosComuns`, e o bloco dos
 * atributos era **escondido** no segundo caso — porque o número certo estava numa
 * segunda cópia dentro de `dados`. Agora o número está num lugar só e a definição
 * diz como interpretá-lo, então os dois lados aparecem na tela.
 */
const COM_MODIFICADOR_DERIVADO = DEFINICOES_SISTEMA.filter(
  (d) => d.atributos.modificador(d.atributos.padrao + 2) !== d.atributos.padrao + 2,
);
const COM_MODIFICADOR_DIRETO = DEFINICOES_SISTEMA.filter(
  (d) => d.atributos.modificador(d.atributos.padrao + 2) === d.atributos.padrao + 2,
);

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
        ...rotulosDeDefesas(definicao),
      ];
      const deOutros = DEFINICOES_SISTEMA.filter((d) => d.chave !== definicao.chave)
        .flatMap((d) => [
          ...titulosDeSecoes(d),
          ...rotulosDeCampos(d),
          ...rotulosDePericias(d),
          ...rotulosDeDefesas(d),
        ])
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
      // A defesa derivada não tem campo — ela aparece como texto, com o número ao
      // lado. Exigi-la aqui é o que impede um sistema de declarar defesas que a
      // tela não desenha (F2: contrato sem consumidor é comentário).
      for (const rotulo of rotulosDeDefesas(definicao)) {
        expect(screen.getByText(rotulo)).toBeInTheDocument();
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

  it('há sistema com modificador derivado e sistema com modificador direto — os laços abaixo precisam dos dois', () => {
    // Sem esta rede, o dia em que todo sistema usar a mesma escala deixaria um
    // dos dois laços sem nenhuma instância, e ele passaria verde sem verificar
    // coisa alguma.
    expect(COM_MODIFICADOR_DERIVADO.length).toBeGreaterThan(0);
    expect(COM_MODIFICADOR_DIRETO.length).toBeGreaterThan(0);
  });

  it.each(DEFINICOES_SISTEMA.map((d) => [d.chave, d] as const))(
    'o teste de atributo de %s usa o dado e a escala da definição, e nada escrito na tela',
    async (_chave, definicao) => {
      // Duas coisas de uma vez. A primeira é do RV-091: o dado sai de
      // `dadoDeTeste`, e não de um `1d20` fixo. A segunda é do RV-098: o bônus
      // sai de `atributos.modificador`, e não da fórmula `(valor − 10) / 2` — que
      // numa ficha de PF2e transformaria o modificador gravado em outro número.
      // A fixture pede Força −1 em qualquer escala, então a expressão esperada é a
      // mesma para todo sistema, com o valor gravado sendo diferente em cada um.
      const usuario = userEvent.setup();
      const { unmount } = renderizarComProvedores(
        <FichaPersonagem
          personagem={fichaDoSistema(definicao)}
          podeEditar
          aoFechar={() => undefined}
        />,
      );

      // A legenda diz qual é a escala: sem isso o jogador digita 18 num campo que
      // vai até +8 e só descobre no 400.
      expect(screen.getByText(definicao.atributos.descricao, { exact: false })).toBeInTheDocument();
      expect(screen.getByLabelText('Valor de forca')).toHaveValue(
        valorParaModificador(definicao, -1),
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

  it.each(DEFINICOES_SISTEMA.map((d) => [d.chave, d] as const))(
    'os limites do campo de atributo de %s são os da escala do sistema',
    (_chave, definicao) => {
      // O `min`/`max` do input vem da escala, e não de um 1..30 escrito no JSX:
      // um campo que aceita o que o servidor recusa é promessa falsa (F6).
      const { unmount } = renderizarComProvedores(
        <FichaPersonagem
          personagem={fichaDoSistema(definicao)}
          podeEditar
          aoFechar={() => undefined}
        />,
      );

      const campo = screen.getByLabelText('Valor de destreza');
      expect(campo).toHaveAttribute('min', String(definicao.atributos.minimo));
      expect(campo).toHaveAttribute('max', String(definicao.atributos.maximo));

      unmount();
    },
  );

  it.each(DEFINICOES_SISTEMA.map((d) => [d.chave, d] as const))(
    'a ficha de %s monta o aviso de licença quando, e só quando, a definição traz atribuição',
    (_chave, definicao) => {
      // A regra é "a atribuição acompanha o conteúdo": quem decide é o dado da
      // definição, não a tela. O texto vem do componente — reescrevê-lo aqui
      // reprovaria na varredura de `AvisoLicenca.test.tsx`.
      const { unmount } = renderizarComProvedores(
        <FichaPersonagem
          personagem={fichaDoSistema(definicao)}
          podeEditar
          aoFechar={() => undefined}
        />,
      );

      const avisos = screen.queryAllByRole('contentinfo');
      expect(avisos).toHaveLength(definicao.atribuicao === null ? 0 : 1);
      if (definicao.atribuicao !== null) {
        expect(avisos[0]).toHaveTextContent(definicao.atribuicao.texto);
      }

      unmount();
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
