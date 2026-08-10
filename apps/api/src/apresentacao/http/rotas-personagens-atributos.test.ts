import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  atributosIniciais,
  expressaoDePericia,
  type Atributos,
  type CriarMesaEntrada,
  type MesaDTO,
  type PersonagemCalculavel,
  type PersonagemDTO,
  type SistemaRpg,
} from '@rolavinte/shared';
import { criarAppDeTeste, type AppDeTeste, type SessaoDeTeste } from '../../testes/harness';

/**
 * O teste que faltava (RV-098): **informar o atributo e ler de volta**.
 *
 * O defeito de v0.7.0 passou com os 1.167 testes verdes porque cada metade era
 * testada sozinha. O schema de criação exigia `atributos` e havia teste disso; a
 * ficha de PF2e lia `dados.modificador*` e havia teste disso; **nada** exercitava
 * as duas juntas. O resultado: quem preenchia Força 18 na criação via o valor ser
 * gravado numa coluna que a ficha ignorava, e a perícia calculava como se fosse 0.
 *
 * Por isso cada caso aqui faz o percurso inteiro pela API — cria informando,
 * **relê pela listagem** e confere que o número que sai é o que entrou, e que é
 * dele que o bônus de perícia sai. O `expressaoDePericia` é o mesmo que a ficha do
 * navegador usa, então o que se prova é a ponta a ponta do cenário do card.
 *
 * Os dois sistemas estão aqui de propósito: PF2e é onde o defeito estava, e D&D 5e
 * é a regressão que o card proíbe (a escala 1..30 continua sendo a de sempre).
 */

let ambiente: AppDeTeste;
let mestre: SessaoDeTeste;
let bruno: SessaoDeTeste;

beforeEach(async () => {
  ambiente = criarAppDeTeste();
  mestre = await ambiente.autenticarComo({ nome: 'Mestre' });
  bruno = await ambiente.autenticarComo({ nome: 'Bruno' });
});

afterEach(async () => {
  await ambiente.encerrar();
});

async function criarMesa(sistema: SistemaRpg): Promise<MesaDTO> {
  const corpo: CriarMesaEntrada = { nome: 'A Era das Cinzas', descricao: '', sistema };
  const r = await ambiente.app.inject({
    method: 'POST',
    url: '/api/mesas',
    headers: mestre.cabecalhos,
    payload: corpo,
  });
  expect(r.statusCode).toBe(201);
  return r.json<MesaDTO>();
}

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
  expect(token, 'token de convite não encontrado no email').toBeTruthy();

  const aceite = await ambiente.app.inject({
    method: 'POST',
    url: '/api/convites/aceitar',
    headers: sessao.cabecalhos,
    payload: { token },
  });
  expect(aceite.statusCode).toBe(200);
}

/** Mesa daquele sistema com Bruno dentro. */
async function mesaCom(sistema: SistemaRpg): Promise<string> {
  const mesa = await criarMesa(sistema);
  await entrarNaMesa(mesa.id, bruno);
  return mesa.id;
}

async function criarFicha(mesaId: string, corpo: Record<string, unknown>) {
  return ambiente.app.inject({
    method: 'POST',
    url: `/api/mesas/${mesaId}/personagens`,
    headers: bruno.cabecalhos,
    payload: { nome: 'Seelah', classe: 'Paladina', nivel: 5, pvMax: 40, ...corpo },
  });
}

/** A ficha como o **banco** a devolve, e não como a criação a respondeu. */
async function relerFicha(mesaId: string, personagemId: string): Promise<PersonagemDTO> {
  const lista = await ambiente.app.inject({
    method: 'GET',
    url: `/api/mesas/${mesaId}/personagens`,
    headers: bruno.cabecalhos,
  });
  expect(lista.statusCode).toBe(200);
  const encontrada = lista.json<PersonagemDTO[]>().find((p) => p.id === personagemId);
  expect(encontrada, 'ficha sumiu da listagem').toBeDefined();
  return encontrada as PersonagemDTO;
}

function calculavel(ficha: PersonagemDTO): PersonagemCalculavel {
  return {
    sistema: ficha.sistema,
    nivel: ficha.nivel,
    atributos: ficha.atributos,
    dados: ficha.dados,
  };
}

