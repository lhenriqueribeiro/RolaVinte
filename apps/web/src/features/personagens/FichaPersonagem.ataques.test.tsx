import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  atributosIniciais,
  dadosIniciaisDaFicha,
  LIMITE_ATAQUES,
  type DadosFicha,
  type PersonagemDTO,
} from '@rolavinte/shared';
import { renderizarComProvedores } from '@/testes/utilitarios';
import { FichaPersonagem } from './FichaPersonagem';

/**
 * Ataques com penalidade de ataques múltiplos na ficha (RV-156).
 *
 * O que este arquivo prova, e nenhum teste puro alcança: que a expressão que
 * `@rolavinte/shared` calcula é **a mesma** que o botão publica, que acerto e dano
 * saem como **duas** requisições, e que **só o acerto leva CD** — a rolagem de dano
 * não pode carregar `cd`, porque dano não é checado contra CD.
 *
 * Nenhuma conta é refeita aqui: as três expressões estão escritas à mão, como o
 * jogador as somaria na mesa. Se o componente passar a fazer aritmética, é aqui que
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

/** Espada longa comum e adaga ágil, os dois com +9 — o cenário do card. */
const ESPADA = { nome: 'Espada longa', bonusAcerto: 9, dano: '1d8+4', agil: false };
const ADAGA = { nome: 'Adaga', bonusAcerto: 9, dano: '1d4+4', agil: true };

function fichaComAtaques(ataques: unknown[], extra: DadosFicha = {}): DadosFicha {
  return { ...dadosIniciaisDaFicha('pathfinder2e'), ataques, ...extra };
}

function seelah(dados: DadosFicha): PersonagemDTO {
  return {
    id: 'p1',
    mesaId: MESA_ID,
    donoId: 'u1',
    donoNome: 'Bruno',
    nome: 'Seelah',
    classe: 'Paladina',
    nivel: 3,
    pvAtual: 40,
    pvMax: 40,
    atributos: atributosIniciais('pathfinder2e'),
    anotacoes: '',
    sistema: 'pathfinder2e',
    dados,
  };
}

function renderizar(dados: DadosFicha, opcoes: { podeEditar?: boolean; bloqueio?: string } = {}) {
  renderizarComProvedores(
    <FichaPersonagem
      personagem={seelah(dados)}
      podeEditar={opcoes.podeEditar ?? true}
      motivoBloqueio={opcoes.bloqueio ?? null}
      aoFechar={() => undefined}
    />,
  );
}

function blocoDeAtaques() {
  return within(screen.getByRole('group', { name: /^Ataques/ }));
}

function linhaDoAtaque(nome: string) {
  const linha = blocoDeAtaques().getByText(nome).closest('li');
  expect(linha, `o ataque "${nome}" não está na tela`).not.toBeNull();
  return within(linha as HTMLElement);
}

/** O corpo da última requisição de rolagem. */
function ultimaRolagem(): Record<string, unknown> {
  const chamadas = requisitarFalso.mock.calls.filter(([caminho]) => caminho.endsWith('/rolagens'));
  const ultima = chamadas.at(-1);
  expect(ultima, 'nenhuma rolagem foi publicada').toBeDefined();
  return (ultima?.[1] as { corpo: Record<string, unknown> }).corpo;
}

function rolagensPublicadas(): Record<string, unknown>[] {
  return requisitarFalso.mock.calls
    .filter(([caminho]) => caminho.endsWith('/rolagens'))
    .map(([, opcoes]) => (opcoes as { corpo: Record<string, unknown> }).corpo);
}

beforeEach(() => {
  requisitarFalso.mockReset();
  requisitarFalso.mockResolvedValue(undefined);
});

