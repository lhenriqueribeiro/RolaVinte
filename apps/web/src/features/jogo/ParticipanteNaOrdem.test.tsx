import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import {
  atributosIniciais,
  dadosIniciaisDaFicha,
  DELTA_PV_MAXIMO,
  type CenaComTokensDTO,
  type CenaDTO,
  type CombateDTO,
  type PersonagemDTO,
  type TokenDTO,
} from '@rolavinte/shared';
import { renderizarComProvedores } from '@/testes/utilitarios';
import { linhasDeCombate } from './painel-iniciativa';
import { ParticipanteNaOrdem } from './ParticipanteNaOrdem';

/**
 * As ações de uma linha da ordem: rolar iniciativa (RV-061 / RV-158) e aplicar
 * dano ou cura (RV-065).
 *
 * A guarda mais importante deste arquivo é o **corpo** de cada requisição:
 *
 * - a iniciativa de peça com ficha sai com a **chave** da forma de rolar, e nunca
 *   com uma expressão calculada no navegador — o servidor aceitaria a expressão e
 *   a derivação do sistema iria por água abaixo;
 * - o dano sai com `delta` **negativo** e a cura com o positivo, e zero nunca sai
 *   (é 400 no contrato);
 * - `motivo` não viaja, porque é o vazio que faz o servidor escrever
 *   `Iniciativa (Percepção) — Thorin` no chat, dizendo qual regra foi aplicada.
 */

const MESA_ID = 'mesa-1';
const CENA_ID = 'cena-1';
const COMBATE_ID = 'combate-1';

const { requisitarFalso } = vi.hoisted(() => ({
  requisitarFalso: vi.fn<(caminho: string, opcoes?: unknown) => Promise<unknown>>(),
}));

vi.mock('@/lib/api', () => ({
  requisitar: requisitarFalso,
  enviarArquivo: vi.fn(),
  ErroApi: class ErroApi extends Error {},
}));

const CENA: CenaDTO = {
  id: CENA_ID,
  mesaId: MESA_ID,
  nome: 'Cripta',
  larguraGrid: 20,
  alturaGrid: 15,
  corFundo: '#101010',
  ativa: true,
  imagemFundoUrl: null,
  tamanhoCelula: 44,
  gridVisivel: true,
  corGrid: '#3a4a63',
};

function token(campos: Partial<TokenDTO> = {}): TokenDTO {
  return {
    id: 'token-1',
    cenaId: CENA_ID,
    nome: 'Thorin',
    cor: '#c9a227',
    x: 1,
    y: 1,
    personagemId: null,
    imagemUrl: null,
    condicoes: [],
    ...campos,
  };
}

/** Thorin de PF2e com Percepção +9 e Furtividade treinada, 23/30 PV. */
function thorin(campos: Partial<PersonagemDTO> = {}): PersonagemDTO {
  return {
    id: 'p1',
    mesaId: MESA_ID,
    donoId: 'u1',
    donoNome: 'Bruno',
    nome: 'Thorin',
    classe: 'Guerreiro',
    nivel: 3,
    pvAtual: 23,
    pvMax: 30,
    atributos: { ...atributosIniciais('pathfinder2e'), sabedoria: 2, destreza: 3 },
    anotacoes: '',
    sistema: 'pathfinder2e',
    dados: {
      ...dadosIniciaisDaFicha('pathfinder2e'),
      grauPercepcao: 'perito',
      treinamentos: { furtividade: 'treinado' },
    },
    ...campos,
  };
}

function combate(participantes: CombateDTO['participantes']): CombateDTO {
  return {
    id: COMBATE_ID,
    mesaId: MESA_ID,
    cenaId: CENA_ID,
    rodada: 1,
    indiceTurno: 0,
    ativo: true,
    participantes,
    tokenIdDoTurno: participantes[0]?.tokenId ?? null,
  };
}

