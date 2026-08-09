import { describe, expect, it } from 'vitest';
import type { ResultadoRolagem } from '@rolavinte/shared';
import { Mensagem } from './mensagem';

const AGORA = new Date('2026-08-09T12:00:00.000Z');
const MESA = 'mesa-1';
const AUTOR = 'autor-1';
const DESTINATARIO = 'destinatario-1';
const TERCEIRO = 'terceiro-1';

const ROLAGEM: ResultadoRolagem = {
  expressao: '1d20+5',
  total: 25,
  termos: [],
};

function sussurro(conteudo = 'plano secreto') {
  const r = Mensagem.criarSussurro({
    id: 'm1',
    mesaId: MESA,
    autorId: AUTOR,
    autorNome: 'Aria',
    destinatarioId: DESTINATARIO,
    destinatarioNome: 'Mestre',
    conteudo,
    agora: AGORA,
  });
  if (!r.ok) throw new Error(`sussurro inválido: ${r.erro.mensagem}`);
  return r.valor;
}

function rolagemOculta() {
  return Mensagem.criarRolagemOculta({
    id: 'm2',
    mesaId: MESA,
    autorId: AUTOR,
    autorNome: 'Mestre',
    rolagem: ROLAGEM,
    motivo: 'percepção do goblin',
    agora: AGORA,
  });
}

function fala() {
  const r = Mensagem.criarFala({
    id: 'm3',
    mesaId: MESA,
    autorId: AUTOR,
    autorNome: 'Aria',
    conteudo: 'boa noite',
    agora: AGORA,
  });
  if (!r.ok) throw new Error('fala inválida');
  return r.valor;
}

describe('Mensagem.criarSussurro (RV-070)', () => {
  it('nasce com tipo sussurro, destinatário e conteúdo trimado', () => {
    const m = sussurro('  combino a emboscada  ');
    expect(m.tipo).toBe('sussurro');
    expect(m.conteudo).toBe('combino a emboscada');
    expect(m.destinatarioId).toBe(DESTINATARIO);
    expect(m.destinatarioNome).toBe('Mestre');
    expect(m.rolagem).toBeNull();
  });

  it('aplica as mesmas regras de tamanho da fala', () => {
    const vazio = Mensagem.criarSussurro({
      id: 'm1',
      mesaId: MESA,
      autorId: AUTOR,
      autorNome: 'Aria',
      destinatarioId: DESTINATARIO,
      destinatarioNome: 'Mestre',
      conteudo: '   ',
      agora: AGORA,
    });
    expect(!vazio.ok && vazio.erro.tipo).toBe('validacao');

    const longo = Mensagem.criarSussurro({
      id: 'm1',
      mesaId: MESA,
      autorId: AUTOR,
      autorNome: 'Aria',
      destinatarioId: DESTINATARIO,
      destinatarioNome: 'Mestre',
      conteudo: 'a'.repeat(2001),
      agora: AGORA,
    });
    expect(!longo.ok && longo.erro.tipo).toBe('validacao');
  });
});

describe('Mensagem.criarRolagemOculta (RV-071)', () => {
  it('guarda o resultado e não tem destinatário', () => {
    const m = rolagemOculta();
    expect(m.tipo).toBe('rolagem-oculta');
    expect(m.rolagem?.total).toBe(25);
    expect(m.conteudo).toBe('1d20+5');
    expect(m.motivo).toBe('percepção do goblin');
    expect(m.destinatarioId).toBeNull();
    expect(m.destinatarioNome).toBeNull();
  });
});

describe('visibilidade da mensagem', () => {
  it('fala e rolagem comuns são de todo mundo', () => {
    expect(fala().visivelPara(TERCEIRO)).toBe(true);
    expect(fala().restrita).toBe(false);
  });

  it('sussurro é visível só para autor e destinatário', () => {
    const m = sussurro();
    expect(m.restrita).toBe(true);
    expect(m.visivelPara(AUTOR)).toBe(true);
    expect(m.visivelPara(DESTINATARIO)).toBe(true);
    expect(m.visivelPara(TERCEIRO)).toBe(false);
  });

  it('rolagem oculta é visível só para quem rolou — nem o resto da mesa, nem "o mestre"', () => {
    const m = rolagemOculta();
    expect(m.restrita).toBe(true);
    expect(m.visivelPara(AUTOR)).toBe(true);
    expect(m.visivelPara(DESTINATARIO)).toBe(false);
    expect(m.visivelPara(TERCEIRO)).toBe(false);
  });
});

describe('destinatariosPrivados — quem recebe o broadcast', () => {
  it('mensagem pública não tem alvo privado (vai para a sala da mesa)', () => {
    expect(fala().destinatariosPrivados).toEqual([]);
  });

  it('sussurro vai para autor e destinatário', () => {
    expect([...sussurro().destinatariosPrivados].sort()).toEqual([AUTOR, DESTINATARIO].sort());
  });

  it('sussurro para si mesmo não duplica o alvo', () => {
    const r = Mensagem.criarSussurro({
      id: 'm1',
      mesaId: MESA,
      autorId: AUTOR,
      autorNome: 'Aria',
      destinatarioId: AUTOR,
      destinatarioNome: 'Aria',
      conteudo: 'anotação mental',
      agora: AGORA,
    });
    if (!r.ok) throw new Error('sussurro inválido');
    expect(r.valor.destinatariosPrivados).toEqual([AUTOR]);
  });

  it('rolagem oculta vai só para quem rolou', () => {
    expect(rolagemOculta().destinatariosPrivados).toEqual([AUTOR]);
  });
});
