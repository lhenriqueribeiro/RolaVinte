import { describe, expect, it } from 'vitest';
import { SISTEMAS_RPG, type SistemaRpg } from '../schemas/mesas';
import {
  dadosIniciaisDaFicha,
  DEFINICOES_SISTEMA,
  definicaoDoSistema,
  validarDadosDaFicha,
} from './registro';
import type { CampoFicha, DefinicaoSistema } from './tipos';

/**
 * Contrato do registro de sistemas (RV-091).
 *
 * O `Record<SistemaRpg, DefinicaoSistema>` já impede, em tempo de compilação,
 * que um sistema entre no enum sem definição. Mas `npm run test` **não** faz
 * typecheck: um agente que rode só a suíte veria verde. Este arquivo fecha a
 * segunda porta, em tempo de execução, percorrendo `SISTEMAS_RPG` — a lista
 * como valor — e exigindo definição para cada entrada, com o nome do sistema
 * faltante na mensagem.
 *
 * É o mesmo mecanismo do `Record` de eventos WS (RV-115/RV-116), que neste
 * projeto já pagou duas vezes.
 */

function todasAsDefinicoes(): [SistemaRpg, DefinicaoSistema][] {
  return SISTEMAS_RPG.map((chave) => [chave, definicaoDoSistema(chave)]);
}

function camposDe(definicao: DefinicaoSistema): CampoFicha[] {
  return definicao.secoes.flatMap((s) => [...s.campos]);
}

describe('registro de sistemas — toda entrada de SISTEMAS_RPG tem ficha', () => {
  it('a lista de sistemas não está vazia', () => {
    // Rede de segurança do próprio teste: com a lista vazia, todo `for` abaixo
    // não executaria nenhuma asserção e o arquivo passaria sem verificar nada.
    expect(SISTEMAS_RPG.length).toBeGreaterThan(0);
  });

  it('nenhum sistema declarado fica sem definição', () => {
    const semFicha = SISTEMAS_RPG.filter(
      (chave) => (definicaoDoSistema(chave) as DefinicaoSistema | undefined) === undefined,
    );

    expect(
      semFicha,
      `Sistema(s) declarados em SISTEMAS_RPG sem definição de ficha no registro: ` +
        `${semFicha.join(', ')}. Acrescente a linha correspondente em ` +
        `packages/shared/src/sistemas/registro.ts — enquanto faltar, a mesa desse sistema ` +
        `abre a ficha e não renderiza nada.`,
    ).toEqual([]);
  });

  it('DEFINICOES_SISTEMA cobre exatamente SISTEMAS_RPG, na mesma ordem', () => {
    expect(DEFINICOES_SISTEMA.map((d) => d.chave)).toEqual([...SISTEMAS_RPG]);
  });

  it('a chave declarada na definição bate com a chave do registro', () => {
    // Pega o erro de copiar/colar uma definição e esquecer de trocar a chave —
    // o sintoma seria a ficha certa aparecer no sistema errado.
    for (const [chave, definicao] of todasAsDefinicoes()) {
      expect(definicao.chave, `definição registrada sob "${chave}"`).toBe(chave);
    }
  });

  it('toda definição tem nome exibível e dado de teste', () => {
    for (const [chave, definicao] of todasAsDefinicoes()) {
      expect(definicao.nome.trim().length, `nome do sistema "${chave}"`).toBeGreaterThan(0);
      expect(definicao.dadoDeTeste, `dado de teste de "${chave}"`).toMatch(/^\d*d\d+$/);
    }
  });
});

