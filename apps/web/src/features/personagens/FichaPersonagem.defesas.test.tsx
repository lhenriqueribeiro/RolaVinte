import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  atributosIniciais,
  dadosIniciaisDaFicha,
  type Atributos,
  type DadosFicha,
  type PersonagemDTO,
} from '@rolavinte/shared';
import { renderizarComProvedores } from '@/testes/utilitarios';
import { FichaPersonagem } from './FichaPersonagem';

/**
 * Defesas de PF2e na ficha (RV-155).
 *
 * O que este arquivo prova, e nenhum teste puro alcança: que o número que
 * `@rolavinte/shared` calcula é **o mesmo** que o botão publica no chat, que o
 * derivado não tem campo de edição, e que a CA — que não se rola — não ganha dado.
 *
 * Nenhuma conta é refeita aqui: os bônus esperados estão escritos à mão, como um
 * jogador os somaria na mesa. Se o componente passar a fazer aritmética, é aqui que
 * aparece.
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

/**
 * Seelah do card: nível 3, Destreza +1, Constituição +3, Sabedoria +2, Carisma +4,
 * perita em Fortitude, treinada em Reflexos e Vontade, perita em Percepção, com
 * meia-armadura (item +4, teto de Destreza +1).
 */
const MODIFICADORES_DE_SEELAH: Atributos = {
  ...atributosIniciais('pathfinder2e'),
  destreza: 1,
  constituicao: 3,
  sabedoria: 2,
  carisma: 4,
};

function fichaDeSeelah(extra: DadosFicha = {}): DadosFicha {
  return {
    ...dadosIniciaisDaFicha('pathfinder2e'),
    grauArmadura: 'perito',
    bonusItemArmadura: 4,
    limiteDestrezaArmadura: 1,
    grauFortitude: 'perito',
    grauReflexos: 'treinado',
    grauVontade: 'treinado',
    grauPercepcao: 'perito',
    grauCdClasse: 'treinado',
    atributoChaveClasse: 'carisma',
    ...extra,
  };
}

function seelah(dados: DadosFicha, nivel = 3): PersonagemDTO {
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
    atributos: MODIFICADORES_DE_SEELAH,
    anotacoes: '',
    sistema: 'pathfinder2e',
    dados,
  };
}

function blocoDeDefesas() {
  return within(screen.getByRole('group', { name: /Defesas calculadas/ }));
}

function linhaDaDefesa(rotulo: string) {
  const linha = blocoDeDefesas().getByText(rotulo).closest('li');
  expect(linha, `a defesa "${rotulo}" não está na tela`).not.toBeNull();
  return within(linha as HTMLElement);
}

beforeEach(() => {
  requisitarFalso.mockReset();
  requisitarFalso.mockResolvedValue(undefined);
});

