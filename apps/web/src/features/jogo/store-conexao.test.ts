import { beforeEach, describe, expect, it } from 'vitest';
import { motivoDeConexao, rotuloDeConexao, useConexao, type EstadoConexao } from './store-conexao';

/**
 * Store de conexão (RV-112). Transições e textos são funções puras de propósito:
 * é o que permite provar a máquina de estados sem montar um componente, e é
 * onde mora a diferença entre "espere" e "recarregue a página".
 */

const TODOS_OS_ESTADOS: EstadoConexao[] = ['conectado', 'reconectando', 'offline'];

beforeEach(() => {
  useConexao.setState({ estado: 'conectado' });
});

describe('store de conexão — transições', () => {
  it('nasce otimista: uma mesa recém-aberta não pisca "Reconectando…"', () => {
    expect(useConexao.getState().estado).toBe('conectado');
  });

  it('queda com reconexão em curso → reconectando', () => {
    useConexao.getState().caiu(true);
    expect(useConexao.getState().estado).toBe('reconectando');
  });

  it('queda sem reconexão automática → offline', () => {
    useConexao.getState().caiu(false);
    expect(useConexao.getState().estado).toBe('offline');
  });

  it('conectar volta de qualquer estado', () => {
    for (const estado of TODOS_OS_ESTADOS) {
      useConexao.setState({ estado });
      useConexao.getState().conectou();
      expect(useConexao.getState().estado).toBe('conectado');
    }
  });

  it('offline não é um beco sem saída: uma volta é sempre aceita', () => {
    useConexao.getState().caiu(false);
    useConexao.getState().conectou();
    expect(useConexao.getState().estado).toBe('conectado');
  });
});

describe('store de conexão — o que a interface mostra', () => {
  it('conectado não mostra faixa nem bloqueia escrita', () => {
    expect(rotuloDeConexao('conectado')).toBeNull();
    expect(motivoDeConexao('conectado')).toBeNull();
  });

  it.each(['reconectando', 'offline'] as const)('%s bloqueia a escrita com motivo', (estado) => {
    // "Controle desabilitado diz por quê": o motivo é o texto que acompanha
    // cada botão desligado da mesa, e ele não pode ser vazio.
    expect(motivoDeConexao(estado)?.length).toBeGreaterThan(20);
  });

  it.each(['reconectando', 'offline'] as const)(
    '%s tem rótulo com texto, não só cor (acessibilidade)',
    (estado) => {
      const rotulo = rotuloDeConexao(estado) ?? '';
      expect(rotulo.replace(/[^\p{L}]/gu, '').length).toBeGreaterThan(3);
    },
  );

  it('reconectando manda esperar; offline manda recarregar — nunca o contrário', () => {
    // A distinção é a razão de existirem três estados: pedir F5 a quem só
    // precisa esperar, ou mandar esperar quem nunca vai voltar sozinho, são os
    // dois jeitos de a UI mentir aqui.
    expect(motivoDeConexao('reconectando')).toMatch(/Reconectando/i);
    expect(motivoDeConexao('reconectando')).not.toMatch(/recarregue/i);
    expect(motivoDeConexao('offline')).toMatch(/recarregue/i);
  });

  it('o motivo de reconexão promete que o texto digitado fica — e o Chat cumpre', () => {
    // Promessa de UI é contrato (F6). Quem prova o cumprimento é
    // `reconexao-chat.test.tsx`, que digita, bloqueia e confere o campo.
    expect(motivoDeConexao('reconectando')).toMatch(/digitado/i);
  });
});
