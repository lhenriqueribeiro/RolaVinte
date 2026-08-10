import { useId, useState } from 'react';
import {
  cdValida,
  CD_MAXIMA,
  CD_MINIMA,
  type AtaqueCalculado,
  type ModeloDeAtaques,
  type RolagemDeAtaqueCalculada,
} from '@rolavinte/shared';
import { Botao } from '@/components/ui/Botao';
import { CampoDoSistema } from './CamposDoSistema';

/**
 * Ataques com a penalidade de ataques múltiplos já aplicada (RV-156).
 *
 * **A escolha da ordem é do jogador, e a tela diz isso.** Não há contador de MAP em
 * lugar nenhum — nem aqui, nem no servidor: sem o controle de turno (RV-062) a
 * plataforma não sabe de quem é o turno nem quando zerar, e um contador que erra é
 * pior que nenhum, porque o jogador confia nele. Então os três botões existem
 * rotulados ("1º ataque", "2º ataque (-5)", "3º ataque ou mais (-10)") e quem aponta
 * é ele. Nada nesta tela é chamado de "automático", e o texto da seção vem do
 * modelo do sistema — regra escrita no JSX divergiria da regra que está no cálculo.
 *
 * **Acerto e dano são botões separados**, porque são duas rolagens no chat (o mesmo
 * que o RV-092 diz para D&D 5e). E só o acerto leva a CA do alvo: dano não é checado
 * contra CD, então a variante de dano nunca recebe CD — a separação vem do contrato
 * (`acertos` e `danos` são listas distintas), e não de um `if` que alguém pode
 * esquecer aqui.
 *
 * **A CA do alvo é efêmera de propósito.** Ela é de quem está sendo atacado, não do
 * personagem: gravá-la na ficha seria guardar na minha ficha um dado do inimigo. Ela
 * vive no estado desta seção, e é isso que a ajuda do modelo diz ao jogador.
 *
 * Nenhuma aritmética acontece neste arquivo: expressão, rótulo e detalhe chegam
 * prontos de `@rolavinte/shared`. Se um `-5` aparecer no JSX, a penalidade passou a
 * existir em dois lugares.
 */

interface PropsRolagem {
  rolagem: RolagemDeAtaqueCalculada;
  nomeDoAtaque: string;
  /** Preenchido trava a rolagem, e o texto explica por quê (mesa encerrada). */
  motivoBloqueio: string | null;
  aoRolar(rolagem: RolagemDeAtaqueCalculada): void;
}

/**
 * Um botão de rolagem.
 *
 * Botão sem o que rolar fica **desabilitado, e não escondido**: `expressao === null`
 * significa que falta um dado à ficha, e o motivo aparece em texto logo abaixo do
 * grupo. Sumir com o controle é o que faz o jogador achar que a ficha está pronta.
 */
function BotaoDeRolagem({ rolagem, nomeDoAtaque, motivoBloqueio, aoRolar }: PropsRolagem) {
  const semExpressao = rolagem.expressao === null;
  const desabilitado = semExpressao || motivoBloqueio !== null;
  const sufixo = rolagem.expressao === null ? '' : ` (${rolagem.expressao})`;
  return (
    <button
      type="button"
      className="shrink-0 cursor-pointer rounded bg-fundo px-2 py-1 text-xs text-ouro hover:bg-ouro/10 disabled:cursor-not-allowed disabled:opacity-50"
      aria-label={`Rolar ${rolagem.rotulo} de ${nomeDoAtaque}${sufixo}`}
      // O `title` carrega a composição do número ("+9 informado, penalidade -5 do 2º
      // ataque = +4") ou o motivo do bloqueio. O que falta na ficha vai em texto
      // visível, fora do `title`, logo abaixo.
      title={motivoBloqueio ?? rolagem.detalhe}
      disabled={desabilitado}
      onClick={() => aoRolar(rolagem)}
    >
      🎲 {rolagem.rotulo}
    </button>
  );
}

interface PropsGrupo {
  titulo: string;
  rolagens: readonly RolagemDeAtaqueCalculada[];
  nomeDoAtaque: string;
  motivoBloqueio: string | null;
  aoRolar(rolagem: RolagemDeAtaqueCalculada): void;
}

