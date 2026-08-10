import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MensagemDTO, MesaDetalheDTO } from '@rolavinte/shared';
import { renderizarComProvedores } from '@/testes/utilitarios';
import { useSessao } from '@/features/auth/store-sessao';
import { Chat } from './Chat';

const MESA_ID = 'mesa-1';
const EU = { id: 'u1', nome: 'Aria', email: 'aria@mesa.rpg' };
const OUTRA_PESSOA = { id: 'u2', nome: 'Dado', email: 'dado@mesa.rpg' };

const { requisitarFalso } = vi.hoisted(() => ({
  requisitarFalso: vi.fn<(caminho: string, opcoes?: unknown) => Promise<unknown>>(),
}));

vi.mock('@/lib/api', () => ({
  requisitar: requisitarFalso,
  ErroApi: class ErroApi extends Error {},
}));

const FALA: MensagemDTO = {
  id: 'm1',
  mesaId: MESA_ID,
  autorId: 'u1',
  autorNome: 'Aria',
  tipo: 'fala',
  conteudo: 'Abro a porta com cuidado.',
  rolagem: null,
  motivo: null,
  criadoEm: '2026-08-09T12:00:00.000Z',
  destinatarioId: null,
  destinatarioNome: null,
  avaliacao: null,
};

function mesaComPapel(meuPapel: 'mestre' | 'jogador'): MesaDetalheDTO {
  return {
    id: MESA_ID,
    nome: 'A Cripta',
    descricao: '',
    sistema: 'generico',
    mestreId: 'u9',
    mestreNome: 'Mestra',
    meuPapel,
    totalJogadores: 2,
    criadoEm: '2026-08-09T10:00:00.000Z',
    encerradaEm: null,
    jogadores: [],
  };
}

/**
 * O `Chat` lê duas queries: o histórico e a mesa (para saber se sou mestre, o
 * que decide o aviso de `/oculto`). O duplo despacha por caminho em vez de por
 * "tem opções ou não" — assim um teste pode trocar o papel sem tocar no resto.
 */
function responderApi(papel: 'mestre' | 'jogador' = 'jogador', historico: MensagemDTO[] = [FALA]) {
  requisitarFalso.mockImplementation((caminho, opcoes) => {
    if (opcoes === undefined && caminho === `/mesas/${MESA_ID}`) {
      return Promise.resolve(mesaComPapel(papel));
    }
    if (opcoes === undefined) return Promise.resolve(historico);
    return Promise.resolve(FALA);
  });
}

beforeEach(() => {
  requisitarFalso.mockReset();
  responderApi();
  useSessao.setState({ token: 'jwt', usuario: EU });
});

async function abrirChat(papel: 'mestre' | 'jogador' = 'jogador', historico?: MensagemDTO[]) {
  responderApi(papel, historico);
  const usuario = userEvent.setup();
  renderizarComProvedores(<Chat mesaId={MESA_ID} />);
  const campo = await screen.findByLabelText('Mensagem');
  return { usuario, campo };
}

/** Envia a linha exatamente como digitada — é o contrato do RV-074. */
function chamadaDeChat(texto: string) {
  return [`/mesas/${MESA_ID}/chat`, { metodo: 'POST', corpo: { texto } }] as const;
}

