import bcrypt from 'bcryptjs';
import type { ServicoSenha } from '../../aplicacao/ports/infraestrutura';

const CUSTO = 10;

export class BcryptServicoSenha implements ServicoSenha {
  gerarHash(senha: string): Promise<string> {
    return bcrypt.hash(senha, CUSTO);
  }

  verificar(senha: string, hash: string): Promise<boolean> {
    return bcrypt.compare(senha, hash);
  }
}
