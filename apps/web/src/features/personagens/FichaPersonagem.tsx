import { useState, type FormEvent } from 'react';
import {
  ataquesDoPersonagem,
  ATRIBUTOS,
  defesasDoPersonagem,
  definicaoDoSistema,
  formatarBonus,
  type Atributos,
  type DadosFicha,
  type DefesaCalculada,
  type FamiliaPericia,
  type NomeAtributo,
  type PersonagemCalculavel,
  type PersonagemDTO,
  type RolagemDeAtaqueCalculada,
} from '@rolavinte/shared';
import { AvisoLicenca } from '@/components/ui/AvisoLicenca';
import { Botao } from '@/components/ui/Botao';
import { Campo, CampoArea } from '@/components/ui/Campo';
import { Erro } from '@/components/ui/Estado';
import { useAtualizarPersonagem } from './api';
import { useRolarDados } from '@/features/jogo/api';
import { definirCampo } from './campos-ficha';
import { CamposDoSistema } from './CamposDoSistema';
import { SecaoAtaques } from './SecaoAtaques';
import { SecaoDefesas } from './SecaoDefesas';
import { SecaoPericias } from './SecaoPericias';
import { linhasDePericia, type LinhaDePericia } from './pericias';

const ROTULO_ATRIBUTO: Record<NomeAtributo, string> = {
  forca: 'FOR',
  destreza: 'DES',
  constituicao: 'CON',
  inteligencia: 'INT',
  sabedoria: 'SAB',
  carisma: 'CAR',
};

interface Props {
  personagem: PersonagemDTO;
  podeEditar: boolean;
  /** Quando a ficha está congelada por mesa encerrada, dizemos o porquê. */
  motivoBloqueio?: string | null;
  aoFechar(): void;
}

/**
 * A ficha, renderizada **a partir da definição do sistema da mesa** (RV-091).
 *
 * Ela tem duas metades, e a distinção é a razão de ser deste card:
 *
 * - a **comum** — nome, classe, nível, PV, atributos e anotações — é igual em
 *   todos os sistemas e continua sendo JSX fixo aqui, porque de fato não varia;
 * - a **do sistema** vem de `definicaoDoSistema(personagem.sistema)`: seções,
 *   campos e perícias saem do registro de `@rolavinte/shared`, e este arquivo
 *   nunca pergunta qual é o sistema. Uma mesa "generico" tem `secoes: []` e
 *   `pericias: []`, então vê exatamente a ficha de sempre; um sistema novo
 *   aparece por adição no registro, sem tocar neste componente.
 *
 * O `personagem.sistema` vem no próprio DTO de propósito: a ficha não depende
 * de um segundo cache (`['mesa', id]`) que pode estar carregando.
 */