describe('registro de sistemas — o campo livre é validado, não é lixeira', () => {
  it('todo schemaFicha é estrito: campo fora da definição é recusado', () => {
    for (const [chave, definicao] of todasAsDefinicoes()) {
      const r = validarDadosDaFicha(chave, { __campo_inexistente__: 1 });

      expect(r.ok, `a ficha de "${chave}" aceitou um campo que não existe na definição`).toBe(
        false,
      );
      if (r.ok) continue;
      expect(r.erro).toContain('__campo_inexistente__');
      expect(r.erro).toContain(definicao.nome);
    }
  });

  it('a ficha inicial de todo sistema é válida para ele mesmo', () => {
    for (const chave of SISTEMAS_RPG) {
      const inicial = dadosIniciaisDaFicha(chave);
      const r = validarDadosDaFicha(chave, inicial);
      expect(r.ok, `a ficha inicial de "${chave}" não passa na própria validação`).toBe(true);
    }
  });

  it('`{}` e `undefined` são aceitos por todo sistema — é o que o banco traz de uma ficha antiga', () => {
    for (const chave of SISTEMAS_RPG) {
      expect(validarDadosDaFicha(chave, {}).ok, `"${chave}" recusou {}`).toBe(true);
      expect(validarDadosDaFicha(chave, undefined).ok, `"${chave}" recusou undefined`).toBe(true);
    }
  });

  it('todo campo declarado numa seção existe na ficha inicial do sistema', () => {
    // Uma seção que cita um campo que o schema não conhece renderiza um input
    // que devolve 400 em toda tentativa de salvar — e nada acusaria.
    for (const [chave, definicao] of todasAsDefinicoes()) {
      const inicial = dadosIniciaisDaFicha(chave);
      const orfaos = camposDe(definicao)
        .map((c) => c.chave)
        .filter((c) => !(c in inicial));

      expect(
        orfaos,
        `Campo(s) declarados nas seções de "${chave}" que o schemaFicha não aceita: ` +
          `${orfaos.join(', ')}.`,
      ).toEqual([]);
    }
  });

  it('os limites declarados no campo são os mesmos que o schema aplica', () => {
    // `minimo`/`maximo` do CampoFicha alimentam o input da interface. Se
    // divergirem do schema, o usuário digita um valor que a tela aceita e o
    // servidor recusa — ou o contrário, que é pior.
    for (const [chave, definicao] of todasAsDefinicoes()) {
      const inicial = dadosIniciaisDaFicha(chave);
      for (const campo of camposDe(definicao)) {
        if (campo.tipo !== 'numero') continue;
        const { minimo, maximo } = campo;
        if (minimo !== undefined) {
          expect(
            validarDadosDaFicha(chave, { ...inicial, [campo.chave]: minimo }).ok,
            `"${chave}".${campo.chave}: o schema recusa o mínimo declarado (${minimo})`,
          ).toBe(true);
          expect(
            validarDadosDaFicha(chave, { ...inicial, [campo.chave]: minimo - 1 }).ok,
            `"${chave}".${campo.chave}: o schema aceita abaixo do mínimo declarado`,
          ).toBe(false);
        }
        if (maximo !== undefined) {
          expect(
            validarDadosDaFicha(chave, { ...inicial, [campo.chave]: maximo }).ok,
            `"${chave}".${campo.chave}: o schema recusa o máximo declarado (${maximo})`,
          ).toBe(true);
          expect(
            validarDadosDaFicha(chave, { ...inicial, [campo.chave]: maximo + 1 }).ok,
            `"${chave}".${campo.chave}: o schema aceita acima do máximo declarado`,
          ).toBe(false);
        }
      }
    }
  });
});

describe('registro de sistemas — perícias e graus são coerentes', () => {
  it('perícias têm chave única e grau inicial válido', () => {
    for (const [chave, definicao] of todasAsDefinicoes()) {
      const chaves = definicao.pericias.map((p) => p.chave);
      expect(new Set(chaves).size, `perícias repetidas em "${chave}"`).toBe(chaves.length);

      if (definicao.pericias.length === 0) continue;
      expect(
        definicao.grausPericia.length,
        `"${chave}" declara perícias mas nenhum grau de treinamento`,
      ).toBeGreaterThan(0);
    }
  });

  it('definirGrauDePericia produz uma ficha que continua válida e legível', () => {
    // O contrato de extensão: a interface troca o grau sem saber onde ele mora
    // dentro de `dados`, e o resultado tem de sobreviver ao schema do sistema.
    for (const [chave, definicao] of todasAsDefinicoes()) {
      const inicial = dadosIniciaisDaFicha(chave);
      for (const pericia of definicao.pericias) {
        for (const grau of definicao.grausPericia) {
          const dados = definicao.definirGrauDePericia(inicial, pericia.chave, grau.chave);

          expect(dados, `"${chave}": definirGrauDePericia mutou a entrada`).not.toBe(inicial);
          const r = validarDadosDaFicha(chave, dados);
          expect(r.ok, `"${chave}".${pericia.chave} = ${grau.chave} produziu ficha inválida`).toBe(
            true,
          );
          expect(
            definicao.grauDePericia(
              { nivel: 1, atributos: ATRIBUTOS_NEUTROS, dados },
              pericia.chave,
            ),
          ).toBe(grau.chave);
        }
      }
    }
  });

  it('perícia desconhecida devolve null em vez de um número inventado', () => {
    for (const [chave, definicao] of todasAsDefinicoes()) {
      const ficha = { nivel: 1, atributos: ATRIBUTOS_NEUTROS, dados: dadosIniciaisDaFicha(chave) };
      expect(definicao.bonusPericia(ficha, 'pericia-que-nao-existe')).toBeNull();
      expect(definicao.grauDePericia(ficha, 'pericia-que-nao-existe')).toBeNull();
    }
  });

  it('toda rolagem padrão produz uma expressão não vazia', () => {
    for (const [chave, definicao] of todasAsDefinicoes()) {
      const ficha = { nivel: 1, atributos: ATRIBUTOS_NEUTROS, dados: dadosIniciaisDaFicha(chave) };
      for (const rolagem of definicao.rolagensPadrao) {
        expect(rolagem.expressao(ficha), `rolagem "${rolagem.chave}" de "${chave}"`).toMatch(
          /^\d*d\d+([+-]\d+)?$/,
        );
      }
    }
  });
});

const ATRIBUTOS_NEUTROS = {
  forca: 10,
  destreza: 10,
  constituicao: 10,
  inteligencia: 10,
  sabedoria: 10,
  carisma: 10,
};
