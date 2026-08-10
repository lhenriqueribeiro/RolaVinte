import { describe, expect, it } from 'vitest';
import { validarExpressao } from '../dados/motor-dados';
import { SISTEMAS_RPG, type SistemaRpg } from '../schemas/mesas';
import { ATRIBUTOS, ROTULOS_ATRIBUTO, type Atributos } from '../schemas/personagens';
import {
  atributosIniciais,
  dadosIniciaisDaFicha,
  DEFINICOES_SISTEMA,
  definicaoDoSistema,
  validarAtributosDoSistema,
  validarDadosDaFicha,
} from './registro';
import type { CampoFicha, DefinicaoSistema, ModeloDeAtaques } from './tipos';

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

  it('todo campo `selecao` declara opções, e são exatamente as que o schema aceita', () => {
    // Mesma disciplina do `minimo`/`maximo` acima, para o tipo que o RV-155 trouxe:
    // as opções alimentam o `<select>` da interface, e divergir do schema é
    // oferecer uma escolha que a API recusa com 400 — ou pior, esconder uma que
    // ela aceita.
    for (const [chave, definicao] of todasAsDefinicoes()) {
      const inicial = dadosIniciaisDaFicha(chave);
      for (const campo of camposDe(definicao)) {
        if (campo.tipo !== 'selecao') continue;
        const opcoes = campo.opcoes ?? [];

        expect(
          opcoes.length,
          `"${chave}".${campo.chave} é do tipo selecao e não declara opções: a ` +
            `interface renderizaria um select vazio.`,
        ).toBeGreaterThan(0);

        for (const opcao of opcoes) {
          expect(
            opcao.rotulo.trim().length,
            `"${chave}".${campo.chave}: a opção "${opcao.valor}" não tem rótulo exibível`,
          ).toBeGreaterThan(0);
          expect(
            validarDadosDaFicha(chave, { ...inicial, [campo.chave]: opcao.valor }).ok,
            `"${chave}".${campo.chave}: o schema recusa a opção "${opcao.valor}", que a ` +
              `própria definição oferece`,
          ).toBe(true);
        }

        expect(
          validarDadosDaFicha(chave, { ...inicial, [campo.chave]: '__opcao_inexistente__' }).ok,
          `"${chave}".${campo.chave}: o schema aceita valor que não está entre as opções`,
        ).toBe(false);
      }
    }
  });
});

/**
 * Contrato das defesas derivadas (RV-155).
 *
 * O que se verifica aqui, para **todo** sistema e sem citar nenhum pelo nome: que
 * a defesa é derivada de verdade (não é campo gravado da ficha) e que o que se
 * oferece para rolar tem número. Um sistema novo que declare defesas cai nestas
 * asserções sem uma linha de alteração.
 */
describe('registro de sistemas — defesa é derivada, e o que se rola tem número', () => {
  it('nenhuma defesa é também campo gravado da ficha', () => {
    // Gravar o derivado é o defeito de duas verdades do RV-098 aplicado à defesa:
    // o personagem sobe de nível e o número gravado continua o de antes.
    for (const [chave, definicao] of todasAsDefinicoes()) {
      const inicial = dadosIniciaisDaFicha(chave);
      const ficha = { nivel: 1, atributos: atributosIniciais(chave), dados: inicial };
      const gravadas = definicao
        .defesas(ficha)
        .map((defesa) => defesa.chave)
        .filter((defesaChave) => defesaChave in inicial);

      expect(
        gravadas,
        `"${chave}" grava em \`dados\` defesa(s) que deveria derivar: ${gravadas.join(', ')}.`,
      ).toEqual([]);
    }
  });

  it('toda defesa tem rótulo e valor formatado, e só oferece rolagem quando tem número', () => {
    for (const [chave, definicao] of todasAsDefinicoes()) {
      const ficha = {
        nivel: 3,
        atributos: atributosIniciais(chave),
        dados: dadosIniciaisDaFicha(chave),
      };
      for (const defesa of definicao.defesas(ficha)) {
        const onde = `defesa "${defesa.chave}" de "${chave}"`;
        expect(defesa.rotulo.trim().length, `rótulo da ${onde}`).toBeGreaterThan(0);
        expect(defesa.valorFormatado.trim().length, `valor exibível da ${onde}`).toBeGreaterThan(0);
        expect(defesa.detalhe.trim().length, `detalhe da ${onde}`).toBeGreaterThan(0);
        if (defesa.rolavel) {
          // Botão de dado sem número seria a promessa falsa da F6: o clique
          // publicaria uma rolagem sem bônus e ninguém saberia.
          expect(defesa.valor, `a ${onde} é rolável e não tem valor`).not.toBeNull();
        }
      }
    }
  });
});

