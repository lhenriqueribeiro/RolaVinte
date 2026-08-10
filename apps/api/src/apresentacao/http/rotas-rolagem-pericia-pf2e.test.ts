import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  chaveDeSaber,
  dadosIniciaisDaFicha,
  definicaoDoSistema,
  expressaoDePericia,
  motivoDeRolagemDePericia,
  acrescentarSaber,
  type CriarMesaEntrada,
  type DadosFicha,
  type MensagemDTO,
  type MesaDTO,
  type PersonagemCalculavel,
  type PersonagemDTO,
} from '@rolavinte/shared';
import { criarAppDeTeste, type AppDeTeste, type SessaoDeTeste } from '../../testes/harness';

/**
 * Rolagem de perícia de PF2e pela rota que já existe (RV-153).
 *
 * **Não há rota nova neste card, e isso é a decisão.** A ficha monta a expressão
 * com o motor de `@rolavinte/shared` e posta em `POST /mesas/:mesaId/rolagens`,
 * a mesma rota de sempre. Uma rota "rolar perícia do personagem X" duplicaria a
 * autorização que já vive no agregado `Mesa` — e autorização duplicada é
 * autorização que diverge.
 *
 * O que se prova aqui: o número que a ficha calcula atravessa a pilha inteira e
 * chega ao chat com o motivo que identifica perícia e personagem; e a guarda de
 * participação vale na **chamada direta**, sem passar pela interface (F4).
 *
 * Sobre o cenário "rolar pela ficha de outro jogador → 403" do enunciado: com
 * uma rota única de rolagem ele não é exprimível — o corpo é uma expressão de
 * dados, e quem participa da mesa pode rolar dados. A autorização que existe de
 * verdade está testada aqui (não-participante → 403) e em
 * `rotas-personagens-pathfinder2e.test.ts` (escrever na ficha de terceiro →
 * 403). O texto do card foi corrigido junto com esta entrega (F11).
 */

/**
 * Seelah, nível 5, com Destreza +4 e Inteligência +1 na coluna comum — que é onde
 * o atributo de PF2e mora desde o RV-098, na escala do sistema (−5..+8). Antes
 * disso os modificadores iam em `dados` e estes 20 iam para a coluna, que ninguém
 * lia.
 */
const FICHA_BASE = {
  nome: 'Seelah',
  classe: 'Paladina',
  nivel: 5,
  pvMax: 40,
  atributos: {
    forca: 0,
    destreza: 4,
    constituicao: 0,
    inteligencia: 1,
    sabedoria: 0,
    carisma: 0,
  },
  anotacoes: '',
};

let ambiente: AppDeTeste;
let mestre: SessaoDeTeste;
let bruno: SessaoDeTeste;
let estranho: SessaoDeTeste;

beforeEach(async () => {
  ambiente = criarAppDeTeste();
  mestre = await ambiente.autenticarComo({ nome: 'Mestre' });
  bruno = await ambiente.autenticarComo({ nome: 'Bruno' });
  estranho = await ambiente.autenticarComo({ nome: 'Estranho' });
});

afterEach(async () => {
  await ambiente.encerrar();
});

async function entrarNaMesa(mesaId: string, sessao: SessaoDeTeste): Promise<void> {
  const convite = await ambiente.app.inject({
    method: 'POST',
    url: `/api/mesas/${mesaId}/convites`,
    headers: mestre.cabecalhos,
    payload: { email: sessao.usuario.email },
  });
  expect(convite.statusCode).toBe(201);
  await ambiente.aguardarEventos();

  const token = ambiente.fakes.email.enviados.at(-1)?.html.match(/\/convites\/([\w-]+)/)?.[1];
  const aceite = await ambiente.app.inject({
    method: 'POST',
    url: '/api/convites/aceitar',
    headers: sessao.cabecalhos,
    payload: { token },
  });
  expect(aceite.statusCode).toBe(200);
}

/** Mesa de PF2e com Seelah nível 5, Destreza +4 e Furtividade treinada. */
async function mesaComSeelah(dadosExtra: (dados: DadosFicha) => DadosFicha = (d) => d) {
  const corpo: CriarMesaEntrada = {
    nome: 'A Era das Cinzas',
    descricao: '',
    sistema: 'pathfinder2e',
  };
  const criada = await ambiente.app.inject({
    method: 'POST',
    url: '/api/mesas',
    headers: mestre.cabecalhos,
    payload: corpo,
  });
  expect(criada.statusCode).toBe(201);
  const mesa = criada.json<MesaDTO>();
  await entrarNaMesa(mesa.id, bruno);

  const definicao = definicaoDoSistema('pathfinder2e');
  const dados = dadosExtra(
    definicao.definirGrauDePericia(dadosIniciaisDaFicha('pathfinder2e'), 'furtividade', 'treinado'),
  );

  const ficha = await ambiente.app.inject({
    method: 'POST',
    url: `/api/mesas/${mesa.id}/personagens`,
    headers: bruno.cabecalhos,
    payload: { ...FICHA_BASE, dados },
  });
  expect(ficha.statusCode).toBe(201);
  const seelah = ficha.json<PersonagemDTO>();
  const calculavel: PersonagemCalculavel = {
    sistema: 'pathfinder2e',
    nivel: seelah.nivel,
    atributos: seelah.atributos,
    dados: seelah.dados,
  };
  return { mesaId: mesa.id, seelah, calculavel };
}