describe('defesas de PF2e na ficha (RV-155)', () => {
  it('exibe CA, as três salvaguardas, Percepção e a CD de classe já somadas', () => {
    renderizarComProvedores(
      <FichaPersonagem
        personagem={seelah(fichaDeSeelah())}
        podeEditar
        aoFechar={() => undefined}
      />,
    );

    // CA: 10 + 7 de perita no nível 3 + 1 (a Destreza +1, dentro do teto) + 4 de
    // item = 22. Fortitude: 7 + 3 = +10. Reflexos: 5 + 1 = +6. Vontade: 5 + 2 = +7.
    // Percepção: 7 + 2 = +9. CD de classe: 10 + 5 + 4 de Carisma = 19.
    expect(linhaDaDefesa('CA').getByText('22')).toBeInTheDocument();
    expect(
      linhaDaDefesa('Fortitude').getByRole('button', { name: /Rolar Fortitude/ }),
    ).toHaveTextContent('+10');
    expect(
      linhaDaDefesa('Reflexos').getByRole('button', { name: 'Rolar Reflexos (1d20+6)' }),
    ).toBeInTheDocument();
    expect(
      linhaDaDefesa('Vontade').getByRole('button', { name: 'Rolar Vontade (1d20+7)' }),
    ).toBeInTheDocument();
    expect(
      linhaDaDefesa('Percepção').getByRole('button', { name: 'Rolar Percepção (1d20+9)' }),
    ).toBeInTheDocument();
    expect(linhaDaDefesa('CD de classe').getByText('19')).toBeInTheDocument();
  });

  it('um clique em Reflexos publica "1d20+6" com o motivo certo, e outro em Percepção "1d20+9"', async () => {
    const usuario = userEvent.setup();
    renderizarComProvedores(
      <FichaPersonagem
        personagem={seelah(fichaDeSeelah())}
        podeEditar
        aoFechar={() => undefined}
      />,
    );

    await usuario.click(screen.getByRole('button', { name: 'Rolar Reflexos (1d20+6)' }));
    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(`/mesas/${MESA_ID}/rolagens`, {
        metodo: 'POST',
        corpo: { expressao: '1d20+6', motivo: 'Reflexos — Seelah' },
      });
    });

    await usuario.click(screen.getByRole('button', { name: 'Rolar Percepção (1d20+9)' }));
    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(`/mesas/${MESA_ID}/rolagens`, {
        metodo: 'POST',
        corpo: { expressao: '1d20+9', motivo: 'Percepção — Seelah' },
      });
    });
  });

  it('CA e CD de classe não têm botão de dado — são números-alvo', () => {
    renderizarComProvedores(
      <FichaPersonagem
        personagem={seelah(fichaDeSeelah())}
        podeEditar
        aoFechar={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: /Rolar CA/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Rolar CD de classe/ })).toBeNull();
  });

  it('o número derivado é somente leitura: não existe campo para editá-lo', () => {
    renderizarComProvedores(
      <FichaPersonagem
        personagem={seelah(fichaDeSeelah())}
        podeEditar
        aoFechar={() => undefined}
      />,
    );

    // Nenhum input rotulado com o nome da defesa. O que é editável são os graus e
    // a armadura, e eles têm rótulo próprio ("Grau em Fortitude").
    for (const rotulo of ['CA', 'Fortitude', 'Reflexos', 'Vontade', 'Percepção', 'CD de classe']) {
      expect(screen.queryByLabelText(rotulo), `${rotulo} virou campo editável`).toBeNull();
    }
    expect(screen.getByLabelText('Grau em Fortitude')).toBeInTheDocument();
    expect(screen.getByLabelText('Bônus de item da armadura')).toBeInTheDocument();
  });

  it('trocar o grau de armadura recalcula a CA antes de salvar', async () => {
    const usuario = userEvent.setup();
    renderizarComProvedores(
      <FichaPersonagem
        personagem={seelah(fichaDeSeelah())}
        podeEditar
        aoFechar={() => undefined}
      />,
    );

    await usuario.selectOptions(screen.getByLabelText('Grau em armadura'), 'destreinado');

    // Destreinado não soma o nível: 10 + 0 + 1 + 4 = 15. Se aparecer 19, alguém
    // escreveu `+ nivel` no lugar de `bonusProficiencia`.
    expect(linhaDaDefesa('CA').getByText('15')).toBeInTheDocument();
  });

  it('o detalhe explica a composição em texto, inclusive o teto da armadura', () => {
    renderizarComProvedores(
      <FichaPersonagem
        personagem={seelah(fichaDeSeelah())}
        podeEditar
        aoFechar={() => undefined}
      />,
    );

    expect(linhaDaDefesa('CA').getByText(/teto \+1 da armadura/)).toBeInTheDocument();
  });

  it('armadura sem limite informado deixa a Destreza inteira e diz isso em texto', async () => {
    const usuario = userEvent.setup();
    renderizarComProvedores(
      <FichaPersonagem
        personagem={seelah(fichaDeSeelah({ limiteDestrezaArmadura: null }), 3)}
        podeEditar
        aoFechar={() => undefined}
      />,
    );

    // A borda do card: o campo aparece vazio, e a UI **diz** que não foi informado.
    expect(screen.getByLabelText('Limite de Destreza da armadura')).toHaveValue(null);
    expect(linhaDaDefesa('CA').getByText(/armadura sem limite informado/)).toBeInTheDocument();

    // Com o teto informado em +0, a Destreza +1 deixa de entrar: 10 + 7 + 0 + 4.
    await usuario.type(screen.getByLabelText('Limite de Destreza da armadura'), '0');
    expect(linhaDaDefesa('CA').getByText('21')).toBeInTheDocument();
  });

  it('sem atributo-chave da classe a CD não é calculada, e a tela diz o que falta', () => {
    renderizarComProvedores(
      <FichaPersonagem
        personagem={seelah(fichaDeSeelah({ atributoChaveClasse: '' }))}
        podeEditar
        aoFechar={() => undefined}
      />,
    );

    const cd = linhaDaDefesa('CD de classe');
    expect(cd.getByText('—')).toBeInTheDocument();
    expect(cd.getByText(/Informe o atributo-chave da classe/)).toBeInTheDocument();
  });

  it('salvar manda os campos informados das defesas, e nenhum número derivado', async () => {
    const usuario = userEvent.setup();
    const ficha = seelah(fichaDeSeelah());
    requisitarFalso.mockResolvedValue(ficha);
    renderizarComProvedores(
      <FichaPersonagem personagem={ficha} podeEditar aoFechar={() => undefined} />,
    );

    await usuario.click(screen.getByRole('button', { name: 'Salvar ficha' }));

    await waitFor(() => expect(requisitarFalso).toHaveBeenCalled());
    const [, opcoes] = requisitarFalso.mock.calls[0] ?? [];
    const corpo = (opcoes as { corpo: { dados: DadosFicha; pvMax: number } }).corpo;
    expect(corpo.dados['grauFortitude']).toBe('perito');
    expect(corpo.dados['limiteDestrezaArmadura']).toBe(1);
    // Nada de derivado atravessa: a CA gravada seria a segunda verdade que o
    // RV-098 fechou para o atributo.
    for (const chave of ['ca', 'fortitude', 'reflexos', 'vontade', 'percepcao', 'cdClasse']) {
      expect(chave in corpo.dados, `\`dados.${chave}\` foi gravado`).toBe(false);
    }
    // E o PV continua vindo da coluna comum, não da sugestão.
    expect(corpo.pvMax).toBe(40);
  });
});