/**
 * Contrato do modelo de ataques (RV-156).
 *
 * O que se verifica aqui, para **todo** sistema e sem citar nenhum pelo nome: que o
 * que se oferece para rolar rola de verdade (expressão que o motor de dados aceita),
 * que a lista de ataques é editável pelo contrato sem produzir ficha inválida, e que
 * nenhuma variante de dano pretende ser uma checagem. Um sistema novo que declare
 * ataques cai nestas asserções sem uma linha de alteração.
 */
describe('registro de sistemas — ataque produz rolagem que rola', () => {
  /** Uma ficha do sistema com um ataque completo, criado pelo próprio contrato. */
  function fichaComAtaque(chave: SistemaRpg, modelo: ModeloDeAtaques) {
    let dados = modelo.acrescentar(dadosIniciaisDaFicha(chave), 'Golpe de teste');
    const primeiro = modelo.ataques({ nivel: 3, atributos: atributosIniciais(chave), dados })[0];
    expect(primeiro, `"${chave}": acrescentar não produziu ataque nenhum`).toBeDefined();
    dados = modelo.definirCampo(dados, primeiro?.chave ?? '', 'bonusAcerto', 9);
    dados = modelo.definirCampo(dados, primeiro?.chave ?? '', 'dano', '1d8+4');
    return { nivel: 3, atributos: atributosIniciais(chave), dados };
  }

  it('toda rolagem de ataque tem rótulo e detalhe, e a que tem expressão é aceita pelo motor', () => {
    for (const [chave, definicao] of todasAsDefinicoes()) {
      const modelo = definicao.ataques;
      if (modelo === null) continue;
      const ficha = fichaComAtaque(chave, modelo);

      for (const ataque of modelo.ataques(ficha)) {
        expect(ataque.nome.trim().length, `nome do ataque de "${chave}"`).toBeGreaterThan(0);
        const variantes = [...ataque.acertos, ...ataque.danos];
        expect(
          variantes.length,
          `o ataque de "${chave}" não oferece rolagem nenhuma`,
        ).toBeGreaterThan(0);
        for (const rolagem of variantes) {
          const onde = `rolagem "${rolagem.chave}" de "${chave}"`;
          expect(rolagem.rotulo.trim().length, `rótulo da ${onde}`).toBeGreaterThan(0);
          // Botão desabilitado precisa dizer o motivo, e botão habilitado precisa
          // explicar o número: os dois casos usam `detalhe` (F6).
          expect(rolagem.detalhe.trim().length, `detalhe da ${onde}`).toBeGreaterThan(0);
          if (rolagem.expressao !== null) {
            expect(validarExpressao(rolagem.expressao).ok, `${onde}: ${rolagem.expressao}`).toBe(
              true,
            );
          }
        }
      }
    }
  });

  it('a ficha editada pelo contrato de ataques continua válida, e nada é mutado', () => {
    for (const [chave, definicao] of todasAsDefinicoes()) {
      const modelo = definicao.ataques;
      if (modelo === null) continue;

      const inicial = dadosIniciaisDaFicha(chave);
      const comUm = modelo.acrescentar(inicial, 'Golpe de teste');
      expect(comUm, `"${chave}": acrescentar mutou a entrada`).not.toBe(inicial);
      expect(
        validarDadosDaFicha(chave, comUm).ok,
        `"${chave}": acrescentar produziu ficha inválida`,
      ).toBe(true);

      const ficha = fichaComAtaque(chave, modelo);
      expect(
        validarDadosDaFicha(chave, ficha.dados).ok,
        `"${chave}": definirCampo produziu ficha inválida`,
      ).toBe(true);

      const alvo = modelo.ataques(ficha)[0]?.chave ?? '';
      const semNenhum = modelo.remover(ficha.dados, alvo);
      expect(
        modelo.ataques({ ...ficha, dados: semNenhum }),
        `"${chave}": remover não removeu`,
      ).toHaveLength(0);
      expect(
        validarDadosDaFicha(chave, semNenhum).ok,
        `"${chave}": remover produziu ficha inválida`,
      ).toBe(true);
    }
  });

  it('todo campo declarado do ataque é editável e nenhum número derivado é gravado', () => {
    for (const [chave, definicao] of todasAsDefinicoes()) {
      const modelo = definicao.ataques;
      if (modelo === null) continue;
      expect(modelo.campos.length, `"${chave}" declara ataques e nenhum campo`).toBeGreaterThan(0);
      expect(modelo.limite, `limite de ataques de "${chave}"`).toBeGreaterThan(0);

      const ficha = fichaComAtaque(chave, modelo);
      const ataque = modelo.ataques(ficha)[0];
      // `valores` é o que a interface edita: um campo declarado que não esteja lá
      // renderiza um controle sem valor, e um valor gravado sem campo declarado fica
      // invisível e ineditável.
      expect(new Set(Object.keys(ataque?.valores ?? {})), `campos de "${chave}"`).toEqual(
        new Set(modelo.campos.map((campo) => campo.chave)),
      );
      // E nenhuma **variante de rolagem** é campo gravado: o bônus já penalizado é
      // conta feita a cada leitura, senão trocar a arma por uma ágil deixaria o −5
      // congelado.
      const gravadas = [...(ataque?.acertos ?? []), ...(ataque?.danos ?? [])]
        .map((rolagem) => rolagem.chave)
        .filter((rolagemChave) => rolagemChave in (ataque?.valores ?? {}));
      expect(gravadas, `"${chave}" grava rolagem de ataque: ${gravadas.join(', ')}`).toEqual([]);
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
              { nivel: 1, atributos: atributosIniciais(chave), dados },
              pericia.chave,
            ),
          ).toBe(grau.chave);
        }
      }
    }
  });

  it('perícia desconhecida devolve null em vez de um número inventado', () => {
    for (const [chave, definicao] of todasAsDefinicoes()) {
      const ficha = {
        nivel: 1,
        atributos: atributosIniciais(chave),
        dados: dadosIniciaisDaFicha(chave),
      };
      expect(definicao.bonusPericia(ficha, 'pericia-que-nao-existe')).toBeNull();
      expect(definicao.grauDePericia(ficha, 'pericia-que-nao-existe')).toBeNull();
    }
  });

  it('toda rolagem padrão produz uma expressão não vazia', () => {
    for (const [chave, definicao] of todasAsDefinicoes()) {
      const ficha = {
        nivel: 1,
        atributos: atributosIniciais(chave),
        dados: dadosIniciaisDaFicha(chave),
      };
      for (const rolagem of definicao.rolagensPadrao) {
        expect(rolagem.expressao(ficha), `rolagem "${rolagem.chave}" de "${chave}"`).toMatch(
          /^\d*d\d+([+-]\d+)?$/,
        );
      }
    }
  });
});

