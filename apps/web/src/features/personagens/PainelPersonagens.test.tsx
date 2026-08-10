import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PersonagemDTO } from '@rolavinte/shared';
import { criarQueryClientDeTeste, renderizarComProvedores } from '@/testes/utilitarios';
import { useSessao } from '@/features/auth/store-sessao';
import { motivoGestaoTravada, PainelPersonagens } from './PainelPersonagens';

const MESA_ID = 'mesa-1';
const EU = 'u1';

const { requisitarFalso } = vi.hoisted(() => ({
  requisitarFalso: vi.fn<(caminho: string, opcoes?: unknown) => Promise<unknown>>(),
}));

vi.mock('@/lib/api', () => ({
  requisitar: requisitarFalso,
  enviarArquivo: vi.fn(),
  ErroApi: class ErroApi extends Error {},
}));

function personagem(campos: Partial<PersonagemDTO> & { id: string; nome: string }): PersonagemDTO {
  return {
    mesaId: MESA_ID,
    donoId: EU,
    donoNome: 'Ana',
    classe: 'Guerreiro',
    nivel: 3,
    pvAtual: 20,
    pvMax: 30,
    atributos: {
      forca: 10,
      destreza: 10,
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

const THORIN = personagem({ id: 'p1', nome: 'Thorin' });
const GOBLIN = personagem({ id: 'p2', nome: 'Goblin', donoId: 'u2', donoNome: 'Bruno' });

function responderLista(lista: PersonagemDTO[]) {
  requisitarFalso.mockImplementation((caminho) => {
    if (caminho === `/mesas/${MESA_ID}/personagens`) return Promise.resolve(lista);
    return Promise.resolve(undefined);
  });
}

async function montar(
  lista: PersonagemDTO[],
  opcoes: { souMestre?: boolean; motivoBloqueio?: string | null } = {},
) {
  responderLista(lista);
  const queryClient = criarQueryClientDeTeste();
  const resultado = renderizarComProvedores(
    <PainelPersonagens
      mesaId={MESA_ID}
      souMestre={opcoes.souMestre ?? false}
      motivoBloqueio={opcoes.motivoBloqueio ?? null}
    />,
    { queryClient },
  );
  if (lista.length > 0) await screen.findByText(lista[0]!.nome);
  return resultado;
}

beforeEach(() => {
  requisitarFalso.mockReset();
  useSessao.getState().entrar('token', { id: EU, nome: 'Ana', email: 'ana@exemplo.com' });
});

describe('gestão de fichas na lista (RV-093)', () => {
  it('cada ficha oferece abrir, duplicar e excluir com nome acessível próprio', async () => {
    await montar([THORIN]);

    expect(screen.getByRole('button', { name: 'Abrir a ficha de Thorin' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Duplicar Thorin' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Excluir Thorin' })).toBeEnabled();
  });

  it('duplicar manda o POST com corpo vazio — sem ele o cliente HTTP recusa (RV-029)', async () => {
    const usuario = userEvent.setup();
    const copia = personagem({ id: 'p3', nome: 'Thorin (cópia)' });
    await montar([THORIN]);
    requisitarFalso.mockImplementation((caminho) => {
      if (caminho === `/mesas/${MESA_ID}/personagens`) return Promise.resolve([THORIN, copia]);
      return Promise.resolve(copia);
    });

    await usuario.click(screen.getByRole('button', { name: 'Duplicar Thorin' }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith('/personagens/p1/duplicar', {
        metodo: 'POST',
        corpo: {},
      });
    });
    expect(await screen.findByText('Cópia criada: Thorin (cópia).')).toBeInTheDocument();
  });

  it('criar não manda atributo nenhum: o padrão é da escala do sistema (RV-098)', async () => {
    // O formulário mandava seis 10 fixos, o padrão do d20 clássico. Numa mesa de
    // PF2e, cuja escala vai de -5 a +8, isso significa "+10 em tudo" e devolve
    // 400 — a interface não pode escolher o padrão de um sistema que ela não
    // conhece. Quem decide é a definição, na api.
    const usuario = userEvent.setup();
    await montar([]);

    await usuario.click(screen.getByRole('button', { name: '+ Novo personagem' }));
    await usuario.type(screen.getByLabelText('Nome'), 'Seelah');
    await usuario.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(`/mesas/${MESA_ID}/personagens`, {
        metodo: 'POST',
        corpo: { nome: 'Seelah', classe: '', nivel: 1, pvMax: 10, anotacoes: '' },
      });
    });
  });
});

describe('exclusão pede confirmação em diálogo acessível (RV-093)', () => {
  it('o diálogo é modal, recebe o foco e não envia nada enquanto não se confirma', async () => {
    const usuario = userEvent.setup();
    await montar([THORIN]);

    await usuario.click(screen.getByRole('button', { name: 'Excluir Thorin' }));

    const dialogo = screen.getByRole('dialog');
    expect(dialogo).toHaveAttribute('aria-modal', 'true');
    expect(dialogo).toHaveTextContent('Excluir personagem');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    expect(requisitarFalso).not.toHaveBeenCalledWith('/personagens/p1', expect.anything());
  });

  it('o aviso sobre o token vinculado está na confirmação, e não promete tempo real', async () => {
    const usuario = userEvent.setup();
    await montar([THORIN]);

    await usuario.click(screen.getByRole('button', { name: 'Excluir Thorin' }));

    const dialogo = screen.getByRole('dialog');
    // O token sobrevive desvinculado: quem confirma precisa saber disso antes.
    expect(dialogo).toHaveTextContent('continuam no mapa');
    expect(dialogo).toHaveTextContent('sem barra de vida');
    // Não há evento de tempo real para exclusão de ficha — o texto diz a
    // verdade em vez de prometer que some para todos na hora.
    expect(dialogo).toHaveTextContent('ao recarregar a página');
  });

  it('Esc fecha sem excluir', async () => {
    const usuario = userEvent.setup();
    await montar([THORIN]);

    await usuario.click(screen.getByRole('button', { name: 'Excluir Thorin' }));
    await usuario.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(requisitarFalso).not.toHaveBeenCalledWith('/personagens/p1', expect.anything());
  });

  it('confirmar dispara o DELETE e invalida a lista e a cena', async () => {
    const usuario = userEvent.setup();
    const { queryClient } = await montar([THORIN]);
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries');

    await usuario.click(screen.getByRole('button', { name: 'Excluir Thorin' }));
    await usuario.click(screen.getByRole('button', { name: 'Excluir personagem' }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith('/personagens/p1', { metodo: 'DELETE' });
    });
    await waitFor(() => {
      expect(invalidar).toHaveBeenCalledWith({ queryKey: ['personagens', MESA_ID] });
      // A cena entra porque `tokens.personagem_id` vira nulo no banco: sem o
      // refetch o tabletop continuaria com o vínculo morto em cache.
      expect(invalidar).toHaveBeenCalledWith({ queryKey: ['cena', MESA_ID] });
    });
    expect(await screen.findByText('A ficha de Thorin foi excluída.')).toBeInTheDocument();
  });

  it('a recusa da API aparece em PT-BR dentro do próprio diálogo', async () => {
    const usuario = userEvent.setup();
    await montar([THORIN]);
    requisitarFalso.mockRejectedValue(new Error('Esta mesa foi encerrada e está somente leitura.'));

    await usuario.click(screen.getByRole('button', { name: 'Excluir Thorin' }));
    await usuario.click(screen.getByRole('button', { name: 'Excluir personagem' }));

    expect(
      await screen.findByText('Esta mesa foi encerrada e está somente leitura.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('quem pode gerenciar a ficha (RV-093)', () => {
  it('jogador não mexe na ficha de outro, e o motivo fica escrito ao lado', async () => {
    await montar([GOBLIN]);

    expect(screen.getByRole('button', { name: 'Excluir Goblin' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Duplicar Goblin' })).toBeDisabled();
    expect(
      screen.getByText('Só o dono da ficha ou o mestre da mesa podem excluir ou duplicar.'),
    ).toBeInTheDocument();
  });

  it('o mestre gerencia a ficha de qualquer jogador da mesa', async () => {
    await montar([GOBLIN], { souMestre: true });

    expect(screen.getByRole('button', { name: 'Excluir Goblin' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Duplicar Goblin' })).toBeEnabled();
  });

  it('a regra do botão travado é pura e o encerramento tem precedência', () => {
    expect(motivoGestaoTravada(true, null)).toBeNull();
    expect(motivoGestaoTravada(false, null)).toBe(
      'Só o dono da ficha ou o mestre da mesa podem excluir ou duplicar.',
    );
    expect(motivoGestaoTravada(true, 'Mesa encerrada.')).toBe('Mesa encerrada.');
    expect(motivoGestaoTravada(false, 'Mesa encerrada.')).toBe('Mesa encerrada.');
  });
});

describe('mesa encerrada congela também a gestão (RV-027)', () => {
  it('excluir, duplicar e criar ficam travados com o motivo por escrito', async () => {
    await montar([THORIN], { souMestre: true, motivoBloqueio: 'Esta mesa foi encerrada.' });

    expect(screen.getByRole('button', { name: 'Excluir Thorin' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Duplicar Thorin' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '+ Novo personagem' })).toBeDisabled();
    expect(screen.getByText(/Esta mesa foi encerrada\./)).toBeInTheDocument();
  });
});
