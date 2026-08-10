import { describe, expect, it } from 'vitest';
import {
  INICIATIVA_MAXIMA,
  INICIATIVA_MINIMA,
  MAXIMO_PARTICIPANTES_COMBATE,
  MENSAGEM_INICIATIVA,
  MENSAGEM_PARTICIPANTES_COMBATE,
  MENSAGEM_PARTICIPANTE_DUPLICADO,
} from '@rolavinte/shared';
import {
  Combate,
  COMBATE_ENCERRADO,
  COMBATE_SEM_PARTICIPANTES,
  type ParticipanteCombate,
} from './combate';

/**
 * Invariantes do agregado `Combate` (RV-060), puras — sem repositório, sem mesa,
 * sem socket.
 *
 * As cinco que o card exige estão nomeadas nos `describe`. A mais escorregadia é
 * a ordem: um comparador que devolva `0` para dois empatados passa por qualquer
 * teste que só olhe "22 vem antes de 18", porque `Array.sort` é estável e a
 * primeira leitura acerta por acidente. Por isso o teste de estabilidade compara
 * **duas reconstituições com as linhas em ordens diferentes**, que é exatamente o
 * que o Postgres pode entregar.
 */

const MESA_ID = 'mesa-1';
const CENA_ID = 'cena-1';

function criarCombate(participantes: readonly { tokenId: string; nome: string }[]): Combate {
  const criado = Combate.criar({
    id: 'combate-1',
    mesaId: MESA_ID,
    cenaId: CENA_ID,
    participantes,
  });
  if (!criado.ok) throw new Error(`combate de teste inválido: ${criado.erro.mensagem}`);
  return criado.valor;
}

/** Três participantes, sem iniciativa rolada: a ordem é a de entrada. */
function trio(): Combate {
  return criarCombate([
    { tokenId: 't-a', nome: 'Valeros' },
    { tokenId: 't-b', nome: 'Merisiel' },
    { tokenId: 't-c', nome: 'Goblin' },
  ]);
}

function ordem(combate: Combate): string[] {
  return combate.participantes.map((p) => p.tokenId);
}

function participante(combate: Combate, tokenId: string): ParticipanteCombate {
  const achado = combate.participantes.find((p) => p.tokenId === tokenId);
  if (!achado) throw new Error(`participante ${tokenId} não está no combate`);
  return achado;
}

describe('Combate — criação', () => {
  it('nasce na rodada 1, ativo, com o turno no primeiro participante', () => {
    const combate = trio();

    expect(combate.rodada).toBe(1);
    expect(combate.ativo).toBe(true);
    expect(combate.indiceTurno).toBe(0);
    expect(combate.participanteDoTurno?.tokenId).toBe('t-a');
    expect(combate.participantes.map((p) => p.iniciativa)).toEqual([null, null, null]);
  });

  it('recusa lista vazia e lista acima do teto, com a mesma mensagem do schema', () => {
    const vazio = Combate.criar({ id: 'c', mesaId: MESA_ID, cenaId: CENA_ID, participantes: [] });
    expect(vazio.ok).toBe(false);
    if (!vazio.ok) {
      expect(vazio.erro.tipo).toBe('validacao');
      expect(vazio.erro.mensagem).toBe(MENSAGEM_PARTICIPANTES_COMBATE);
    }

    const demais = Combate.criar({
      id: 'c',
      mesaId: MESA_ID,
      cenaId: CENA_ID,
      participantes: Array.from({ length: MAXIMO_PARTICIPANTES_COMBATE + 1 }, (_, i) => ({
        tokenId: `t-${i}`,
        nome: `Peça ${i}`,
      })),
    });
    expect(demais.ok).toBe(false);
    if (!demais.ok) expect(demais.erro.mensagem).toBe(MENSAGEM_PARTICIPANTES_COMBATE);
  });

  it('recusa o mesmo token duas vezes', () => {
    const repetido = Combate.criar({
      id: 'c',
      mesaId: MESA_ID,
      cenaId: CENA_ID,
      participantes: [
        { tokenId: 't-a', nome: 'Valeros' },
        { tokenId: 't-a', nome: 'Valeros de novo' },
      ],
    });

    expect(repetido.ok).toBe(false);
    if (!repetido.ok) expect(repetido.erro.mensagem).toBe(MENSAGEM_PARTICIPANTE_DUPLICADO);
  });
});