describe('PV continua tendo uma casa só (RV-155)', () => {
  it('a sugestão aparece como texto, e o PV editável continua sendo o do topo', async () => {
    const usuario = userEvent.setup();
    renderizarComProvedores(
      <FichaPersonagem
        personagem={seelah(fichaDeSeelah({ pvDaAncestralidade: 10, pvDaClassePorNivel: 10 }))}
        podeEditar
        aoFechar={() => undefined}
      />,
    );

    // 10 + 3 × (10 + 3 de Constituição) = 49. E há **um** campo de PV máximo, com
    // o valor gravado (40) — a sugestão não o substitui nem o sobrescreve.
    expect(linhaDaDefesa('PV máximo sugerido').getByText('49')).toBeInTheDocument();
    expect(screen.getByLabelText('PV máx.')).toHaveValue(40);

    // Subir de nível muda a sugestão sem tocar no PV — é derivada.
    await usuario.clear(screen.getByLabelText('Nível'));
    await usuario.type(screen.getByLabelText('Nível'), '4');
    expect(linhaDaDefesa('PV máximo sugerido').getByText('62')).toBeInTheDocument();
    expect(screen.getByLabelText('PV máx.')).toHaveValue(40);
  });

  it('a ficha não tem um segundo campo de PV do personagem', () => {
    renderizarComProvedores(
      <FichaPersonagem
        personagem={seelah(fichaDeSeelah())}
        podeEditar
        aoFechar={() => undefined}
      />,
    );

    // Os dois únicos campos de PV do personagem são os comuns. As duas entradas da
    // regra ("PV da ancestralidade", "PV da classe por nível") são constantes da
    // ancestralidade e da classe, não os pontos de vida de ninguém.
    const camposDePv = screen
      .getAllByRole('spinbutton')
      .map((campo) => campo.getAttribute('aria-label') ?? '')
      .concat(
        screen
          .getAllByRole('spinbutton')
          .map((campo) => campo.closest('div')?.querySelector('label')?.textContent ?? ''),
      )
      .filter((rotulo) => /^PV/.test(rotulo));

    expect(new Set(camposDePv)).toEqual(
      new Set(['PV atual', 'PV máx.', 'PV da ancestralidade', 'PV da classe por nível']),
    );
    expect(screen.queryByLabelText('PV máximo sugerido')).toBeNull();
  });
});