describe('os três botões de acerto (RV-156)', () => {
  it('a espada longa publica 1d20+9, 1d20+4 e 1d20-1, cada um nomeando a ordem', async () => {
    const usuario = userEvent.setup();
    renderizar(fichaComAtaques([ESPADA]));
    const linha = linhaDoAtaque('Espada longa');

    for (const [rotulo, expressao] of [
      ['1º ataque', '1d20+9'],
      ['2º ataque (-5)', '1d20+4'],
      ['3º ataque ou mais (-10)', '1d20-1'],
    ] as const) {
      await usuario.click(
        linha.getByRole('button', { name: `Rolar ${rotulo} de Espada longa (${expressao})` }),
      );
      await waitFor(() => {
        expect(ultimaRolagem()).toEqual({
          expressao,
          motivo: `Espada longa (${rotulo}) — Seelah`,
        });
      });
    }

    expect(rolagensPublicadas()).toHaveLength(3);
  });

  it('a adaga ágil publica 1d20+5 no segundo e 1d20+1 no terceiro', async () => {
    const usuario = userEvent.setup();
    renderizar(fichaComAtaques([ADAGA]));
    const linha = linhaDoAtaque('Adaga');

    await usuario.click(
      linha.getByRole('button', { name: 'Rolar 2º ataque (-4) de Adaga (1d20+5)' }),
    );
    await waitFor(() => expect(ultimaRolagem()['expressao']).toBe('1d20+5'));

    await usuario.click(
      linha.getByRole('button', { name: 'Rolar 3º ataque ou mais (-8) de Adaga (1d20+1)' }),
    );
    await waitFor(() => expect(ultimaRolagem()['expressao']).toBe('1d20+1'));
  });

  it('a penalidade é da arma daquele ataque: -4 na adaga, -5 na espada, na mesma ficha', async () => {
    const usuario = userEvent.setup();
    renderizar(fichaComAtaques([ESPADA, ADAGA]));

    // O cenário do card: o primeiro golpe foi com a espada, o segundo com a adaga. Não
    // há contador — as duas linhas mostram a penalidade da própria arma ao mesmo
    // tempo, e é o jogador que escolhe qual está usando.
    await usuario.click(
      linhaDoAtaque('Espada longa').getByRole('button', {
        name: 'Rolar 2º ataque (-5) de Espada longa (1d20+4)',
      }),
    );
    await waitFor(() => expect(ultimaRolagem()['expressao']).toBe('1d20+4'));

    await usuario.click(
      linhaDoAtaque('Adaga').getByRole('button', {
        name: 'Rolar 2º ataque (-4) de Adaga (1d20+5)',
      }),
    );
    await waitFor(() => expect(ultimaRolagem()['expressao']).toBe('1d20+5'));
  });

  it('clicar duas vezes no mesmo botão publica a mesma expressão: não há contador em lado nenhum', async () => {
    const usuario = userEvent.setup();
    renderizar(fichaComAtaques([ESPADA]));
    const botao = linhaDoAtaque('Espada longa').getByRole('button', {
      name: 'Rolar 1º ataque de Espada longa (1d20+9)',
    });

    await usuario.click(botao);
    await usuario.click(botao);

    // Se a tela contasse ataques, o segundo clique sairia como 1d20+4 — que é
    // justamente o estado que ninguém saberia zerar.
    await waitFor(() => expect(rolagensPublicadas()).toHaveLength(2));
    expect(rolagensPublicadas().map((corpo) => corpo['expressao'])).toEqual(['1d20+9', '1d20+9']);
  });

  it('marcar a arma como ágil troca as expressões antes de salvar', async () => {
    const usuario = userEvent.setup();
    renderizar(fichaComAtaques([ESPADA]));

    expect(
      linhaDoAtaque('Espada longa').getByRole('button', {
        name: 'Rolar 2º ataque (-5) de Espada longa (1d20+4)',
      }),
    ).toBeInTheDocument();

    await usuario.click(linhaDoAtaque('Espada longa').getByLabelText('Arma ágil'));

    // -4 em vez de -5, e sem passar pela API: o botão rola o que está na tela.
    expect(
      linhaDoAtaque('Espada longa').getByRole('button', {
        name: 'Rolar 2º ataque (-4) de Espada longa (1d20+5)',
      }),
    ).toBeInTheDocument();
  });

  it('o `title` explica a composição do número, sem cor nem adivinhação', async () => {
    renderizar(fichaComAtaques([ESPADA]));

    expect(
      linhaDoAtaque('Espada longa').getByRole('button', {
        name: 'Rolar 2º ataque (-5) de Espada longa (1d20+4)',
      }),
    ).toHaveAttribute('title', '+9 informado, penalidade -5 do 2º ataque = +4.');
  });
});