describe('criar informando atributo e ler de volta — Pathfinder 2e (RV-098)', () => {
  /** Destreza +4 é o modificador do cenário do card; o resto fica em +0. */
  const MODIFICADORES: Atributos = { ...atributosIniciais('pathfinder2e'), destreza: 4 };

  it('o valor informado é o que volta do banco, e é dele que o bônus sai', async () => {
    const mesaId = await mesaCom('pathfinder2e');

    const criada = await criarFicha(mesaId, { atributos: MODIFICADORES });
    expect(criada.statusCode).toBe(201);
    expect(criada.json<PersonagemDTO>().atributos).toEqual(MODIFICADORES);

    const relida = await relerFicha(mesaId, criada.json<PersonagemDTO>().id);
    expect(relida.atributos).toEqual(MODIFICADORES);
    // Nível 5, destreinado em Furtividade: o nível não entra, então sobra o +4 da
    // Destreza — e antes do RV-098 este número era +0.
    expect(expressaoDePericia(calculavel(relida), 'furtividade')).toBe('1d20+4');
  });

  it('nenhum modificador sobra em `dados`: o atributo tem uma casa só', async () => {
    const mesaId = await mesaCom('pathfinder2e');

    const criada = await criarFicha(mesaId, { atributos: MODIFICADORES });
    const relida = await relerFicha(mesaId, criada.json<PersonagemDTO>().id);

    expect(Object.keys(relida.dados).filter((chave) => chave.startsWith('modificador'))).toEqual(
      [],
    );
  });

  it('sem atributo informado, a ficha nasce no padrão da escala do sistema', async () => {
    // E não num 10 fixo, que nesta escala significaria "+10 em tudo".
    const mesaId = await mesaCom('pathfinder2e');

    const criada = await criarFicha(mesaId, {});
    expect(criada.statusCode).toBe(201);

    const relida = await relerFicha(mesaId, criada.json<PersonagemDTO>().id);
    expect(relida.atributos).toEqual(atributosIniciais('pathfinder2e'));
    expect(expressaoDePericia(calculavel(relida), 'furtividade')).toBe('1d20+0');
  });

  it('informar 18 devolve 400 em PT-BR dizendo a escala, e nada é criado', async () => {
    const mesaId = await mesaCom('pathfinder2e');

    const r = await criarFicha(mesaId, {
      atributos: { ...atributosIniciais('pathfinder2e'), forca: 18 },
    });

    expect(r.statusCode).toBe(400);
    const erro = r.json<{ erro: string }>().erro;
    expect(erro).toContain('Força');
    expect(erro).toContain('18');
    expect(erro).toContain('de -5 a +8');

    const lista = await ambiente.app.inject({
      method: 'GET',
      url: `/api/mesas/${mesaId}/personagens`,
      headers: bruno.cabecalhos,
    });
    expect(lista.json<PersonagemDTO[]>()).toEqual([]);
  });

  it('editar o atributo pela ficha grava, e a rolagem seguinte já usa o novo', async () => {
    const mesaId = await mesaCom('pathfinder2e');
    const criada = await criarFicha(mesaId, {});
    const id = criada.json<PersonagemDTO>().id;

    const patch = await ambiente.app.inject({
      method: 'PATCH',
      url: `/api/personagens/${id}`,
      headers: bruno.cabecalhos,
      payload: { atributos: { ...atributosIniciais('pathfinder2e'), destreza: 3 } },
    });
    expect(patch.statusCode).toBe(200);

    const relida = await relerFicha(mesaId, id);
    expect(relida.atributos.destreza).toBe(3);
    expect(expressaoDePericia(calculavel(relida), 'furtividade')).toBe('1d20+3');
  });
});

describe('criar informando atributo e ler de volta — D&D 5e não regride (RV-098)', () => {
  const ATRIBUTOS_DE_THORIN: Atributos = {
    forca: 18,
    destreza: 16,
    constituicao: 14,
    inteligencia: 10,
    sabedoria: 12,
    carisma: 8,
  };

  it('a escala 1..30 continua valendo, e o bônus continua saindo da fórmula do d20', async () => {
    const mesaId = await mesaCom('dnd5e');

    const criada = await criarFicha(mesaId, { atributos: ATRIBUTOS_DE_THORIN });
    expect(criada.statusCode).toBe(201);

    const relida = await relerFicha(mesaId, criada.json<PersonagemDTO>().id);
    expect(relida.atributos).toEqual(ATRIBUTOS_DE_THORIN);
    // Destreza 16 → +3, nível 5 destreinado em Furtividade: só o +3.
    expect(expressaoDePericia(calculavel(relida), 'furtividade')).toBe('1d20+3');
  });

  it('sem atributo informado, continua nascendo em 10 — o padrão de sempre', async () => {
    const mesaId = await mesaCom('dnd5e');

    const criada = await criarFicha(mesaId, {});
    const relida = await relerFicha(mesaId, criada.json<PersonagemDTO>().id);

    expect(relida.atributos).toEqual({
      forca: 10,
      destreza: 10,
      constituicao: 10,
      inteligencia: 10,
      sabedoria: 10,
      carisma: 10,
    });
  });

  it('31 e 0 continuam recusados com 400 em PT-BR', async () => {
    const mesaId = await mesaCom('dnd5e');

    for (const valor of [31, 0]) {
      const r = await criarFicha(mesaId, {
        atributos: { ...ATRIBUTOS_DE_THORIN, forca: valor },
      });
      expect(r.statusCode, `Força ${valor}`).toBe(400);
      expect(r.json<{ erro: string }>().erro).toContain('de 1 a 30');
    }
  });

  it('a mesma ficha genérica de antes deste card continua criando e lendo igual', async () => {
    const mesaId = await mesaCom('generico');

    const criada = await criarFicha(mesaId, {
      nome: 'Balin',
      atributos: ATRIBUTOS_DE_THORIN,
      anotacoes: 'Machado do pai.',
    });
    expect(criada.statusCode).toBe(201);

    const relida = await relerFicha(mesaId, criada.json<PersonagemDTO>().id);
    expect(relida.atributos).toEqual(ATRIBUTOS_DE_THORIN);
    expect(relida.anotacoes).toBe('Machado do pai.');
    expect(relida.dados).toEqual({});
  });
});
