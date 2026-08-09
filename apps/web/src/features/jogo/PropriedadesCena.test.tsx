import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CenaDTO } from '@rolavinte/shared';
import { CAMPO_IMAGEM_FUNDO } from '@rolavinte/shared';
import { renderizarComProvedores } from '@/testes/utilitarios';
import { PropriedadesCena } from './PropriedadesCena';

const MESA_ID = 'mesa-1';

const { requisitarFalso, enviarArquivoFalso } = vi.hoisted(() => ({
  requisitarFalso: vi.fn<(caminho: string, opcoes?: unknown) => Promise<unknown>>(),
  enviarArquivoFalso: vi.fn<(caminho: string, campo: string, arquivo: File) => Promise<unknown>>(),
}));

vi.mock('@/lib/api', () => ({
  requisitar: requisitarFalso,
  enviarArquivo: enviarArquivoFalso,
  ErroApi: class ErroApi extends Error {},
}));

const CENA: CenaDTO = {
  id: 'cena-1',
  mesaId: MESA_ID,
  nome: 'Cripta',
  larguraGrid: 25,
  alturaGrid: 15,
  corFundo: '#1a2332',
  ativa: true,
  imagemFundoUrl: null,
  tamanhoCelula: 44,
  gridVisivel: true,
  corGrid: '#3a4a63',
};

function montar(cena: CenaDTO = CENA, motivoBloqueio: string | null = null) {
  return renderizarComProvedores(
    <PropriedadesCena mesaId={MESA_ID} cena={cena} motivoBloqueio={motivoBloqueio} />,
  );
}

beforeEach(() => {
  requisitarFalso.mockReset();
  requisitarFalso.mockResolvedValue(CENA);
  enviarArquivoFalso.mockReset();
  enviarArquivoFalso.mockResolvedValue(CENA);
});

describe('PropriedadesCena — imagem de fundo (RV-032)', () => {
  it('envia o arquivo escolhido como multipart no campo do contrato', async () => {
    const usuario = userEvent.setup();
    montar();
    const arquivo = new File(['png'], 'mapa-do-cliente.png', { type: 'image/png' });

    await usuario.upload(screen.getByLabelText('Imagem de fundo'), arquivo);
    await usuario.click(screen.getByRole('button', { name: 'Enviar mapa' }));

    await waitFor(() => {
      expect(enviarArquivoFalso).toHaveBeenCalledWith(
        `/cenas/${CENA.id}/fundo`,
        CAMPO_IMAGEM_FUNDO,
        arquivo,
      );
    });
  });

  it('não envia nada quando nenhum arquivo foi escolhido', async () => {
    const usuario = userEvent.setup();
    montar();

    await usuario.click(screen.getByRole('button', { name: 'Enviar mapa' }));

    expect(enviarArquivoFalso).not.toHaveBeenCalled();
  });

  it('aceita só os tipos do contrato e mostra a recusa da API em PT-BR', async () => {
    const usuario = userEvent.setup();
    enviarArquivoFalso.mockRejectedValue(new Error('Envie uma imagem PNG, JPEG ou WebP.'));
    montar();

    expect(screen.getByLabelText('Imagem de fundo')).toHaveAttribute(
      'accept',
      'image/png,image/jpeg,image/webp',
    );

    await usuario.upload(
      screen.getByLabelText('Imagem de fundo'),
      new File(['x'], 'mapa.png', { type: 'image/png' }),
    );
    await usuario.click(screen.getByRole('button', { name: 'Enviar mapa' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Envie uma imagem PNG, JPEG ou WebP.',
    );
  });

  it('diz por escrito se a cena já tem mapa', () => {
    montar({ ...CENA, imagemFundoUrl: 'https://storage.local/mapas/cripta.png' });

    expect(screen.getByText('Esta cena já tem mapa.')).toBeInTheDocument();
  });
});

describe('PropriedadesCena — configuração do grid (RV-033)', () => {
  it('aplicar o tamanho de célula manda PATCH só com o campo alterado', async () => {
    const usuario = userEvent.setup();
    montar();

    const campo = screen.getByLabelText('Tamanho da célula (px)');
    await usuario.clear(campo);
    await usuario.type(campo, '64');
    await usuario.click(screen.getByRole('button', { name: 'Aplicar' }));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(`/cenas/${CENA.id}`, {
        metodo: 'PATCH',
        corpo: { tamanhoCelula: 64 },
      });
    });
  });

  it('aplicar fica travado enquanto o valor é o mesmo da cena', () => {
    montar();

    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled();
  });

  it('o campo respeita os limites de 20 a 200 do contrato', () => {
    montar();

    const campo = screen.getByLabelText('Tamanho da célula (px)');
    expect(campo).toHaveAttribute('min', '20');
    expect(campo).toHaveAttribute('max', '200');
  });

  it('desmarcar "exibir grid" manda gridVisivel: false', async () => {
    const usuario = userEvent.setup();
    montar();

    await usuario.click(screen.getByLabelText('Exibir grid'));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(`/cenas/${CENA.id}`, {
        metodo: 'PATCH',
        corpo: { gridVisivel: false },
      });
    });
  });

  it('marcar de volta manda gridVisivel: true', async () => {
    const usuario = userEvent.setup();
    montar({ ...CENA, gridVisivel: false });

    await usuario.click(screen.getByLabelText('Exibir grid'));

    await waitFor(() => {
      expect(requisitarFalso).toHaveBeenCalledWith(`/cenas/${CENA.id}`, {
        metodo: 'PATCH',
        corpo: { gridVisivel: true },
      });
    });
  });

  it('a mensagem de limite da API aparece como veio', async () => {
    const usuario = userEvent.setup();
    requisitarFalso.mockRejectedValue(new Error('Tamanho da célula deve estar entre 20 e 200.'));
    montar();

    const campo = screen.getByLabelText('Tamanho da célula (px)');
    await usuario.clear(campo);
    await usuario.type(campo, '5');
    await usuario.click(screen.getByRole('button', { name: 'Aplicar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tamanho da célula deve estar entre 20 e 200.',
    );
  });
});

describe('PropriedadesCena — mesa encerrada (RV-023)', () => {
  it('trava upload, célula, visibilidade e cor, com o motivo escrito', () => {
    montar(CENA, 'Esta mesa foi encerrada.');

    expect(screen.getByLabelText('Imagem de fundo')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enviar mapa' })).toBeDisabled();
    expect(screen.getByLabelText('Tamanho da célula (px)')).toBeDisabled();
    expect(screen.getByLabelText('Exibir grid')).toBeDisabled();
    expect(screen.getByLabelText('Cor do grid')).toBeDisabled();
    expect(screen.getByText('Esta mesa foi encerrada.')).toBeInTheDocument();
  });
});