describe('a CA do alvo e o grau de sucesso (RV-156 × RV-154)', () => {
  it('informada, o acerto viaja com `cd`; o dano, nunca', async () => {
    const usuario = userEvent.setup();
    renderizar(fichaComAtaques([ESPADA]));

    await usuario.type(blocoDeAtaques().getByLabelText('CA do alvo'), '18');
    await usuario.click(
      linhaDoAtaque('Espada longa').getByRole('button', {
        name: 'Rolar 1º ataque de Espada longa (1d20+9)',
      }),
    );

    await waitFor(() => {
      expect(ultimaRolagem()).toEqual({
        expressao: '1d20+9',
        motivo: 'Espada longa (1º ataque) — Seelah',
        cd: 18,
      });
    });

    // O dano sai **sem** a chave `cd`, mesmo com a CA preenchida na tela: grau é de
    // checagem, e dano não é checado. Um `cd` aqui faria o chat dizer "Falha" num
    // 1d8+4.
    await usuario.click(
      linhaDoAtaque('Espada longa').getByRole('button', {
        name: 'Rolar Dano 1d8+4 de Espada longa (1d8+4)',
      }),
    );
    await waitFor(() => {
      expect(ultimaRolagem()).toEqual({
        expressao: '1d8+4',
        motivo: 'Dano de Espada longa — Seelah',
      });
    });
    expect('cd' in ultimaRolagem()).toBe(false);
  });

  it('em branco, o acerto sai sem `cd` — não existe CD padrão', async () => {
    const usuario = userEvent.setup();
    renderizar(fichaComAtaques([ESPADA]));

    await usuario.click(
      linhaDoAtaque('Espada longa').getByRole('button', {
        name: 'Rolar 1º ataque de Espada longa (1d20+9)',
      }),
    );

    await waitFor(() => expect('cd' in ultimaRolagem()).toBe(false));
  });

  it('CA fora da faixa não vira 400: a rolagem sai, só não sai o grau', async () => {
    const usuario = userEvent.setup();
    renderizar(fichaComAtaques([ESPADA]));

    await usuario.type(blocoDeAtaques().getByLabelText('CA do alvo'), '200');
    await usuario.click(
      linhaDoAtaque('Espada longa').getByRole('button', {
        name: 'Rolar 1º ataque de Espada longa (1d20+9)',
      }),
    );

    await waitFor(() => expect(ultimaRolagem()['expressao']).toBe('1d20+9'));
    expect('cd' in ultimaRolagem()).toBe(false);
  });

  it('a CA do alvo não é gravada na ficha — ela é do inimigo, não do personagem', async () => {
    const usuario = userEvent.setup();
    const ficha = fichaComAtaques([ESPADA]);
    requisitarFalso.mockResolvedValue(seelah(ficha));
    renderizar(ficha);

    await usuario.type(blocoDeAtaques().getByLabelText('CA do alvo'), '18');
    await usuario.click(screen.getByRole('button', { name: 'Salvar ficha' }));

    await waitFor(() => expect(requisitarFalso).toHaveBeenCalled());
    const corpo = (requisitarFalso.mock.calls[0]?.[1] as { corpo: { dados: DadosFicha } }).corpo;
    for (const chave of Object.keys(corpo.dados)) {
      expect(chave.toLocaleLowerCase('pt-BR'), 'a CA do alvo foi gravada').not.toContain('alvo');
    }
    expect(corpo.dados['ataques']).toEqual([ESPADA]);
  });
});

describe('dano: duas rolagens, e a dobrada só com clique', () => {
  it('o dano dobrado é um botão distinto, rotulado, e nada é dobrado sozinho', async () => {
    const usuario = userEvent.setup();
    renderizar(fichaComAtaques([ESPADA]));
    const linha = linhaDoAtaque('Espada longa');

    // Renderizar não publica nada: a ficha não rola por conta própria.
    expect(rolagensPublicadas()).toHaveLength(0);

    // O dano normal publica **uma** rolagem, e é a normal: a variante dobrada não
    // pega carona nela. (Esta asserção nasceu de um experimento — sem ela, dobrar de
    // carona no dano normal passava, porque o teste só olhava o clique na dobrada.)
    await usuario.click(
      linha.getByRole('button', { name: 'Rolar Dano 1d8+4 de Espada longa (1d8+4)' }),
    );
    await waitFor(() => expect(rolagensPublicadas()).toHaveLength(1));
    expect(rolagensPublicadas()[0]?.['expressao']).toBe('1d8+4');

    const dobrado = linha.getByRole('button', {
      name: 'Rolar Dano dobrado (crítico) de Espada longa (1d8+4+1d8+4)',
    });
    await usuario.click(dobrado);

    await waitFor(() => {
      expect(ultimaRolagem()).toEqual({
        expressao: '1d8+4+1d8+4',
        motivo: 'Dano dobrado de Espada longa (sucesso crítico) — Seelah',
      });
    });
    // Uma rolagem por clique: dois cliques, duas mensagens — nunca três.
    expect(rolagensPublicadas()).toHaveLength(2);
  });

  it('a seção diz que o crítico dobra o dano e que o clique é do jogador — e não diz "automático"', () => {
    renderizar(fichaComAtaques([ESPADA]));
    const bloco = blocoDeAtaques();

    expect(bloco.getByText(/Você escolhe qual golpe do turno/)).toBeInTheDocument();
    expect(bloco.getByText(/não conta os seus ataques/)).toBeInTheDocument();
    expect(bloco.getByText(/O dano dobra/)).toBeInTheDocument();
    expect(bloco.queryByText(/autom[áa]tic/i)).toBeNull();
  });
});