function GrupoDeRolagens({ titulo, rolagens, nomeDoAtaque, motivoBloqueio, aoRolar }: PropsGrupo) {
  // Quando nada do grupo pode rolar, o motivo é o mesmo para todos (falta o bônus de
  // acerto, falta o dano) e aparece uma vez, em texto.
  const pendencias = [
    ...new Set(rolagens.filter((r) => r.expressao === null).map((r) => r.detalhe)),
  ];
  return (
    <div className="mt-2">
      <p className="text-[11px] text-texto-2">{titulo}</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {rolagens.map((rolagem) => (
          <BotaoDeRolagem
            key={rolagem.chave}
            rolagem={rolagem}
            nomeDoAtaque={nomeDoAtaque}
            motivoBloqueio={motivoBloqueio}
            aoRolar={aoRolar}
          />
        ))}
      </div>
      {pendencias.map((motivo) => (
        <p key={motivo} className="mt-1 text-[11px] text-texto-2">
          {motivo}
        </p>
      ))}
    </div>
  );
}

interface PropsAtaque {
  ataque: AtaqueCalculado;
  modelo: ModeloDeAtaques;
  desabilitado: boolean;
  motivoBloqueio: string | null;
  aoRemover(ataqueChave: string): void;
  aoAlterarCampo(ataqueChave: string, campo: string, valor: unknown): void;
  aoRolarAcerto(rolagem: RolagemDeAtaqueCalculada): void;
  aoRolarDano(rolagem: RolagemDeAtaqueCalculada): void;
}

function LinhaDeAtaque({
  ataque,
  modelo,
  desabilitado,
  motivoBloqueio,
  aoRemover,
  aoAlterarCampo,
  aoRolarAcerto,
  aoRolarDano,
}: PropsAtaque) {
  return (
    <li className="rounded-lg border border-borda bg-painel-2 px-2 py-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm text-texto">{ataque.nome}</span>
        <button
          type="button"
          className="shrink-0 cursor-pointer rounded bg-fundo px-2 py-1 text-xs text-texto-2 hover:text-perigo disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={`Remover ${ataque.nome}`}
          title={desabilitado ? 'Ficha somente leitura.' : `Remover ${ataque.nome}`}
          disabled={desabilitado}
          onClick={() => aoRemover(ataque.chave)}
        >
          ✕
        </button>
      </div>

      {/* Os campos informados usam o mesmo renderizador das seções da ficha: quem
          sabe o tipo de cada um é a definição do sistema, e o `never` do `switch`
          impede um tipo novo de sumir em silêncio. O saco de valores aqui é o do
          ataque, não o `dados` inteiro — a tela não sabe onde a lista mora. */}
      <div className="mt-2 grid grid-cols-2 gap-3">
        {modelo.campos.map((campo) => (
          <CampoDoSistema
            key={campo.chave}
            campo={campo}
            dados={ataque.valores}
            desabilitado={desabilitado}
            aoAlterar={(chave, valor) => aoAlterarCampo(ataque.chave, chave, valor)}
          />
        ))}
      </div>

      <GrupoDeRolagens
        titulo="Acerto — escolha o golpe do turno"
        rolagens={ataque.acertos}
        nomeDoAtaque={ataque.nome}
        motivoBloqueio={motivoBloqueio}
        aoRolar={aoRolarAcerto}
      />
      <GrupoDeRolagens
        titulo="Dano"
        rolagens={ataque.danos}
        nomeDoAtaque={ataque.nome}
        motivoBloqueio={motivoBloqueio}
        aoRolar={aoRolarDano}
      />
    </li>
  );
}

interface Props {
  modelo: ModeloDeAtaques;
  ataques: readonly AtaqueCalculado[];
  /** Edição travada (ficha de outro jogador, mesa encerrada…). */
  desabilitado: boolean;
  /** Preenchido trava também a rolagem, e o texto explica por quê. */
  motivoBloqueio: string | null;
  aoAcrescentar(nome: string): void;
  aoRemover(ataqueChave: string): void;
  aoAlterarCampo(ataqueChave: string, campo: string, valor: unknown): void;
  /** A CD só existe no acerto: `cd` é `null` quando a CA do alvo não foi informada. */
  aoRolarAcerto(rolagem: RolagemDeAtaqueCalculada, cd: number | null): void;
  aoRolarDano(rolagem: RolagemDeAtaqueCalculada): void;
}