async function rolar(sessao: SessaoDeTeste, mesaId: string, expressao: string, motivo: string) {
  return ambiente.app.inject({
    method: 'POST',
    url: `/api/mesas/${mesaId}/rolagens`,
    headers: sessao.cabecalhos,
    payload: { expressao, motivo },
  });
}

describe('rolagem de perícia de PF2e pela rota de rolagens (RV-153)', () => {
  it('a expressão que a ficha calcula chega ao chat com o bônus e o motivo certos', async () => {
    const { mesaId, calculavel } = await mesaComSeelah();

    // +11 escrito à mão: nível 5, treinado (+2 e mais o nível) e Destreza +4.
    // A ficha e o teste precisam concordar com o mesmo número.
    expect(expressaoDePericia(calculavel, 'furtividade')).toBe('1d20+11');

    const resposta = await rolar(
      bruno,
      mesaId,
      '1d20+11',
      motivoDeRolagemDePericia('pathfinder2e', 'furtividade', 'Seelah') ?? '',
    );

    expect(resposta.statusCode).toBe(201);
    const mensagem = resposta.json<MensagemDTO>();
    expect(mensagem.tipo).toBe('rolagem');
    expect(mensagem.motivo).toBe('Furtividade — Seelah');
    expect(mensagem.rolagem?.expressao).toBe('1d20+11');
    // O total nunca é menor que 12 nem maior que 31: o +11 realmente entrou.
    expect(mensagem.rolagem?.total).toBeGreaterThanOrEqual(12);
    expect(mensagem.rolagem?.total).toBeLessThanOrEqual(31);
    expect(ambiente.fakes.publicador.doTipo('mensagem:nova')).toHaveLength(1);
  });

  it('o Saber com especialização sai como uma rolagem própria', async () => {
    const { mesaId, calculavel } = await mesaComSeelah((dados) =>
      definicaoDoSistema('pathfinder2e').definirGrauDePericia(
        acrescentarSaber(dados, 'Guerra'),
        chaveDeSaber('Guerra'),
        'treinado',
      ),
    );
    const chave = chaveDeSaber('Guerra');

    // Nível 5, treinado, Inteligência +1 → +8.
    expect(expressaoDePericia(calculavel, chave)).toBe('1d20+8');

    const resposta = await rolar(
      bruno,
      mesaId,
      '1d20+8',
      motivoDeRolagemDePericia('pathfinder2e', chave, 'Seelah') ?? '',
    );

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json<MensagemDTO>().motivo).toBe('Saber (Guerra) — Seelah');
  });

  it('quem não participa da mesa recebe 403 e nada é publicado', async () => {
    // A guarda que existe de verdade. Ela não depende de a interface esconder o
    // botão: aqui a chamada é direta, sem tela nenhuma no caminho.
    const { mesaId } = await mesaComSeelah();

    const resposta = await rolar(estranho, mesaId, '1d20+11', 'Furtividade — Seelah');

    expect(resposta.statusCode).toBe(403);
    expect(resposta.json<{ erro: string }>().erro).toContain('não participa');
    expect(ambiente.fakes.publicador.doTipo('mensagem:nova')).toHaveLength(0);
  });

  it('a ficha grava os graus e os Saberes, e volta com eles para quem recarrega', async () => {
    // Sem isto o bônus certo viveria só na memória do navegador: a rolagem do
    // dia seguinte sairia com o número de uma ficha destreinada.
    const { mesaId, seelah } = await mesaComSeelah((dados) => acrescentarSaber(dados, 'Guerra'));

    const lista = await ambiente.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesaId}/personagens`,
      headers: bruno.cabecalhos,
    });
    const gravada = lista.json<PersonagemDTO[]>().find((p) => p.id === seelah.id);

    expect(gravada?.dados).toEqual(seelah.dados);
    expect(
      (gravada?.dados as { treinamentos: Record<string, string> }).treinamentos.furtividade,
    ).toBe('treinado');
    expect(gravada?.dados['saberes']).toEqual([{ especializacao: 'Guerra', grau: 'destreinado' }]);
  });

  it('Saber com especialização vazia é recusado com 400 em PT-BR, e nada é gravado', async () => {
    const { mesaId, seelah } = await mesaComSeelah();

    const resposta = await ambiente.app.inject({
      method: 'PATCH',
      url: `/api/personagens/${seelah.id}`,
      headers: bruno.cabecalhos,
      payload: { dados: { ...seelah.dados, saberes: [{ especializacao: '   ' }] } },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json<{ erro: string }>().erro).toContain('informe a especialização');

    const lista = await ambiente.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesaId}/personagens`,
      headers: bruno.cabecalhos,
    });
    expect(lista.json<PersonagemDTO[]>().find((p) => p.id === seelah.id)?.dados['saberes']).toEqual(
      [],
    );
  });

  it('treinamento numa chave que não é perícia do sistema é recusado nomeando a chave', async () => {
    // Percepção não é perícia no PF2e: ela é defesa (RV-155). Aceitá-la aqui
    // daria dois lugares para o mesmo número.
    const { seelah } = await mesaComSeelah();

    const resposta = await ambiente.app.inject({
      method: 'PATCH',
      url: `/api/personagens/${seelah.id}`,
      headers: bruno.cabecalhos,
      payload: {
        dados: {
          ...seelah.dados,
          treinamentos: {
            ...(seelah.dados['treinamentos'] as Record<string, string>),
            percepcao: 'treinado',
          },
        },
      },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json<{ erro: string }>().erro).toContain('percepcao');
  });
});
