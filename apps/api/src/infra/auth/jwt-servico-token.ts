import { jwtVerify, SignJWT } from 'jose';
import type { ServicoToken } from '../../aplicacao/ports/infraestrutura';

const DURACAO = '7d';

export class JwtServicoToken implements ServicoToken {
  private readonly chave: Uint8Array;

  constructor(segredo: string) {
    this.chave = new TextEncoder().encode(segredo);
  }

  async gerar(payload: { usuarioId: string }): Promise<string> {
    return new SignJWT({ sub: payload.usuarioId })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(DURACAO)
      .sign(this.chave);
  }

  async verificar(token: string): Promise<{ usuarioId: string } | null> {
    try {
      const { payload } = await jwtVerify(token, this.chave);
      if (typeof payload.sub !== 'string') return null;
      return { usuarioId: payload.sub };
    } catch {
      return null;
    }
  }
}
