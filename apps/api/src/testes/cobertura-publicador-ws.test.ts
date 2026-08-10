import { describe, expect, it } from 'vitest';
import {
  EVENTOS_SERVIDOR_PARA_CLIENTE,
  SALA_MESA,
  type CenaDTO,
  type MensagemDTO,
  type NomeEventoServidorParaCliente,
  type PersonagemDTO,
  type TokenDTO,
} from '@rolavinte/shared';
import type { PublicadorEventosMesa } from '../aplicacao/ports/infraestrutura';
import { PublicadorSocket } from '../apresentacao/ws/publicador-socket';
import type { ServidorJogo } from '../apresentacao/ws/servidor-socket';

/**
 * Cobertura de publicadores WS (RV-116) — o lado que o RV-115 deixou aberto.
 *
 * O RV-115 provou que todo evento do contrato tem **ouvinte** no cliente
 * (`apps/web/src/features/jogo/cobertura-eventos-ws.test.ts`). Falta o órfão ao
 * contrário: um evento declarado em `EventosServidorParaCliente`, assinado pelo
 * front, e que **ninguém emite**. Na tela o sintoma é idêntico ao do órfão
 * original — nada acontece — e nem tipo, nem lint, nem build acusam.
 *
 * ## Como este arquivo mede, e por que não por regex
 *
 * A tentação é varrer o fonte do `PublicadorSocket` atrás de `emit('x')`. Isso
 * mede texto, não comportamento: um `emit` dentro de um ramo morto passaria, e
 * um nome montado em variável falharia. Aqui a medição é por **símbolo e
 * execução**:
 *
 * 1. `PUBLICACAO_POR_EVENTO` é um `Record<NomeEventoServidorParaCliente, …>` —
 *    acrescentar um evento ao contrato sem entrada aqui já não compila, e o
 *    corpo da entrada só compila se existir o método correspondente na port.
 * 2. Cada entrada é **executada** contra o adapter real (`PublicadorSocket`) com
 *    um `io` falso que registra as emissões, e o teste exige que a emissão
 *    carregue exatamente o nome do evento do contrato. Método que existe mas
 *    emite outro nome é denunciado com os dois nomes na mensagem.
 * 3. A checagem de chave faltando é refeita **em runtime**, porque `npm run
 *    test` não roda o typechecker: sem ela, um evento novo passaria verde na
 *    suíte e só quebraria em `npm run check`.
 *
 * ## O que este arquivo deliberadamente não cobre
 *
 * - **Método de publicação que nenhum caso de uso chama.** O contrato tem
 *   publicador, mas ninguém puxa o gatilho. É outro defeito, e a cobertura dele
 *   seria por caso de uso, não aqui.
 * - **Autorização do gateway.** O cenário "payload hostil continua recusado, sem
 *   tocar em repositório e sem entrar em sala" já é fixado em
 *   `apresentacao/ws/gateway-jogo.test.ts`, com uma tabela de payloads. Repetir
 *   aqui criaria duas cópias da mesma verdade para divergirem.
 * - **Evento publicado que não existe no contrato.** Não tem como escrever: os
 *   payloads da port vêm de `PayloadEventoServidor<'nome'>`, que não resolve
 *   para um nome inexistente — `npm run check` quebra antes.
 */

const MESA_ID = 'mesa-1';

const MENSAGEM: MensagemDTO = {
  id: 'm1',
  mesaId: MESA_ID,
  autorId: 'u1',
  autorNome: 'Aria',
  tipo: 'fala',
  conteudo: 'olá',
  rolagem: null,
  motivo: null,
  avaliacao: null,
  criadoEm: '2026-08-09T12:00:00.000Z',
  destinatarioId: null,
  destinatarioNome: null,
};

const TOKEN: TokenDTO = {
  id: 't1',
  cenaId: 'cena-1',
  nome: 'Thorin',
  cor: '#c9a227',
  x: 3,
  y: 4,
  personagemId: null,
  imagemUrl: null,
};

const CENA: CenaDTO = {
  id: 'cena-1',
  mesaId: MESA_ID,
  nome: 'Cripta',
  larguraGrid: 20,
  alturaGrid: 15,
  corFundo: '#101010',
  ativa: true,
  imagemFundoUrl: null,
  tamanhoCelula: 44,
  gridVisivel: true,
  corGrid: '#3a4a63',
};

const PERSONAGEM: PersonagemDTO = {
  id: 'p1',
  mesaId: MESA_ID,
  donoId: 'u1',
  donoNome: 'Aria',
  nome: 'Thorin',
  classe: 'Guerreiro',
  nivel: 3,
  pvAtual: 12,
  pvMax: 30,
  atributos: {
    forca: 16,
    destreza: 10,
    constituicao: 14,
    inteligencia: 8,
    sabedoria: 12,
    carisma: 10,
  },
  anotacoes: '',
  // Campos que o RV-091 acrescentou ao `PersonagemDTO`.
  sistema: 'dnd5e',
  dados: {},
};

/**
 * Uma forma de publicar cada evento do contrato. O `Record` é o ponto do
 * mecanismo: chave faltando ou chave sobrando não compila.
 */
