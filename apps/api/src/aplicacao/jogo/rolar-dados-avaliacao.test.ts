import { describe, expect, it } from 'vitest';
import { cdValida, CD_MAXIMA, MENSAGEM_CD_INVALIDA, type SistemaRpg } from '@rolavinte/shared';
import { RolarDados } from './rolar-dados';
import { Mesa } from '../../dominio/mesas/mesa';
import { Usuario } from '../../dominio/contas/usuario';
import { ServicoRolagemDados } from '../../dominio/jogo/servico-rolagem';
import {
  FakeMensagemRepository,
  FakeMesaRepository,
  FakePublicadorEventosMesa,
  FakeUsuarioRepository,
  GeradorIdSequencial,
  RelogioFixo,
} from '../../testes/fakes';

/**
 * Grau de sucesso no chat (RV-154), no nível do caso de uso.
 *
 * O que este arquivo prova é o **ponto de extensão**: a mesma classe `RolarDados`,
 * sem uma linha que cite um sistema, produz avaliação numa mesa de Pathfinder 2e
 * e recusa a CD numa mesa genérica — porque quem responde é a definição do
 * sistema, buscada no registro. Se alguém trocar isso por um `if
 * (mesa.sistema === 'pathfinder2e')`, os testes continuam passando e o DoD do
 * card é violado; o que estes testes garantem é o **comportamento** por sistema,
 * e a ausência do `switch` é garantida pela varredura do RV-091 mais a revisão.
 */

const AGORA = new Date('2026-08-10T12:00:00Z');
const MESA_ID = 'mesa-1';
const MESTRE_ID = 'mestre-1';
const JOGADOR_ID = 'jogador-1';

/** RNG que força a face pedida num d20 (`floor(sorteio * 20) + 1`). */
function rngDoD20(face: number) {
  return () => (face - 1) / 20 + 0.001;
}

async function criarCenario(sistema: SistemaRpg, face = 17) {
  const usuarios = new FakeUsuarioRepository();
  for (const [id, nome] of [
    [MESTRE_ID, 'Mestre'],
    [JOGADOR_ID, 'Seelah'],
  ] as const) {
    const u = Usuario.criar({ id, nome, email: `${id}@ex.com`, senhaHash: 'hash', agora: AGORA });
    if (!u.ok) throw new Error('usuário inválido');
    await usuarios.salvar(u.valor);
  }

  const mesas = new FakeMesaRepository(usuarios);
  const criada = Mesa.criar({
    id: MESA_ID,
    nome: 'A Era das Cinzas',
    descricao: '',
    sistema,
    mestreId: MESTRE_ID,
    agora: AGORA,
  });
  if (!criada.ok) throw new Error('mesa inválida');
  const mesa = criada.valor;
  const convite = mesa.convidar({
    solicitanteId: MESTRE_ID,
    nomeSolicitante: 'Mestre',
    emailConvidado: `${JOGADOR_ID}@ex.com`,
    conviteId: 'convite-1',
    tokenConvite: 'token-1',
    agora: AGORA,
  });
  if (!convite.ok) throw new Error('convite inválido');
  const aceito = mesa.aceitarConvite({
    token: 'token-1',
    usuarioId: JOGADOR_ID,
    emailUsuario: `${JOGADOR_ID}@ex.com`,
    agora: AGORA,
  });
  if (!aceito.ok) throw new Error('convite não aceito');
  await mesas.salvar(mesa);

  const mensagens = new FakeMensagemRepository();
  const publicador = new FakePublicadorEventosMesa();
  return {
    mensagens,
    publicador,
    rolarDados: new RolarDados(
      mensagens,
      mesas,
      usuarios,
      new ServicoRolagemDados(rngDoD20(face)),
      new GeradorIdSequencial(),
      new RelogioFixo(AGORA),
      publicador,
    ),
  };
}

