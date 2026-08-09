import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Carregando, Erro, Vazio, mensagemDeErro } from './Estado';

/**
 * Os três estados padrão do RV-122.
 *
 * O que importa provar aqui não é o layout: é que erro **sempre** oferece saída
 * quando quem chama sabe refazer a consulta, que nada é comunicado só por cor, e
 * que qualquer coisa rejeitada por uma mutação vira texto legível — nunca
 * "undefined" nem "[object Object]" na cara do usuário.
 */

describe('mensagemDeErro', () => {
  it('usa a mensagem do Error (é onde o texto em PT-BR da API chega)', () => {
    expect(mensagemDeErro(new Error('Você não participa desta mesa.'))).toBe(
      'Você não participa desta mesa.',
    );
  });

  it('aceita string crua', () => {
    expect(mensagemDeErro('Convite já aceito.')).toBe('Convite já aceito.');
  });

  it('cai no texto genérico para o que não é apresentável', () => {
    const generico = 'Algo deu errado. Tente novamente.';
    expect(mensagemDeErro(null)).toBe(generico);
    expect(mensagemDeErro(undefined)).toBe(generico);
    expect(mensagemDeErro({ codigo: 500 })).toBe(generico);
    expect(mensagemDeErro(new Error('   '))).toBe(generico);
    expect(mensagemDeErro('')).toBe(generico);
  });
});

describe('Erro', () => {
  it('é anunciado como alerta e mostra a mensagem da API', () => {
    render(<Erro erro={new Error('Mesa não encontrada.')} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Mesa não encontrada.');
  });

  it('oferece nova tentativa e chama quem sabe refazer a consulta', async () => {
    const usuario = userEvent.setup();
    const retentar = vi.fn();
    render(<Erro erro={new Error('Falha de rede.')} aoRetentar={retentar} />);

    await usuario.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(retentar).toHaveBeenCalledOnce();
  });

  it('sem `aoRetentar` não inventa um botão que não faria nada', () => {
    render(<Erro erro={new Error('Nome muito curto.')} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('durante a nova tentativa o botão trava e diz que está tentando', () => {
    render(<Erro erro={new Error('Falha.')} aoRetentar={() => {}} retentando />);

    const botao = screen.getByRole('button', { name: 'Tentando…' });
    expect(botao).toBeDisabled();
  });

  it('a condição de erro não depende da cor: existe a palavra "Erro" no texto acessível', () => {
    render(<Erro erro={new Error('Falha de rede.')} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Erro: Falha de rede.');
  });

  it('aceita uma saída alternativa junto do botão', () => {
    render(
      <Erro erro={new Error('Convite inválido.')}>
        <a href="/">Ir para o início</a>
      </Erro>,
    );

    expect(screen.getByRole('link', { name: 'Ir para o início' })).toBeInTheDocument();
  });
});

describe('Carregando', () => {
  it('é anunciado com o que está carregando', () => {
    render(<Carregando rotulo="Carregando a conversa…" />);

    expect(screen.getByRole('status')).toHaveTextContent('Carregando a conversa…');
  });
});

describe('Vazio', () => {
  it('mostra título, descrição e a ação que resolve o vazio', () => {
    render(
      <Vazio
        titulo="Você ainda não tem mesas."
        descricao="Crie a primeira e convide seu grupo!"
        acao={<button type="button">Nova mesa</button>}
      />,
    );

    expect(screen.getByText('Você ainda não tem mesas.')).toBeInTheDocument();
    expect(screen.getByText('Crie a primeira e convide seu grupo!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nova mesa' })).toBeInTheDocument();
  });

  it('o emoji é decorativo e não entra no nome acessível', () => {
    render(<Vazio icone="🐉" titulo="Nada por aqui." />);

    expect(screen.getByText('🐉')).toHaveAttribute('aria-hidden');
  });
});