/**
 * Contrato da escala de atributo (RV-098).
 *
 * O defeito que este bloco existe para não deixar voltar: o atributo tinha
 * **duas** casas na ficha de PF2e — a coluna comum, exigida na criação e
 * ignorada, e uma cópia dentro de `dados` que era a que a ficha lia. A correção
 * foi declarar a escala no registro e manter o número num lugar só, e é isso que
 * se verifica aqui, para **todo** sistema e sem citar nenhum pelo nome.
 */
describe('registro de sistemas — a escala de atributo é declarada, e é uma só', () => {
  it('toda definição declara uma escala coerente, com a faixa escrita para o usuário', () => {
    for (const [chave, definicao] of todasAsDefinicoes()) {
      const escala = definicao.atributos;
      expect(escala.minimo, `escala de "${chave}"`).toBeLessThan(escala.maximo);
      expect(escala.padrao, `padrão de "${chave}" abaixo do mínimo`).toBeGreaterThanOrEqual(
        escala.minimo,
      );
      expect(escala.padrao, `padrão de "${chave}" acima do máximo`).toBeLessThanOrEqual(
        escala.maximo,
      );
      expect(escala.descricao.trim().length, `descrição da escala de "${chave}"`).toBeGreaterThan(
        0,
      );
      expect(Number.isFinite(escala.modificador(escala.padrao)), `modificador de "${chave}"`).toBe(
        true,
      );
    }
  });

  it('os atributos de uma ficha nova são válidos para o próprio sistema', () => {
    // O `10` que estava fixo no `criarPersonagemSchema` reprovaria aqui num
    // sistema cuja escala vai até +8: era 400 na criação de toda ficha.
    for (const chave of SISTEMAS_RPG) {
      const r = validarAtributosDoSistema(chave, atributosIniciais(chave));
      expect(r.ok, `os atributos iniciais de "${chave}" não passam na própria escala`).toBe(true);
    }
  });

  it('a faixa declarada é a faixa cobrada: as pontas passam, e um a mais recusa em PT-BR', () => {
    for (const [chave, definicao] of todasAsDefinicoes()) {
      const { minimo, maximo } = definicao.atributos;
      for (const valor of [minimo, maximo]) {
        expect(
          validarAtributosDoSistema(chave, comValor(valor)).ok,
          `"${chave}" recusa o valor de ponta ${valor}, que a própria escala declara`,
        ).toBe(true);
      }
      for (const valor of [minimo - 1, maximo + 1]) {
        const r = validarAtributosDoSistema(chave, comValor(valor));
        expect(r.ok, `"${chave}" aceitou ${valor}, fora da escala que declarou`).toBe(false);
        if (r.ok) continue;
        // A mensagem tem de dizer o atributo, o sistema e a faixa — "inválido"
        // sozinho deixa o jogador adivinhando o que digitar.
        expect(r.erro).toContain(ROTULOS_ATRIBUTO.forca);
        expect(r.erro).toContain(definicao.nome);
        expect(r.erro).toContain(definicao.atributos.descricao);
      }
    }
  });

  it('fracionário e não-número são recusados dizendo o atributo', () => {
    for (const chave of SISTEMAS_RPG) {
      const meio = validarAtributosDoSistema(chave, {
        ...atributosIniciais(chave),
        destreza: definicaoDoSistema(chave).atributos.minimo + 0.5,
      });
      expect(meio.ok, `"${chave}" aceitou atributo fracionário`).toBe(false);
      if (!meio.ok) expect(meio.erro).toContain(ROTULOS_ATRIBUTO.destreza);

      const texto = validarAtributosDoSistema(chave, {
        ...atributosIniciais(chave),
        carisma: '3',
      } as unknown as Atributos);
      expect(texto.ok, `"${chave}" aceitou atributo em texto`).toBe(false);
      if (!texto.ok) expect(texto.erro).toContain(ROTULOS_ATRIBUTO.carisma);
    }
  });

  it('nenhum sistema guarda em `dados` um campo que já é coluna comum', () => {
    // Esta é a guarda do RV-098, e ela cobre **todos** os campos comuns, não só o
    // atributo — a varredura que o DoD do card pede, em forma executável.
    //
    // O PF2e mantinha `dados.modificadorForca` e companhia em paralelo à coluna
    // comum: a criação exigia uma, a ficha lia a outra, e o valor do jogador
    // desaparecia sem aviso. O mesmo defeito com PV seria pior (a barra de vida
    // sobre o token lê `pvAtual`/`pvMax` do DTO) e com nível seria silencioso (o
    // bônus de proficiência sai de `ficha.nivel`).
    //
    // A lista é a das colunas de `personagens` — ver `infra/supabase/personagem.mapper.ts`.
    // O atributo entra também nas formas derivadas (`modificadorForca`,
    // `valorDestreza`), porque foi assim que a segunda casa nasceu.
    const nomes = ATRIBUTOS.join('|');
    const eComum = new RegExp(
      `^(?:nome|classe|nivel|pvatual|pvmax|anotacoes|(?:modificador|valor|atributo)?(?:${nomes}))$`,
      'i',
    );

    for (const [chave, definicao] of todasAsDefinicoes()) {
      const suspeitos = [
        ...new Set([
          ...Object.keys(dadosIniciaisDaFicha(chave)),
          ...camposDe(definicao).map((campo) => campo.chave),
        ]),
      ].filter((nome) => eComum.test(nome));

      expect(
        suspeitos,
        `A ficha de "${chave}" declara na metade do sistema campo(s) que já são ` +
          `coluna comum de \`personagens\`: ${suspeitos.join(', ')}. Duas casas para o ` +
          `mesmo número é o defeito do RV-098 — a criação grava uma, a ficha lê a ` +
          `outra, e ninguém é avisado. Se o que muda entre sistemas é a ` +
          `interpretação, declare-a na definição (como \`DefinicaoSistema.atributos\`), ` +
          `não um segundo campo.`,
      ).toEqual([]);
    }
  });
});

/** Os seis atributos no mesmo valor — para exercitar as pontas de uma escala. */
function comValor(valor: number): Atributos {
  return {
    forca: valor,
    destreza: valor,
    constituicao: valor,
    inteligencia: valor,
    sabedoria: valor,
    carisma: valor,
  };
}