interface Cenario {
  /** `null` monta o NPC: participante cuja peça não tem ficha. */
  ficha?: PersonagemDTO | null;
  souMestre?: boolean;
  minha?: boolean;
  motivoBloqueio?: string | null;
  queryClient?: QueryClient;
}

function renderizarLinha(cenario: Cenario = {}) {
  const ficha = cenario.ficha === undefined ? thorin() : cenario.ficha;
  const peca = token({ id: 'token-1', personagemId: ficha?.id ?? null });
  const [linha] = linhasDeCombate({
    combate: combate([{ tokenId: 'token-1', nome: 'Thorin', iniciativa: null }]),
    tokens: [peca],
    personagens: ficha ? [ficha] : [],
    meusPersonagemIds: new Set(cenario.minha && ficha ? [ficha.id] : []),
  });
  if (!linha) throw new Error('a linha do participante deveria existir');
  return renderizarComProvedores(
    <ul>
      <ParticipanteNaOrdem
        mesaId={MESA_ID}
        combateId={COMBATE_ID}
        linha={linha}
        souMestre={cenario.souMestre ?? true}
        motivoBloqueio={cenario.motivoBloqueio ?? null}
      />
    </ul>,
    cenario.queryClient ? { queryClient: cenario.queryClient } : {},
  );
}

beforeEach(() => {
  requisitarFalso.mockReset();
  requisitarFalso.mockResolvedValue(thorin());
});

describe('ParticipanteNaOrdem — rolar iniciativa (RV-158)', () => {
  it('peça com ficha manda só o tokenId: quem escolhe a expressão é o servidor', async () => {
    const usuario = userEvent.setup();
    renderizarLinha();

    await usuario.click(screen.getByRole('button', { name: /Rolar/ }));

    await waitFor(() => {
      // Corpo **inteiro** conferido: um `expressao: '1d20+9'` calculado aqui seria
      // aceito pela rota e devolveria ao navegador o poder de escolher a
      // iniciativa. E sem `motivo`, o chat recebe "Iniciativa (Percepção) — Thorin".
      expect(requisitarFalso).toHaveBeenCalledWith(`/combates/${COMBATE_ID}/iniciativa`, {
        metodo: 'POST',
        corpo: { tokenId: 'token-1' },
      });
    });
  });

  it('o seletor mostra as formas que o sistema declara, com a expressão de cada uma', () => {
    renderizarLinha();

    const seletor = screen.getByRole('combobox', { name: 'Como rolar a iniciativa de Thorin' });
    // A padrão é a primeira e vem pré-selecionada como valor vazio — que o
    // servidor lê como "a padrão do sistema".
    expect(seletor).toHaveValue('');
    expect(
      screen.getByRole('option', { name: /Iniciativa \(Percepção\) 1d20\+9/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Iniciativa \(Furtividade\)/ })).toBeInTheDocument();
  });

  it('escolher a alternativa manda a chave `rolagem`, e nada de expressão', async () => {
    const usuario = userEvent.setup();
    renderizarLinha();

    await usuario.selectOptions(
      screen.getByRole('combobox', { name: 'Como rolar a iniciativa de Thorin' }),
      'iniciativa:furtividade',
    );
    await usuario.click(screen.getByRole('button', { name: /Rolar/ }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(`/combates/${COMBATE_ID}/iniciativa`, {
        metodo: 'POST',
        corpo: { tokenId: 'token-1', rolagem: 'iniciativa:furtividade' },
      });
    });
  });

  it('peça sem ficha ganha campo de expressão — e é o único caminho do NPC', async () => {
    const usuario = userEvent.setup();
    renderizarLinha({ ficha: null });

    // Sem seletor: não há sistema a consultar quando não há ficha.
    expect(
      screen.queryByRole('combobox', { name: 'Como rolar a iniciativa de Thorin' }),
    ).not.toBeInTheDocument();
    await usuario.type(screen.getByRole('textbox', { name: 'Iniciativa de Thorin' }), '17');
    await usuario.click(screen.getByRole('button', { name: /Rolar/ }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(`/combates/${COMBATE_ID}/iniciativa`, {
        metodo: 'POST',
        corpo: { tokenId: 'token-1', expressao: '17' },
      });
    });
  });

  it('peça sem ficha e campo vazio deixa o botão travado, dizendo o que falta', () => {
    renderizarLinha({ ficha: null });

    const botao = screen.getByRole('button', { name: /Rolar/ });
    expect(botao).toBeDisabled();
    // Controle desabilitado diz por quê — sem isso o mestre levaria um 400 sem
    // entender que faltava informar o número.
    expect(botao).toHaveAttribute(
      'title',
      'Esta peça não tem ficha: informe o número ou a expressão.',
    );
  });

  it('o jogador rola pela peça do próprio personagem', () => {
    renderizarLinha({ souMestre: false, minha: true });

    expect(screen.getByRole('button', { name: /Rolar/ })).toBeEnabled();
  });

  it('o jogador não recebe botão de rolar na peça de terceiro (o servidor daria 403)', () => {
    renderizarLinha({ souMestre: false, minha: false });

    expect(screen.queryByRole('button', { name: /Rolar/ })).not.toBeInTheDocument();
  });

  it('mesa encerrada trava a rolagem com o motivo à vista', () => {
    renderizarLinha({ motivoBloqueio: 'Esta mesa foi encerrada.' });

    const botao = screen.getByRole('button', { name: /Rolar/ });
    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute('title', 'Esta mesa foi encerrada.');
  });

  it('erro da rota fica visível na linha', async () => {
    const usuario = userEvent.setup();
    requisitarFalso.mockRejectedValueOnce(
      new Error('Você só pode rolar a iniciativa dos seus personagens — o resto é do mestre.'),
    );
    renderizarLinha();

    await usuario.click(screen.getByRole('button', { name: /Rolar/ }));

    expect(
      await screen.findByText(/só pode rolar a iniciativa dos seus personagens/),
    ).toBeInTheDocument();
  });
});