describe('Combate — invariante 2: ordem decrescente com desempate estável', () => {
  it('ordena 18, 22 e 18 como 22, 18, 18', () => {
    const combate = trio();

    expect(combate.definirIniciativa('t-a', 18).ok).toBe(true);
    expect(combate.definirIniciativa('t-b', 22).ok).toBe(true);
    expect(combate.definirIniciativa('t-c', 18).ok).toBe(true);

    expect(combate.participantes.map((p) => p.iniciativa)).toEqual([22, 18, 18]);
    // Entre os empatados vale a ordem de entrada: 't-a' entrou antes de 't-c'.
    expect(ordem(combate)).toEqual(['t-b', 't-a', 't-c']);
  });

  it('a ordem entre empatados não muda quando as linhas chegam do banco ao contrário', () => {
    const participantes: ParticipanteCombate[] = [
      { tokenId: 't-a', nome: 'Valeros', iniciativa: 18, ordemDesempate: 1 },
      { tokenId: 't-b', nome: 'Merisiel', iniciativa: 22, ordemDesempate: 2 },
      { tokenId: 't-c', nome: 'Goblin', iniciativa: 18, ordemDesempate: 3 },
    ];
    const base = {
      id: 'combate-1',
      mesaId: MESA_ID,
      cenaId: CENA_ID,
      rodada: 1,
      indiceTurno: 0,
      ativo: true,
    };

    const primeiraLeitura = Combate.reconstituir({ ...base, participantes });
    const segundaLeitura = Combate.reconstituir({
      ...base,
      participantes: [...participantes].reverse(),
    });

    // A asserção é a sequência EXATA, e não "o primeiro é o de 22": um comparador
    // que devolvesse 0 para os empatados passaria naquela, porque `sort` é estável
    // e preservaria a ordem em que as linhas vieram — que aqui é a invertida.
    expect(ordem(primeiraLeitura)).toEqual(['t-b', 't-a', 't-c']);
    expect(ordem(segundaLeitura)).toEqual(['t-b', 't-a', 't-c']);
    expect(ordem(segundaLeitura)).toEqual(ordem(primeiraLeitura));
  });

  it('quem ainda não rolou fica no fim, mesmo perdendo para iniciativa negativa', () => {
    const combate = trio();

    expect(combate.definirIniciativa('t-c', -4).ok).toBe(true);
    expect(combate.definirIniciativa('t-b', 12).ok).toBe(true);

    expect(ordem(combate)).toEqual(['t-b', 't-c', 't-a']);
    expect(participante(combate, 't-a').iniciativa).toBeNull();
  });

  it('recusa iniciativa fora da faixa e não fracionária', () => {
    const combate = trio();

    for (const invalida of [INICIATIVA_MINIMA - 1, INICIATIVA_MAXIMA + 1, 10.5]) {
      const recusa = combate.definirIniciativa('t-a', invalida);
      expect(recusa.ok).toBe(false);
      if (!recusa.ok) {
        expect(recusa.erro.tipo).toBe('validacao');
        expect(recusa.erro.mensagem).toBe(MENSAGEM_INICIATIVA);
      }
    }
    expect(participante(combate, 't-a').iniciativa).toBeNull();
  });

  it('na preparação, quem começa é quem está no topo da ordem — não o primeiro selecionado', () => {
    const combate = trio();
    expect(combate.participanteDoTurno?.tokenId).toBe('t-a');

    expect(combate.definirIniciativa('t-b', 25).ok).toBe(true);
    expect(combate.definirIniciativa('t-c', 20).ok).toBe(true);

    // Ninguém agiu ainda (rodada 1, índice 0): a vez é de quem lidera a ordem.
    // Se o turno seguisse a pessoa aqui, o combate começaria pelo primeiro token
    // que o mestre selecionou, e ele teria de passar o turno às cegas até chegar
    // em quem tirou a iniciativa mais alta.
    expect(ordem(combate)).toEqual(['t-b', 't-c', 't-a']);
    expect(combate.participanteDoTurno?.tokenId).toBe('t-b');

    expect(combate.definirIniciativa('t-a', 30).ok).toBe(true);

    expect(ordem(combate)).toEqual(['t-a', 't-b', 't-c']);
    expect(combate.participanteDoTurno?.tokenId).toBe('t-a');
    expect(combate.indiceTurno).toBe(0);
  });

  it('depois de a luta começar, rolar iniciativa não tira a vez de quem está agindo', () => {
    const combate = trio();
    expect(combate.definirIniciativa('t-a', 20).ok).toBe(true);
    expect(combate.definirIniciativa('t-b', 15).ok).toBe(true);
    expect(combate.definirIniciativa('t-c', 10).ok).toBe(true);
    // Sai da preparação: a vez é do segundo da ordem.
    expect(combate.proximoTurno().ok).toBe(true);
    expect(combate.participanteDoTurno?.tokenId).toBe('t-b');

    // O último rola atrasado e passa todo mundo.
    expect(combate.definirIniciativa('t-c', 99).ok).toBe(true);

    expect(ordem(combate)).toEqual(['t-c', 't-a', 't-b']);
    // A vez continua sendo de 't-b' — agora no índice 2, e não do novo primeiro.
    expect(combate.participanteDoTurno?.tokenId).toBe('t-b');
    expect(combate.indiceTurno).toBe(2);
  });

  it('entrar no combate com iniciativa alta não rouba o turno de quem está nele', () => {
    const combate = trio();
    expect(combate.proximoTurno().ok).toBe(true);
    expect(combate.participanteDoTurno?.tokenId).toBe('t-b');

    expect(combate.adicionar({ tokenId: 't-d', nome: 'Reforço' }).ok).toBe(true);
    expect(combate.definirIniciativa('t-d', 99).ok).toBe(true);

    expect(ordem(combate)).toEqual(['t-d', 't-a', 't-b', 't-c']);
    expect(combate.participanteDoTurno?.tokenId).toBe('t-b');
  });
});

