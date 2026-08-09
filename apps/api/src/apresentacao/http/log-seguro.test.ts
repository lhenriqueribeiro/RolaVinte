import { describe, expect, it } from 'vitest';
import {
  CENSURA,
  TRUNCADO,
  chaveSensivel,
  endurecerLogger,
  redigirObjetoDeLog,
  redigirSegredos,
} from './log-seguro';

describe('redator de logs', () => {
  it('censura senha, hash, token e authorization no primeiro nível', () => {
    const redigido = redigirObjetoDeLog({
      email: 'mestre@rolavinte.local',
      senha: 'segredo-em-claro',
      senha_hash: '$2a$10$hashdesenha',
      token: 'eyJhbGciOiJIUzI1NiJ9.payload.assinatura',
      authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.payload.assinatura',
    });

    expect(redigido).toEqual({
      email: 'mestre@rolavinte.local',
      senha: CENSURA,
      senha_hash: CENSURA,
      token: CENSURA,
      authorization: CENSURA,
    });
    expect(JSON.stringify(redigido)).not.toContain('segredo-em-claro');
    expect(JSON.stringify(redigido)).not.toContain('hashdesenha');
    expect(JSON.stringify(redigido)).not.toContain('payload.assinatura');
  });

  it('censura em profundidade, dentro de objetos e de arrays', () => {
    const redigido = redigirObjetoDeLog({
      req: {
        headers: { authorization: 'Bearer abc123', 'content-type': 'application/json' },
        body: { senha: 'senha-do-usuario' },
      },
      sessoes: [{ usuario: 'ana', token: 'token-da-ana' }],
    });

    const serializado = JSON.stringify(redigido);
    expect(serializado).not.toContain('abc123');
    expect(serializado).not.toContain('senha-do-usuario');
    expect(serializado).not.toContain('token-da-ana');
    expect(serializado).toContain('application/json');
  });

  it('reconhece a chave em qualquer grafia (camelCase, snake_case, maiúsculas)', () => {
    expect(chaveSensivel('senhaHash')).toBe(true);
    expect(chaveSensivel('senha_hash')).toBe(true);
    expect(chaveSensivel('Authorization')).toBe(true);
    expect(chaveSensivel('accessToken')).toBe(true);
    expect(chaveSensivel('mesaId')).toBe(false);
    expect(chaveSensivel('tokenId')).toBe(false);
  });

  it('não muta o objeto original', () => {
    const original = { senha: 'nao-me-apague' };

    redigirObjetoDeLog(original);

    expect(original.senha).toBe('nao-me-apague');
  });

  it('preserva instâncias (Error, Date) para os serializers do pino', () => {
    const erro = new Error('falha simulada');
    const instante = new Date('2026-08-09T12:00:00.000Z');

    const redigido = redigirObjetoDeLog({ err: erro, quando: instante });

    expect(redigido.err).toBe(erro);
    expect(redigido.quando).toBe(instante);
  });

  it('trunca em vez de entrar em laço infinito com referência cíclica', () => {
    const raiz: Record<string, unknown> = { nome: 'mesa' };
    raiz.pai = raiz;

    expect(JSON.stringify(redigirSegredos(raiz))).toContain(TRUNCADO);
  });

  it('mantém o logger desligado quando o servidor pede silêncio', () => {
    expect(endurecerLogger(false)).toBe(false);
    expect(endurecerLogger(undefined)).toBe(false);
  });

  it('injeta a redação preservando a configuração do composition root', () => {
    const configuracao = endurecerLogger({ level: 'info' });

    expect(configuracao).toMatchObject({ level: 'info' });
    expect(configuracao).toHaveProperty('formatters.log');
    expect(configuracao).toHaveProperty('redact.censor', CENSURA);
  });
});