describe('bordas: o que falta aparece em texto, e nada é publicado', () => {
  it('ataque sem bônus informado deixa os três botões desabilitados com o motivo escrito', async () => {
    const usuario = userEvent.setup();
    renderizar(fichaComAtaques([{ ...ESPADA, bonusAcerto: null }]));
    const linha = linhaDoAtaque('Espada longa');

    for (const rotulo of ['1º ataque', '2º ataque (-5)', '3º ataque ou mais (-10)']) {
      const botao = linha.getByRole('button', { name: `Rolar ${rotulo} de Espada longa` });
      expect(botao, rotulo).toBeDisabled();
      await usuario.click(botao);
    }

    // O motivo em texto visível, e não só no `title`: controle desabilitado sem
    // explicação é pior que controle ausente.
    expect(linha.getByText(/Informe o bônus de acerto deste ataque/)).toBeInTheDocument();
    expect(rolagensPublicadas()).toHaveLength(0);
    // E o dano continua rolável: são coisas independentes.
    expect(
      linha.getByRole('button', { name: 'Rolar Dano 1d8+4 de Espada longa (1d8+4)' }),
    ).toBeEnabled();
  });

  it('ataque sem dano informado desabilita as duas variantes de dano, com o motivo', () => {
    renderizar(fichaComAtaques([{ ...ESPADA, dano: '' }]));
    const linha = linhaDoAtaque('Espada longa');

    expect(linha.getByRole('button', { name: 'Rolar Dano de Espada longa' })).toBeDisabled();
    expect(
      linha.getByRole('button', { name: 'Rolar Dano dobrado (crítico) de Espada longa' }),
    ).toBeDisabled();
    expect(linha.getByText(/Informe a expressão de dano/)).toBeInTheDocument();
    expect(
      linha.getByRole('button', { name: 'Rolar 1º ataque de Espada longa (1d20+9)' }),
    ).toBeEnabled();
  });

  it('a ficha sem ataque nenhum mostra a seção e o caminho para criar o primeiro', () => {
    renderizar(dadosIniciaisDaFicha('pathfinder2e'));
    const bloco = blocoDeAtaques();

    expect(bloco.getByLabelText('Nome do ataque novo')).toBeInTheDocument();
    const adicionar = bloco.getByRole('button', { name: 'Adicionar ataque' });
    expect(adicionar).toBeDisabled();
    expect(adicionar).toHaveAttribute('title', 'Informe o nome do ataque antes de adicionar.');
  });
});