describe('Combate — invariante 3: virada de rodada', () => {
  it('passar o turno no terceiro de três vira a rodada 2 e volta ao primeiro', () => {
    const combate = trio();

    expect(combate.proximoTurno()).toMatchObject({ ok: true });
    expect(combate.proximoTurno()).toMatchObject({ ok: true });
    expect(combate.rodada).toBe(1);
    expect(combate.participanteDoTurno?.tokenId).toBe('t-c');

    const virada = combate.proximoTurno();

    expect(virada.ok).toBe(true);
    if (virada.ok) {
      expect(virada.valor.novaRodada).toBe(true);
      expect(virada.valor.rodada).toBe(2);
      expect(virada.valor.participante.tokenId).toBe('t-a');
    }
    expect(combate.rodada).toBe(2);
    expect(combate.indiceTurno).toBe(0);
  });

  it('no meio da rodada, novaRodada é falso e a rodada não muda', () => {
    const combate = trio();

    const passo = combate.proximoTurno();

    expect(passo.ok).toBe(true);
    if (passo.ok) {
      expect(passo.valor.novaRodada).toBe(false);
      expect(passo.valor.rodada).toBe(1);
      expect(passo.valor.participante.tokenId).toBe('t-b');
    }
    expect(combate.rodada).toBe(1);
  });

  it('com um participante só, cada passagem de turno vira uma rodada', () => {
    const combate = criarCombate([{ tokenId: 't-a', nome: 'Valeros' }]);

    expect(combate.proximoTurno()).toMatchObject({ ok: true, valor: { rodada: 2 } });
    expect(combate.proximoTurno()).toMatchObject({ ok: true, valor: { rodada: 3 } });
    expect(combate.indiceTurno).toBe(0);
  });
});