describe('ParticipanteNaOrdem — dano e cura pelo painel (RV-065)', () => {
  async function digitarPv(valor: string) {
    const usuario = userEvent.setup();
    renderizarLinha();
    await usuario.type(screen.getByRole('spinbutton', { name: 'Dano ou cura em Thorin' }), valor);
    return usuario;
  }

  it('o dano viaja como delta negativo', async () => {
    const usuario = await digitarPv('7');

    await usuario.click(screen.getByRole('button', { name: /Dano/ }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(
        `/combates/${COMBATE_ID}/participantes/token-1/pv`,
        { metodo: 'POST', corpo: { delta: -7 } },
      );
    });
  });

  it('a cura viaja como delta positivo, pela mesma rota', async () => {
    const usuario = await digitarPv('8');

    await usuario.click(screen.getByRole('button', { name: /Cura/ }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(
        `/combates/${COMBATE_ID}/participantes/token-1/pv`,
        { metodo: 'POST', corpo: { delta: 8 } },
      );
    });
  });

  it('campo vazio e zero deixam os dois botões travados — zero é 400 no contrato', async () => {
    const usuario = userEvent.setup();
    renderizarLinha();

    expect(screen.getByRole('button', { name: /Dano/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Cura/ })).toBeDisabled();

    await usuario.type(screen.getByRole('spinbutton', { name: 'Dano ou cura em Thorin' }), '0');

    expect(screen.getByRole('button', { name: /Dano/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Cura/ })).toBeDisabled();
    expect(requisitarFalso).not.toHaveBeenCalled();
  });

  it('valor acima do teto do contrato não sai da tela', async () => {
    const usuario = await digitarPv(String(DELTA_PV_MAXIMO + 1));

    expect(screen.getByRole('button', { name: /Dano/ })).toBeDisabled();
    await usuario.click(screen.getByRole('button', { name: /Dano/ }));
    expect(requisitarFalso).not.toHaveBeenCalled();
  });

  it('o PV que voltou remenda a ficha em cache, e a cena é revalidada por causa do inconsciente', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 60_000, staleTime: 60_000 },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData<PersonagemDTO[]>(['personagens', MESA_ID], [thorin({ pvAtual: 23 })]);
    queryClient.setQueryData<CenaComTokensDTO>(['cena', MESA_ID], {
      cena: CENA,
      tokens: [token({ personagemId: 'p1' })],
    });
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');
    requisitarFalso.mockResolvedValue(thorin({ pvAtual: 0 }));

    const usuario = userEvent.setup();
    renderizarLinha({ queryClient });
    await usuario.type(screen.getByRole('spinbutton', { name: 'Dano ou cura em Thorin' }), '30');
    await usuario.click(screen.getByRole('button', { name: /Dano/ }));

    await waitFor(() => {
      // A barra de vida do token e o PV do painel leem daqui: sem o remendo, os dois
      // continuariam mostrando 23/30 até o socket chegar.
      expect(
        queryClient.getQueryData<PersonagemDTO[]>(['personagens', MESA_ID])?.map((p) => p.pvAtual),
      ).toEqual([0]);
    });
    // A cena precisa ser revalidada porque zerar o PV marca `inconsciente` na peça,
    // e essa mudança **não** vem na resposta da rota (ela viaja no token:atualizado).
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['cena', MESA_ID] });
  });

  it('o jogador não recebe controle de PV no painel — o dele é a ficha', () => {
    renderizarLinha({ souMestre: false, minha: true });

    expect(
      screen.queryByRole('spinbutton', { name: 'Dano ou cura em Thorin' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Dano/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cura/ })).not.toBeInTheDocument();
  });

  it('peça sem ficha não oferece dano nem cura: não há PV para somar', () => {
    renderizarLinha({ ficha: null });

    expect(screen.queryByRole('button', { name: /Dano/ })).not.toBeInTheDocument();
    expect(screen.getByText(/sem ficha/)).toBeInTheDocument();
  });

  it('mesa encerrada trava dano e cura com o motivo à vista', async () => {
    const usuario = userEvent.setup();
    renderizarLinha({ motivoBloqueio: 'Esta mesa foi encerrada.' });

    const campo = screen.getByRole('spinbutton', { name: 'Dano ou cura em Thorin' });
    expect(campo).toBeDisabled();
    await usuario.click(screen.getByRole('button', { name: /Dano/ }));
    expect(requisitarFalso).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Dano/ })).toHaveAttribute(
      'title',
      'Esta mesa foi encerrada.',
    );
  });
});

describe('ParticipanteNaOrdem — o turno na linha (DoD do RV-063)', () => {
  it('a peça da vez traz aria-current e a palavra escrita, sem depender de cor', () => {
    const ficha = thorin();
    const [linha] = linhasDeCombate({
      combate: combate([{ tokenId: 'token-1', nome: 'Thorin', iniciativa: 18 }]),
      tokens: [token({ personagemId: ficha.id })],
      personagens: [ficha],
      meusPersonagemIds: new Set([ficha.id]),
    });
    if (!linha) throw new Error('a linha do participante deveria existir');

    renderizarComProvedores(
      <ul>
        <ParticipanteNaOrdem
          mesaId={MESA_ID}
          combateId={COMBATE_ID}
          linha={linha}
          souMestre={false}
          motivoBloqueio={null}
        />
      </ul>,
    );

    const item = screen.getByRole('listitem');
    expect(item).toHaveAttribute('aria-current', 'true');
    // "Sua vez" e não só "Na vez": a peça é minha, e o card pede que a minha vez
    // seja perceptível de um jeito que não se confunda com a vez dos outros.
    expect(item).toHaveTextContent('Sua vez');
  });
});