export function FichaPersonagem({
  personagem,
  podeEditar,
  motivoBloqueio = null,
  aoFechar,
}: Props) {
  const atualizar = useAtualizarPersonagem(personagem.mesaId);
  const rolar = useRolarDados(personagem.mesaId);
  const [nome, setNome] = useState(personagem.nome);
  const [classe, setClasse] = useState(personagem.classe);
  const [nivel, setNivel] = useState(personagem.nivel);
  const [pvAtual, setPvAtual] = useState(personagem.pvAtual);
  const [pvMax, setPvMax] = useState(personagem.pvMax);
  const [atributos, setAtributos] = useState<Atributos>(personagem.atributos);
  const [anotacoes, setAnotacoes] = useState(personagem.anotacoes);
  const [dados, setDados] = useState<DadosFicha>(personagem.dados);

  const definicao = definicaoDoSistema(personagem.sistema);

  // Os bônus acompanham o que está na tela, e não o que está gravado: quem
  // acabou de subir de nível vê o número novo antes de salvar — e rola com ele,
  // que é o mesmo contrato dos dados de atributo desde sempre.
  const ficha: PersonagemCalculavel = { sistema: personagem.sistema, nivel, atributos, dados };
  const pericias = linhasDePericia(ficha, personagem.nome);
  // As defesas seguem a mesma regra dos bônus de perícia: derivadas do que está na
  // tela, e não do que está gravado. Trocar o grau de Reflexos muda o número antes
  // de salvar, e é com ele que o dado rola (RV-155).
  const defesas = defesasDoPersonagem(ficha, personagem.nome);
  // Os ataques seguem a mesma regra: as três expressões de acerto saem do que está na
  // tela, então marcar a arma como ágil troca a penalidade antes de salvar (RV-156).
  const ataques = ataquesDoPersonagem(ficha, personagem.nome);

  function salvar(e: FormEvent) {
    e.preventDefault();
    atualizar.mutate(
      {
        personagemId: personagem.id,
        // `dados` substitui a ficha do sistema inteira — o PATCH não faz merge
        // de jsonb aninhado, e é por isso que o estado local guarda o objeto
        // completo em vez de um diff.
        campos: { nome, classe, nivel, pvAtual, pvMax, atributos, anotacoes, dados },
      },
      { onSuccess: aoFechar },
    );
  }

  /**
   * O dado vem da definição (`dadoDeTeste`) e o bônus vem da **escala** dela
   * (`atributos.modificador`, RV-098) — nem o `1d20` nem a fórmula
   * `(valor − 10) / 2` estão escritos aqui.
   *
   * Sem a escala, esta linha era a fórmula do d20 aplicada a todo sistema: numa
   * ficha de PF2e ela rolaria `+0` para sempre, e foi por isso que o RV-152
   * precisou esconder o bloco inteiro. Com a interpretação vindo do registro, o
   * botão rola o número certo em qualquer sistema e não há nada a esconder.
   */
  function expressaoDeAtributo(atributo: NomeAtributo): string {
    return `${definicao.dadoDeTeste}${formatarBonus(definicao.atributos.modificador(atributos[atributo]))}`;
  }

  function rolarAtributo(atributo: NomeAtributo) {
    rolar.mutate({
      expressao: expressaoDeAtributo(atributo),
      motivo: `${ROTULO_ATRIBUTO[atributo]} — ${personagem.nome}`,
    });
  }

  function rolarPericia(linha: LinhaDePericia) {
    rolar.mutate({ expressao: linha.expressao, motivo: linha.motivo });
  }

  /**
   * A expressão e o motivo vêm prontos do sistema (`defesasDoPersonagem`), como
   * nas perícias: a defesa que não se rola chega com os dois em `null` e nem
   * oferece botão, então aqui não há nada a decidir nem a somar.
   */
  function rolarDefesa(defesa: DefesaCalculada) {
    if (defesa.expressao === null || defesa.motivo === null) return;
    rolar.mutate({ expressao: defesa.expressao, motivo: defesa.motivo });
  }

  /**
   * O acerto é uma **checagem**: leva a CA do alvo como `cd`, e é isso que faz o
   * chat anunciar o grau de sucesso (RV-154). `null` quando a CA não foi informada —
   * e aí a rolagem sai como qualquer outra, sem grau.
   */
  function rolarAcerto(rolagem: RolagemDeAtaqueCalculada, cd: number | null) {
    if (rolagem.expressao === null || rolagem.motivo === null) return;
    rolar.mutate({ expressao: rolagem.expressao, motivo: rolagem.motivo, cd });
  }

  /**
   * O dano **nunca** leva CD, e é por isso que esta função existe separada de
   * `rolarAcerto` em vez de receber um parâmetro opcional: dano não é checado contra
   * nada, e "Falha crítica" num 1d8+4 não significa coisa nenhuma. A separação vem do
   * contrato (`acertos` e `danos` são listas distintas) e termina aqui.
   */
  function rolarDano(rolagem: RolagemDeAtaqueCalculada) {
    if (rolagem.expressao === null || rolagem.motivo === null) return;
    rolar.mutate({ expressao: rolagem.expressao, motivo: rolagem.motivo });
  }

  /** Os ataques nascem, morrem e mudam pelo modelo do sistema, como as famílias. */
  function acrescentarAtaque(nome: string) {
    const modelo = definicao.ataques;
    if (modelo === null) return;
    setDados((atual) => modelo.acrescentar(atual, nome));
  }

  function removerAtaque(ataqueChave: string) {
    const modelo = definicao.ataques;
    if (modelo === null) return;
    setDados((atual) => modelo.remover(atual, ataqueChave));
  }

  function alterarCampoDoAtaque(ataqueChave: string, campo: string, valor: unknown) {
    const modelo = definicao.ataques;
    if (modelo === null) return;
    setDados((atual) => modelo.definirCampo(atual, ataqueChave, campo, valor));
  }

  /**
   * Onde o grau mora dentro de `dados` é decisão do sistema — daí o
   * `definicao.definirGrauDePericia` em vez de escrever em `dados.pericias`.
   */
  function trocarGrau(pericia: string, grau: string) {
    setDados((atual) => definicao.definirGrauDePericia(atual, pericia, grau));
  }

  /**
   * Perícia de família (o Saber de PF2e) nasce e morre pela própria família: a
   * ficha não sabe que a lista mora em `dados.saberes`, e não deve saber.
   */
  function acrescentarDaFamilia(familia: FamiliaPericia, especializacao: string) {
    setDados((atual) => familia.acrescentar(atual, especializacao));
  }

  function removerDaFamilia(linha: LinhaDePericia) {
    const familia = definicao.familiasPericia.find((f) => f.chave === linha.familia);
    if (!familia) return;
    setDados((atual) => familia.remover(atual, linha.chave));
  }

  function alterarCampo(chave: string, valor: unknown) {
    setDados((atual) => definirCampo(atual, chave, valor));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-label={`Ficha de ${personagem.nome}`}
    >
      <form
        onSubmit={salvar}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-borda bg-painel p-6"
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="font-titulo text-2xl text-ouro">{personagem.nome}</h2>
            <p className="text-xs text-texto-2">
              Jogador: {personagem.donoNome} · Sistema: {definicao.nome}
            </p>
          </div>
          <Botao variante="fantasma" onClick={aoFechar} aria-label="Fechar ficha">
            ✕
          </Botao>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Campo
            rotulo="Nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            disabled={!podeEditar}
          />
          <Campo
            rotulo="Classe"
            value={classe}
            onChange={(e) => setClasse(e.target.value)}
            disabled={!podeEditar}
          />
          <Campo
            rotulo="Nível"
            type="number"
            min={1}
            max={20}
            value={nivel}
            onChange={(e) => setNivel(Number(e.target.value))}
            disabled={!podeEditar}
          />
          <div className="grid grid-cols-2 gap-2">
            <Campo
              rotulo="PV atual"
              type="number"
              min={0}
              max={pvMax}
              value={pvAtual}
              onChange={(e) => setPvAtual(Number(e.target.value))}
              disabled={!podeEditar}
            />
            <Campo
              rotulo="PV máx."
              type="number"
              min={1}
              value={pvMax}
              onChange={(e) => setPvMax(Number(e.target.value))}
              disabled={!podeEditar}
            />
          </div>
        </div>

        {/* Os seis atributos são de **todo** sistema, e aparecem em todos: o que
            varia é a escala, e ela vem da definição (RV-098). A legenda diz qual
            é ("valor de 1 a 30" ou "modificador direto, de -5 a +8"), os limites
            do `input` saem dela, e o bônus do dado sai de
            `definicao.atributos.modificador`.

            Antes do RV-098 este bloco era escondido no PF2e (`usaAtributosComuns`)
            porque o número certo não estava aqui — estava numa segunda cópia
            dentro de `dados`, e o botão rolaria `1d20+0` (F6). Consertada a
            fonte, não há nada a esconder: o campo que o jogador edita é o mesmo
            que a perícia soma. */}
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm text-texto-2">
            Atributos ({definicao.atributos.descricao}) — clique no dado para testar
          </legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {ATRIBUTOS.map((atributo) => {
              const valor = atributos[atributo];
              const mod = definicao.atributos.modificador(valor);
              return (
                <div
                  key={atributo}
                  className="rounded-lg border border-borda bg-painel-2 p-2 text-center"
                >
                  <p className="text-[11px] font-semibold text-texto-2">
                    {ROTULO_ATRIBUTO[atributo]}
                  </p>
                  <input
                    aria-label={`Valor de ${atributo}`}
                    type="number"
                    min={definicao.atributos.minimo}
                    max={definicao.atributos.maximo}
                    className="w-full bg-transparent text-center text-lg font-bold text-texto focus:outline-none disabled:opacity-100"
                    value={valor}
                    onChange={(e) =>
                      setAtributos({ ...atributos, [atributo]: Number(e.target.value) })
                    }
                    disabled={!podeEditar}
                  />
                  <button
                    type="button"
                    className="mt-1 w-full cursor-pointer rounded bg-fundo px-1 py-0.5 text-xs text-ouro hover:bg-ouro/10 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => rolarAtributo(atributo)}
                    disabled={motivoBloqueio !== null}
                    title={motivoBloqueio ?? `Rolar ${expressaoDeAtributo(atributo)}`}
                  >
                    🎲 {formatarBonus(mod)}
                  </button>
                </div>
              );
            })}
          </div>
        </fieldset>

        <CamposDoSistema
          secoes={definicao.secoes}
          dados={dados}
          desabilitado={!podeEditar}
          aoAlterar={alterarCampo}
        />

        {/* As defesas derivadas vêm depois dos campos do sistema porque é dali que
            os números saem — os graus e a armadura estão logo acima. Nenhum deles
            é editável aqui: somente leitura significa não editável, e não "sem
            botão de dado" (RV-155). */}
        <SecaoDefesas defesas={defesas} motivoBloqueio={motivoBloqueio} aoRolar={rolarDefesa} />

        {/* Os ataques vêm depois das defesas porque é a ordem da mesa: primeiro o que
            te protege, depois o que você faz no turno. Sistema sem modelo de ataques
            declara `null` e a seção não existe — a tela não pergunta qual é o
            sistema. */}
        {definicao.ataques && (
          <SecaoAtaques
            modelo={definicao.ataques}
            ataques={ataques}
            desabilitado={!podeEditar}
            motivoBloqueio={motivoBloqueio}
            aoAcrescentar={acrescentarAtaque}
            aoRemover={removerAtaque}
            aoAlterarCampo={alterarCampoDoAtaque}
            aoRolarAcerto={rolarAcerto}
            aoRolarDano={rolarDano}
          />
        )}

        <SecaoPericias
          linhas={pericias}
          graus={definicao.grausPericia}
          familias={definicao.familiasPericia}
          desabilitado={!podeEditar}
          motivoBloqueio={motivoBloqueio}
          aoTrocarGrau={trocarGrau}
          aoRolar={rolarPericia}
          aoAcrescentarDaFamilia={acrescentarDaFamilia}
          aoRemoverDaFamilia={removerDaFamilia}
        />

        <div className="mt-4">
          <CampoArea
            rotulo="Anotações"
            value={anotacoes}
            onChange={(e) => setAnotacoes(e.target.value)}
            disabled={!podeEditar}
          />
        </div>

        {atualizar.isError && <Erro erro={atualizar.error} className="mt-3" />}

        {motivoBloqueio && (
          <p className="mt-4 rounded-lg border border-borda bg-painel-2 p-3 text-xs text-texto-2">
            {motivoBloqueio} A ficha está congelada: continua aberta para consulta, mas não aceita
            alterações nem rolagens — a rolagem publicaria no chat da mesa.
          </p>
        )}

        {podeEditar && (
          <div className="mt-5 flex gap-2">
            <Botao type="submit" disabled={atualizar.isPending}>
              {atualizar.isPending ? 'Salvando…' : 'Salvar ficha'}
            </Botao>
            <Botao variante="fantasma" onClick={aoFechar}>
              Cancelar
            </Botao>
          </div>
        )}

        {/* A atribuição acompanha o conteúdo: ela é dado da definição
            (`atribuicao`), e a tela só decide se monta o aviso. Sem isto, uma
            ficha aberta direto por link exibiria mecânica licenciada sem crédito
            nenhum — e um `if (sistema === …)` aqui seria o `switch` que o
            registro existe para apagar. O texto nunca é reescrito no JSX. */}
        {definicao.atribuicao && <AvisoLicenca className="mt-5" />}
      </form>
    </div>
  );
}