describe('Combate — invariante 4: remover quem está no turno', () => {
  it('o turno passa ao próximo da ordem, sem estourar índice', () => {
    const combate = trio();
    expect(combate.proximoTurno().ok).toBe(true);
    expect(combate.participanteDoTurno?.tokenId).toBe('t-b');

    expect(combate.remover('t-b').ok).toBe(true);

    expect(ordem(combate)).toEqual(['t-a', 't-c']);
    expect(combate.indiceTurno).toBe(1);
    expect(combate.participanteDoTurno?.tokenId).toBe('t-c');
  });

  it('remover quem já agiu não muda de quem é a vez', () => {
    const combate = trio();
    expect(combate.proximoTurno().ok).toBe(true);
    expect(combate.proximoTurno().ok).toBe(true);
    expect(combate.participanteDoTurno?.tokenId).toBe('t-c');

    expect(combate.remover('t-a').ok).toBe(true);

    // O índice caiu de 2 para 1, e é o MESMO participante na vez.
    expect(combate.indiceTurno).toBe(1);
    expect(combate.participanteDoTurno?.tokenId).toBe('t-c');
  });

  it('remover o último estando nele deixa o turno no novo último, e o passo seguinte vira a rodada', () => {
    const combate = trio();
    expect(combate.proximoTurno().ok).toBe(true);
    expect(combate.proximoTurno().ok).toBe(true);

    expect(combate.remover('t-c').ok).toBe(true);

    expect(combate.indiceTurno).toBe(1);
    expect(combate.participanteDoTurno?.tokenId).toBe('t-b');
    expect(combate.proximoTurno()).toMatchObject({ ok: true, valor: { rodada: 2 } });
    expect(combate.participanteDoTurno?.tokenId).toBe('t-a');
  });

  it('remover quem não está no combate é nao-encontrado, e nada muda', () => {
    const combate = trio();

    const recusa = combate.remover('t-z');

    expect(recusa.ok).toBe(false);
    if (!recusa.ok) expect(recusa.erro.tipo).toBe('nao-encontrado');
    expect(ordem(combate)).toEqual(['t-a', 't-b', 't-c']);
  });

  it('índice gravado além do fim (cascata de token apagado) volta para dentro da faixa', () => {
    // `combate_participantes.token_id` tem `on delete cascade`: apagar o token
    // some com a linha do participante pelas costas da aplicação, e o
    // `indice_turno` gravado antes fica apontando para o vazio.
    const combate = Combate.reconstituir({
      id: 'combate-1',
      mesaId: MESA_ID,
      cenaId: CENA_ID,
      rodada: 3,
      indiceTurno: 4,
      ativo: true,
      participantes: [
        { tokenId: 't-a', nome: 'Valeros', iniciativa: 19, ordemDesempate: 1 },
        { tokenId: 't-b', nome: 'Merisiel', iniciativa: 21, ordemDesempate: 2 },
      ],
    });

    expect(combate.indiceTurno).toBe(1);
    expect(combate.participanteDoTurno?.tokenId).toBe('t-a');
    expect(combate.rodada).toBe(3);
  });
});

describe('Combate — invariante 5: combate vazio', () => {
  it('passar o turno sem participantes recusa com conflito, sem quebrar e sem mexer na rodada', () => {
    const combate = criarCombate([{ tokenId: 't-a', nome: 'Valeros' }]);
    expect(combate.remover('t-a').ok).toBe(true);
    expect(combate.participantes).toHaveLength(0);
    expect(combate.participanteDoTurno).toBeNull();
    expect(combate.indiceTurno).toBe(0);

    const recusa = combate.proximoTurno();

    expect(recusa.ok).toBe(false);
    if (!recusa.ok) {
      expect(recusa.erro.tipo).toBe('conflito');
      expect(recusa.erro.mensagem).toBe(COMBATE_SEM_PARTICIPANTES);
    }
    expect(combate.rodada).toBe(1);
    expect(combate.indiceTurno).toBe(0);
  });

  it('reconstituir sem participantes não quebra e mantém o índice em 0', () => {
    const combate = Combate.reconstituir({
      id: 'combate-1',
      mesaId: MESA_ID,
      cenaId: CENA_ID,
      rodada: 7,
      indiceTurno: 3,
      ativo: true,
      participantes: [],
    });

    expect(combate.indiceTurno).toBe(0);
    expect(combate.participanteDoTurno).toBeNull();
    expect(combate.ordenar()).toEqual([]);
  });
});

describe('Combate — encerramento', () => {
  it('encerrar desativa o combate e recusa encerrar de novo', () => {
    const combate = trio();

    expect(combate.encerrar().ok).toBe(true);
    expect(combate.ativo).toBe(false);

    const denovo = combate.encerrar();
    expect(denovo.ok).toBe(false);
    if (!denovo.ok) {
      expect(denovo.erro.tipo).toBe('conflito');
      expect(denovo.erro.mensagem).toBe(COMBATE_ENCERRADO);
    }
  });

  it('combate encerrado é somente leitura: nenhuma escrita passa', () => {
    const combate = trio();
    expect(combate.encerrar().ok).toBe(true);

    const escritas = [
      () => combate.proximoTurno(),
      () => combate.definirIniciativa('t-a', 15),
      () => combate.adicionar({ tokenId: 't-d', nome: 'Reforço' }),
      () => combate.remover('t-a'),
    ];

    for (const escrever of escritas) {
      const recusa = escrever();
      expect(recusa.ok).toBe(false);
      if (!recusa.ok) {
        expect(recusa.erro.tipo).toBe('conflito');
        expect(recusa.erro.mensagem).toBe(COMBATE_ENCERRADO);
      }
    }
    expect(ordem(combate)).toEqual(['t-a', 't-b', 't-c']);
    expect(combate.rodada).toBe(1);
    expect(combate.indiceTurno).toBe(0);
  });
});