describe('mesa encerrada congela também as defesas (RV-027)', () => {
  it('a rolagem de salvaguarda trava com o motivo escrito e nada é enviado', async () => {
    const usuario = userEvent.setup();
    renderizarComProvedores(
      <FichaPersonagem
        personagem={seelah(fichaDeSeelah())}
        podeEditar={false}
        motivoBloqueio="Esta mesa foi encerrada."
        aoFechar={() => undefined}
      />,
    );

    const botao = screen.getByRole('button', { name: 'Rolar Reflexos (1d20+6)' });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute('title', 'Esta mesa foi encerrada.');

    await usuario.click(botao);

    expect(requisitarFalso).not.toHaveBeenCalled();
  });

  it('ficha somente leitura não edita grau nem armadura', () => {
    renderizarComProvedores(
      <FichaPersonagem
        personagem={seelah(fichaDeSeelah())}
        podeEditar={false}
        aoFechar={() => undefined}
      />,
    );

    expect(screen.getByLabelText('Grau em Reflexos')).toBeDisabled();
    expect(screen.getByLabelText('Bônus de item da armadura')).toBeDisabled();
    expect(screen.getByLabelText('Atributo-chave da classe')).toBeDisabled();
  });
});

describe('ficha gravada antes deste card (RV-155)', () => {
  /** A metade do sistema como o RV-153 a deixou: sem chave de defesa nenhuma. */
  const FICHA_ANTIGA: DadosFicha = {
    ancestralidade: 'Humana',
    heranca: 'Versátil',
    antecedente: 'Guarda',
    treinamentos: {},
    saberes: [],
  };

  it('abre com as defesas no piso da regra, sem erro e sem número inventado', () => {
    renderizarComProvedores(
      <FichaPersonagem personagem={seelah(FICHA_ANTIGA)} podeEditar aoFechar={() => undefined} />,
    );

    // Chave ausente vale destreinado, que é o piso: CA = 10 + 0 + 1 de Destreza + 0
    // de item. Se aparecer 13, alguém somou o nível de um destreinado.
    expect(linhaDaDefesa('CA').getByText('11')).toBeInTheDocument();
    expect(
      linhaDaDefesa('Reflexos').getByRole('button', { name: 'Rolar Reflexos (1d20+1)' }),
    ).toBeInTheDocument();
    expect(linhaDaDefesa('CD de classe').getByText('—')).toBeInTheDocument();
  });

  it('salvar não inventa as chaves novas — quem aplica o padrão é o schema, na API', async () => {
    const usuario = userEvent.setup();
    const ficha = seelah(FICHA_ANTIGA);
    requisitarFalso.mockResolvedValue(ficha);
    renderizarComProvedores(
      <FichaPersonagem personagem={ficha} podeEditar aoFechar={() => undefined} />,
    );

    await usuario.click(screen.getByRole('button', { name: 'Salvar ficha' }));

    await waitFor(() => expect(requisitarFalso).toHaveBeenCalled());
    const [, opcoes] = requisitarFalso.mock.calls[0] ?? [];
    const corpo = (opcoes as { corpo: { dados: DadosFicha } }).corpo;
    // A ficha vai como veio: escrever `''` num grau que o jogador não tocou seria
    // 400 na API ("Grau de treinamento inválido"), e escrever `destreinado` seria a
    // tela decidindo o padrão do sistema por conta própria.
    expect(corpo.dados).toEqual(FICHA_ANTIGA);
  });
});

describe('os outros sistemas não ganham bloco de defesas (RV-155)', () => {
  it('a ficha de D&D 5e não mostra a seção', () => {
    renderizarComProvedores(
      <FichaPersonagem
        personagem={{
          ...seelah(dadosIniciaisDaFicha('dnd5e')),
          sistema: 'dnd5e',
          atributos: atributosIniciais('dnd5e'),
        }}
        podeEditar
        aoFechar={() => undefined}
      />,
    );

    expect(screen.queryByRole('group', { name: /Defesas calculadas/ })).toBeNull();
    // E a CA de D&D 5e continua sendo o campo informado da seção Combate.
    expect(screen.getByLabelText('Classe de armadura')).toBeInTheDocument();
  });
});