describe('Chat da mesa', () => {
  it('mostra o histórico carregado da API', async () => {
    await abrirChat();

    expect(await screen.findByText('Abro a porta com cuidado.')).toBeInTheDocument();
  });

  it('texto comum vai cru para a rota única de chat', async () => {
    const { usuario, campo } = await abrirChat();

    await usuario.type(campo, 'Abro a porta com cuidado.');
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(...chamadaDeChat('Abro a porta com cuidado.'));
    });
  });

  it('o comando /r não é interpretado no cliente: a linha inteira vai para /chat', async () => {
    const { usuario, campo } = await abrirChat();

    await usuario.type(campo, '/r 2d20kh1+5 # ataque com vantagem');
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(
        ...chamadaDeChat('/r 2d20kh1+5 # ataque com vantagem'),
      );
    });
    // As rotas antigas continuam existindo na API, mas o chat não fala mais com
    // elas: era por ali que a segunda gramática (o regex local) entrava.
    for (const rotaAntiga of ['/mensagens', '/rolagens']) {
      expect(requisitarFalso).not.toHaveBeenCalledWith(
        `/mesas/${MESA_ID}${rotaAntiga}`,
        expect.objectContaining({ metodo: 'POST' }),
      );
    }
  });

  it('o comando /rolar chega ao servidor sem ser reescrito', async () => {
    const { usuario, campo } = await abrirChat();

    await usuario.type(campo, '/rolar 4d6kh3');
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(...chamadaDeChat('/rolar 4d6kh3'));
    });
  });

  it('não envia nada quando o campo só tem espaços', async () => {
    const { usuario, campo } = await abrirChat();

    await usuario.type(campo, '   ');
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(requisitarFalso).not.toHaveBeenCalledWith(
      expect.stringContaining('/chat'),
      expect.anything(),
    );
  });

  it('"e/ou tanto faz" é fala, não comando', async () => {
    const { usuario, campo } = await abrirChat();

    await usuario.type(campo, 'e/ou tanto faz');
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(...chamadaDeChat('e/ou tanto faz'));
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Chat — avisos do parser antes de gastar uma requisição (RV-074)', () => {
  it('comando inexistente mostra o aviso do parser e não chama a API', async () => {
    const { usuario, campo } = await abrirChat();

    await usuario.type(campo, '/banana 1d20');
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent('"/banana" não é um comando');
    // O aviso lista os comandos disponíveis, vindos do registry compartilhado.
    expect(aviso).toHaveTextContent('/sussurro @Nome mensagem');
    expect(requisitarFalso).not.toHaveBeenCalledWith(`/mesas/${MESA_ID}/chat`, expect.anything());
  });

  it('comando incompleto (/r sem expressão) avisa sem enviar', async () => {
    const { usuario, campo } = await abrirChat();

    await usuario.type(campo, '/r');
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Informe a expressão de dados');
    expect(requisitarFalso).not.toHaveBeenCalledWith(`/mesas/${MESA_ID}/chat`, expect.anything());
  });

  it('o texto do campo é preservado quando o comando é recusado localmente', async () => {
    const { usuario, campo } = await abrirChat();

    await usuario.type(campo, '/sussurro @Dado');
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(campo).toHaveValue('/sussurro @Dado');
  });
});

describe('Chat — rolagem oculta é do mestre (RV-071)', () => {
  it('jogador é avisado e a requisição nem sai', async () => {
    const { usuario, campo } = await abrirChat('jogador');

    await usuario.type(campo, '/oculto 1d20+5');
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A rolagem oculta é exclusiva do mestre desta mesa.',
    );
    expect(requisitarFalso).not.toHaveBeenCalledWith(`/mesas/${MESA_ID}/chat`, expect.anything());
  });

  it('mestre envia /oculto normalmente', async () => {
    const { usuario, campo } = await abrirChat('mestre');

    await usuario.type(campo, '/gm 1d20+5');
    await usuario.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(...chamadaDeChat('/gm 1d20+5'));
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Chat — privacidade visível na conversa (RV-070, RV-071)', () => {
  const SUSSURRO_QUE_ENVIEI: MensagemDTO = {
    ...FALA,
    id: 'm2',
    tipo: 'sussurro',
    conteudo: 'Vou roubar a chave enquanto ele fala.',
    autorId: EU.id,
    autorNome: EU.nome,
    destinatarioId: OUTRA_PESSOA.id,
    destinatarioNome: OUTRA_PESSOA.nome,
  };

  it('sussurro que enviei diz para quem foi', async () => {
    await abrirChat('jogador', [SUSSURRO_QUE_ENVIEI]);

    expect(await screen.findByText(`Sussurro para ${OUTRA_PESSOA.nome}`)).toBeInTheDocument();
  });

  it('sussurro que recebi diz de quem veio e que é só para mim', async () => {
    const recebido: MensagemDTO = {
      ...SUSSURRO_QUE_ENVIEI,
      autorId: OUTRA_PESSOA.id,
      autorNome: OUTRA_PESSOA.nome,
      destinatarioId: EU.id,
      destinatarioNome: EU.nome,
    };
    await abrirChat('jogador', [recebido]);

    expect(
      await screen.findByText(`Sussurro de ${OUTRA_PESSOA.nome}, só para você`),
    ).toBeInTheDocument();
  });

  it('rolagem oculta é rotulada como secreta', async () => {
    const oculta: MensagemDTO = {
      ...FALA,
      id: 'm3',
      tipo: 'rolagem-oculta',
      conteudo: '',
      autorId: EU.id,
      rolagem: {
        expressao: '1d20+5',
        total: 18,
        termos: [
          {
            tipo: 'dados',
            sinal: 1,
            quantidade: 1,
            faces: 20,
            dados: [{ valor: 13, descartado: false }],
            subtotal: 13,
          },
          { tipo: 'constante', sinal: 1, valor: 5, subtotal: 5 },
        ],
      },
    };
    await abrirChat('mestre', [oculta]);

    expect(
      await screen.findByText('Rolagem oculta — só você vê este resultado'),
    ).toBeInTheDocument();
    expect(screen.getByText('🎲 18')).toBeInTheDocument();
  });
});
