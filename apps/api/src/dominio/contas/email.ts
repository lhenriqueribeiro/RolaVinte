import { ErroDominio } from '../compartilhado/erro-dominio';
import { falha, ok, type Result } from '../compartilhado/resultado';

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class Email {
  private constructor(readonly valor: string) {}

  static criar(bruto: string): Result<Email> {
    const normalizado = bruto.trim().toLowerCase();
    if (!REGEX_EMAIL.test(normalizado)) {
      return falha(ErroDominio.validacao(`Email inválido: "${bruto}"`));
    }
    return ok(new Email(normalizado));
  }

  /** Hidratação do banco — valor já validado na criação original. */
  static reconstituir(valor: string): Email {
    return new Email(valor);
  }

  igual(outro: Email): boolean {
    return this.valor === outro.valor;
  }
}