describe('RolarDados — mesa de Pathfinder 2e com CD (RV-154)', () => {
  it('o cenário do card: 1d20+11 cd 18 com o d20 em 17 sai como sucesso crítico', async () => {
    const { rolarDados } = await criarCenario('pathfinder2e', 17);

    const r = await rolarDados.executar(JOGADOR_ID, MESA_ID, {
      expressao: '1d20+11',
      motivo: 'Furtividade — Seelah',
      cd: 18,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.rolagem?.total).toBe(28);
    expect(r.valor.avaliacao).toEqual({
      cd: 18,
      grau: 'sucesso-critico',
      d20Natural: 17,
      efeitoNatural: null,
    });
  });

  it('20 natural contra CD 40 é falha, com o ajuste registrado — não sucesso automático', async () => {
    const { rolarDados } = await criarCenario('pathfinder2e', 20);

    const r = await rolarDados.executar(JOGADOR_ID, MESA_ID, {
      expressao: '1d20+2',
      motivo: '',
      cd: 40,
    });

    expect(r.ok && r.valor.avaliacao?.grau).toBe('falha');
    expect(r.ok && r.valor.avaliacao?.efeitoNatural).toBe('melhorou');
  });

  it('sem CD, a mensagem sai exatamente como antes deste card', async () => {
    const { rolarDados, mensagens } = await criarCenario('pathfinder2e', 17);

    const r = await rolarDados.executar(JOGADOR_ID, MESA_ID, {
      expressao: '1d20+11',
      motivo: 'Furtividade — Seelah',
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Sem CD não há grau, e não existe CD padrão: inventar uma faria o chat
    // dizer "Falha" numa rolagem de dano.
    expect(r.valor.avaliacao).toBeNull();
    expect(r.valor.tipo).toBe('rolagem');
    expect(r.valor.rolagem?.total).toBe(28);
    expect(mensagens.salvas.at(0)?.avaliacao).toBeNull();
  });

  it('a avaliação é persistida e vai no broadcast, não só na resposta', async () => {
    const { rolarDados, mensagens, publicador } = await criarCenario('pathfinder2e', 17);

    await rolarDados.executar(JOGADOR_ID, MESA_ID, { expressao: '1d20+11', motivo: '', cd: 18 });

    expect(mensagens.salvas.at(0)?.avaliacao?.grau).toBe('sucesso-critico');
    const publicados = publicador.doTipo('mensagem:nova');
    expect(publicados).toHaveLength(1);
    // Quem já está com a mesa aberta vê o grau sem recarregar.
    expect(publicados[0]?.dados.avaliacao?.grau).toBe('sucesso-critico');
  });

  it('a rolagem oculta do mestre também é avaliada, e continua só dele', async () => {
    const { rolarDados, publicador } = await criarCenario('pathfinder2e', 17);

    const r = await rolarDados.executar(MESTRE_ID, MESA_ID, {
      expressao: '1d20+11',
      motivo: 'percepção do goblin',
      cd: 18,
      oculta: true,
    });

    expect(r.ok && r.valor.avaliacao?.grau).toBe('sucesso-critico');
    // A avaliação viaja dentro da mensagem e herda a visibilidade dela (RV-071).
    expect(publicador.doTipo('mensagem:nova')).toHaveLength(0);
    expect(publicador.doTipo('mensagem:privada')).toHaveLength(1);
  });
});

describe('RolarDados — sistema que não avalia recusa a CD (RV-154)', () => {
  it('mesa genérica com CD devolve Validacao nomeando o sistema, sem criar mensagem', async () => {
    const { rolarDados, mensagens, publicador } = await criarCenario('generico');

    const r = await rolarDados.executar(JOGADOR_ID, MESA_ID, {
      expressao: '1d20+5',
      motivo: '',
      cd: 15,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('validacao');
    expect(r.erro.mensagem).toContain('Genérico');
    expect(r.erro.mensagem).toContain('grau de sucesso');
    // Descartar a CD em silêncio seria pior que recusar (F6): nada é gravado nem
    // publicado.
    expect(mensagens.salvas).toHaveLength(0);
    expect(publicador.publicados).toHaveLength(0);
  });

  it('mesa genérica SEM CD continua rolando como sempre', async () => {
    // A regressão que importa: o card não pode tirar dados de ninguém.
    const { rolarDados } = await criarCenario('generico', 20);

    const r = await rolarDados.executar(JOGADOR_ID, MESA_ID, { expressao: '1d20+5', motivo: '' });

    expect(r.ok && r.valor.rolagem?.total).toBe(25);
    expect(r.ok && r.valor.avaliacao).toBeNull();
  });

  it('mesa de D&D 5e também recusa a CD, nomeando D&D 5e', async () => {
    const { rolarDados } = await criarCenario('dnd5e');

    const r = await rolarDados.executar(JOGADOR_ID, MESA_ID, {
      expressao: '1d20+5',
      motivo: '',
      cd: 15,
    });

    expect(!r.ok && r.erro.mensagem).toContain('D&D 5e');
  });
});

describe('RolarDados — CD fora da faixa não passa nem pelo caso de uso', () => {
  /**
   * A borda **e** a faixa: o parser do chat e o schema da rota já barram, mas a
   * validação existir só nas bordas é o que o RV-156 vai furar quando criar um
   * caminho de escrita novo. O número da faixa é um só (`cdValida`), e este teste
   * o consulta em vez de reescrever.
   */
  const FORA_DA_FAIXA = [0, -3, CD_MAXIMA + 1, 18.5];

  it.each(FORA_DA_FAIXA)('cd %s é 400 em PT-BR e nada é gravado', async (cd) => {
    expect(cdValida(cd)).toBe(false);
    const { rolarDados, mensagens, publicador } = await criarCenario('pathfinder2e');

    const r = await rolarDados.executar(JOGADOR_ID, MESA_ID, {
      expressao: '1d20+3',
      motivo: '',
      cd,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.tipo).toBe('validacao');
    expect(r.erro.mensagem).toBe(MENSAGEM_CD_INVALIDA);
    expect(mensagens.salvas).toHaveLength(0);
    expect(publicador.publicados).toHaveLength(0);
  });

  it('quem não participa da mesa recebe 403 antes de qualquer avaliação', async () => {
    const { rolarDados, mensagens, publicador } = await criarCenario('pathfinder2e');

    const r = await rolarDados.executar('intruso', MESA_ID, {
      expressao: '1d20+11',
      motivo: '',
      cd: 18,
    });

    expect(!r.ok && r.erro.tipo).toBe('nao-autorizado');
    expect(mensagens.salvas).toHaveLength(0);
    expect(publicador.publicados).toHaveLength(0);
  });
});