const PUBLICACAO_POR_EVENTO: Record<
  NomeEventoServidorParaCliente,
  (publicador: PublicadorEventosMesa) => void
> = {
  'mensagem:nova': (p) => p.mensagemNova(MESA_ID, MENSAGEM),
  'token:criado': (p) => p.tokenCriado(MESA_ID, TOKEN),
  'token:atualizado': (p) => p.tokenAtualizado(MESA_ID, TOKEN),
  'token:removido': (p) => p.tokenRemovido(MESA_ID, { tokenId: TOKEN.id, cenaId: TOKEN.cenaId }),
  'cena:ativada': (p) => p.cenaAtivada(MESA_ID, CENA),
  'personagem:atualizado': (p) => p.personagemAtualizado(MESA_ID, PERSONAGEM),
  'mesa:participante-removido': (p) => p.participanteRemovido(MESA_ID, { usuarioId: 'u1' }),
};

interface Emissao {
  salas: string[];
  evento: string;
}

/** `io` mínimo: só o que o adapter usa — `to(...).emit(...)` e `in(...).fetchSockets()`. */
function criarIoFalso() {
  const emissoes: Emissao[] = [];
  const io = {
    to(salas: string | string[]) {
      const alvo = Array.isArray(salas) ? salas : [salas];
      return {
        emit(evento: string) {
          emissoes.push({ salas: alvo, evento });
        },
      };
    },
    in() {
      return { fetchSockets: () => Promise.resolve([]) };
    },
  };
  return { io: io as unknown as ServidorJogo, emissoes };
}

/** Executa a publicação do evento contra o adapter real e devolve o que saiu no fio. */
function emissoesDe(evento: NomeEventoServidorParaCliente): Emissao[] {
  const publicar = PUBLICACAO_POR_EVENTO[evento] as
    ((publicador: PublicadorEventosMesa) => void) | undefined;
  // Evento sem entrada no mapa devolve "nada saiu no fio" em vez de estourar um
  // TypeError: a asserção abaixo é que precisa falhar, com o nome do evento na
  // mensagem. Rastreamento de pilha não diz a quem lê o que fazer.
  if (!publicar) return [];
  const { io, emissoes } = criarIoFalso();
  publicar(new PublicadorSocket(io));
  return emissoes;
}

describe('cobertura dos publicadores servidor→cliente (RV-116)', () => {
  it('o contrato exportado como valor não está vazio', () => {
    // Rede de segurança do próprio teste: com a lista vazia, todo `filter`
    // abaixo devolveria `[]` e o arquivo passaria sem verificar coisa alguma.
    expect(EVENTOS_SERVIDOR_PARA_CLIENTE.length).toBeGreaterThan(0);
  });

  it('todo evento do contrato tem uma forma de ser publicado', () => {
    const semPublicador = EVENTOS_SERVIDOR_PARA_CLIENTE.filter(
      (evento) => !(evento in PUBLICACAO_POR_EVENTO),
    );

    expect(
      semPublicador,
      `Evento(s) declarados em EventosServidorParaCliente que ninguém emite: ` +
        `${semPublicador.join(', ')}. O cliente pode até assiná-lo(s), mas nada nunca chega — ` +
        `o sintoma na tela é o mesmo de um evento sem ouvinte. Declare o método em ` +
        `PublicadorEventosMesa, implemente-o em PublicadorSocket e registre a publicação em ` +
        `PUBLICACAO_POR_EVENTO, neste arquivo.`,
    ).toEqual([]);
  });

  it('não registra publicação para evento fora do contrato (pega erro de digitação)', () => {
    const nomesContratados: readonly string[] = EVENTOS_SERVIDOR_PARA_CLIENTE;
    const foraDoContrato = Object.keys(PUBLICACAO_POR_EVENTO).filter(
      (evento) => !nomesContratados.includes(evento),
    );

    expect(
      foraDoContrato,
      `Publicação registrada para evento(s) que não existem no contrato: ` +
        `${foraDoContrato.join(', ')}. Ou o nome está errado, ou falta declará-lo em ` +
        `packages/shared/src/tipos/eventos-ws.ts.`,
    ).toEqual([]);
  });

  it.each([...EVENTOS_SERVIDOR_PARA_CLIENTE])(
    'o adapter real emite "%s" com esse nome exato, na sala da mesa',
    (evento) => {
      const emissoes = emissoesDe(evento);
      const nomesEmitidos = emissoes.map((e) => e.evento);

      expect(
        nomesEmitidos,
        `Publicar "${evento}" pelo PublicadorSocket colocou no fio ` +
          `${nomesEmitidos.length === 0 ? 'nada' : nomesEmitidos.join(', ')}. O front assina ` +
          `"${evento}" e ficaria esperando para sempre.`,
      ).toContain(evento);

      // Sem sala não há entrega: `emit` fora de `to(...)` é broadcast global, e
      // o contrário — sala errada — entrega o fato à mesa de outra gente.
      expect(emissoes.find((e) => e.evento === evento)?.salas).toContain(SALA_MESA(MESA_ID));
    },
  );
});