export function SecaoAtaques({
  modelo,
  ataques,
  desabilitado,
  motivoBloqueio,
  aoAcrescentar,
  aoRemover,
  aoAlterarCampo,
  aoRolarAcerto,
  aoRolarDano,
}: Props) {
  const idNovo = useId();
  const idCd = useId();
  const [nomeNovo, setNomeNovo] = useState('');
  const [caDoAlvo, setCaDoAlvo] = useState('');

  const vazio = nomeNovo.trim() === '';
  const cheio = ataques.length >= modelo.limite;
  // Só uma CD dentro da faixa viaja. Fora dela, a rolagem sai **sem** CD em vez de
  // levar um número que a api recusaria com 400: quem digitou 200 não perde o golpe,
  // só não vê o grau.
  const cd = cdValida(Number(caDoAlvo)) ? Number(caDoAlvo) : null;

  return (
    <fieldset className="mt-4">
      <legend className="mb-2 text-sm text-texto-2">{modelo.rotulo}</legend>
      {/* A regra do MAP e a do crítico vêm do sistema, em texto — inclusive a frase
          que diz que a contagem é do jogador (F6: a tela não promete o que a
          plataforma não faz). */}
      <p className="mb-2 text-[11px] text-texto-2">{modelo.ajuda}</p>

      <div className="mb-2 flex flex-col gap-1">
        <label htmlFor={idCd} className="text-[11px] text-texto-2">
          {modelo.rotuloCdAlvo}
        </label>
        <input
          id={idCd}
          type="number"
          min={CD_MINIMA}
          max={CD_MAXIMA}
          className="w-24 rounded border border-borda bg-fundo px-2 py-1 text-xs text-texto focus:border-ouro focus:outline-none"
          value={caDoAlvo}
          onChange={(e) => setCaDoAlvo(e.target.value)}
        />
        <p className="text-[11px] text-texto-2">{modelo.ajudaCdAlvo}</p>
      </div>

      {ataques.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {ataques.map((ataque) => (
            <LinhaDeAtaque
              key={ataque.chave}
              ataque={ataque}
              modelo={modelo}
              desabilitado={desabilitado}
              motivoBloqueio={motivoBloqueio}
              aoRemover={aoRemover}
              aoAlterarCampo={aoAlterarCampo}
              aoRolarAcerto={(rolagem) => aoRolarAcerto(rolagem, cd)}
              aoRolarDano={aoRolarDano}
            />
          ))}
        </ul>
      )}

      {/* O botão fica desabilitado **com o motivo no `title`** em vez de sumir, e o
          campo vazio é motivo declarado: é o defeito que o RV-159 registrou na seção
          de perícias (clique que esvazia o campo e não salva nada). */}
      <div className="mt-2 flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={idNovo} className="text-[11px] text-texto-2">
            {modelo.rotuloNovo}
          </label>
          <input
            id={idNovo}
            className="w-full rounded border border-borda bg-fundo px-2 py-1 text-xs text-texto focus:border-ouro focus:outline-none disabled:cursor-not-allowed"
            value={nomeNovo}
            disabled={desabilitado || cheio}
            onChange={(e) => setNomeNovo(e.target.value)}
          />
        </div>
        <Botao
          variante="fantasma"
          disabled={desabilitado || cheio || vazio}
          title={
            desabilitado
              ? 'Ficha somente leitura.'
              : cheio
                ? `Esta ficha já tem o máximo de ${modelo.limite} ataques.`
                : vazio
                  ? 'Informe o nome do ataque antes de adicionar.'
                  : `Adicionar ${nomeNovo.trim()}`
          }
          onClick={() => {
            aoAcrescentar(nomeNovo);
            setNomeNovo('');
          }}
        >
          Adicionar ataque
        </Botao>
      </div>
      {cheio && (
        <p className="mt-1 text-[11px] text-texto-2">
          Esta ficha já tem o máximo de {modelo.limite} ataques. Remova um para acrescentar outro.
        </p>
      )}
    </fieldset>
  );
}