describe('criar, editar e remover ataques', () => {
  it('o jogador cria um ataque e ele aparece com os três botões desabilitados até ter bônus', async () => {
    const usuario = userEvent.setup();
    renderizar(dadosIniciaisDaFicha('pathfinder2e'));

    await usuario.type(blocoDeAtaques().getByLabelText('Nome do ataque novo'), 'Machado');
    await usuario.click(blocoDeAtaques().getByRole('button', { name: 'Adicionar ataque' }));

    const linha = linhaDoAtaque('Machado');
    expect(linha.getByRole('button', { name: 'Rolar 1º ataque de Machado' })).toBeDisabled();

    // Informar o bônus habilita os três, com a penalidade já aplicada.
    await usuario.type(linha.getByLabelText('Bônus de acerto'), '7');
    expect(
      linhaDoAtaque('Machado').getByRole('button', {
        name: 'Rolar 2º ataque (-5) de Machado (1d20+2)',
      }),
    ).toBeEnabled();
  });

  it('salvar manda os campos informados e nenhum número derivado', async () => {
    const usuario = userEvent.setup();
    const ficha = fichaComAtaques([ESPADA]);
    requisitarFalso.mockResolvedValue(seelah(ficha));
    renderizar(ficha);

    await usuario.click(linhaDoAtaque('Espada longa').getByLabelText('Arma ágil'));
    await usuario.click(screen.getByRole('button', { name: 'Salvar ficha' }));

    await waitFor(() => expect(requisitarFalso).toHaveBeenCalled());
    const corpo = (requisitarFalso.mock.calls[0]?.[1] as { corpo: { dados: DadosFicha } }).corpo;
    const gravados = corpo.dados['ataques'] as Record<string, unknown>[];

    expect(gravados).toEqual([{ ...ESPADA, agil: true }]);
    // A penalidade e o bônus já penalizado são conta, não campo: gravá-los congelaria
    // o -5 de uma arma que acabou de virar ágil.
    for (const chave of ['penalidade', 'ordem', 'acerto', 'bonusComPenalidade']) {
      expect(chave in (gravados[0] ?? {}), `\`${chave}\` foi gravado`).toBe(false);
    }
  });

  it('remover apaga só aquele ataque', async () => {
    const usuario = userEvent.setup();
    renderizar(fichaComAtaques([ESPADA, ADAGA]));

    await usuario.click(blocoDeAtaques().getByRole('button', { name: 'Remover Espada longa' }));

    expect(blocoDeAtaques().queryByText('Espada longa')).toBeNull();
    expect(blocoDeAtaques().getByText('Adaga')).toBeInTheDocument();
  });

  it('no teto, o botão de adicionar fica desabilitado dizendo o máximo', () => {
    const cheia = Array.from({ length: LIMITE_ATAQUES }, (_, i) => ({
      nome: `Golpe ${i}`,
      bonusAcerto: 1,
      dano: '1d4',
      agil: false,
    }));
    renderizar(fichaComAtaques(cheia));

    const adicionar = blocoDeAtaques().getByRole('button', { name: 'Adicionar ataque' });
    expect(adicionar).toBeDisabled();
    expect(adicionar).toHaveAttribute(
      'title',
      `Esta ficha já tem o máximo de ${LIMITE_ATAQUES} ataques.`,
    );
    expect(blocoDeAtaques().getByText(/Remova um para acrescentar outro/)).toBeInTheDocument();
  });
});

describe('mesa encerrada e ficha somente leitura (RV-027)', () => {
  it('mesa encerrada trava acerto e dano com o motivo, e nada é enviado', async () => {
    const usuario = userEvent.setup();
    renderizar(fichaComAtaques([ESPADA]), {
      podeEditar: false,
      bloqueio: 'Esta mesa foi encerrada.',
    });
    const linha = linhaDoAtaque('Espada longa');

    const acerto = linha.getByRole('button', { name: 'Rolar 1º ataque de Espada longa (1d20+9)' });
    const dano = linha.getByRole('button', { name: 'Rolar Dano 1d8+4 de Espada longa (1d8+4)' });
    expect(acerto).toBeDisabled();
    expect(acerto).toHaveAttribute('title', 'Esta mesa foi encerrada.');
    expect(dano).toBeDisabled();

    await usuario.click(acerto);
    await usuario.click(dano);

    expect(rolagensPublicadas()).toHaveLength(0);
  });

  it('ficha somente leitura não edita ataque nem acrescenta um novo', () => {
    renderizar(fichaComAtaques([ESPADA]), { podeEditar: false });
    const linha = linhaDoAtaque('Espada longa');

    expect(linha.getByLabelText('Nome do ataque')).toBeDisabled();
    expect(linha.getByLabelText('Bônus de acerto')).toBeDisabled();
    expect(linha.getByLabelText('Arma ágil')).toBeDisabled();
    expect(linha.getByRole('button', { name: 'Remover Espada longa' })).toBeDisabled();

    const adicionar = blocoDeAtaques().getByRole('button', { name: 'Adicionar ataque' });
    expect(adicionar).toBeDisabled();
    expect(adicionar).toHaveAttribute('title', 'Ficha somente leitura.');
  });

  it('sem poder editar, o acerto continua rolável — somente leitura não é "sem dado"', () => {
    // A mesma correção de escopo do RV-155: "não editável" e "sem botão de dado" são
    // coisas diferentes. Um jogador olhando a ficha de outro não a altera, mas o
    // mestre rolando pela ficha de um NPC precisa do dado.
    renderizar(fichaComAtaques([ESPADA]), { podeEditar: false });

    expect(
      linhaDoAtaque('Espada longa').getByRole('button', {
        name: 'Rolar 1º ataque de Espada longa (1d20+9)',
      }),
    ).toBeEnabled();
  });
});

describe('os outros sistemas não ganham seção de ataques (RV-156)', () => {
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

    // D&D 5e não tem penalidade de ataques múltiplos: oferecer os três botões aqui
    // aplicaria −5 a um golpe que não sofre nada. Os ataques dele são o RV-092.
    expect(screen.queryByRole('group', { name: /^Ataques/ })).toBeNull();
    expect(screen.queryByLabelText('CA do alvo')).toBeNull();
  });
});
