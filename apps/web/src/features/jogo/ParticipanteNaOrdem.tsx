import { useState } from 'react';
import { DELTA_PV_MAXIMO } from '@rolavinte/shared';
import { Botao } from '@/components/ui/Botao';
import { Erro } from '@/components/ui/Estado';
import { rotuloDeVida } from './aparencia';
import { useAplicarPv, useRolarIniciativa } from './api';
import { pedidoDeIniciativa, podeRolarIniciativa, type LinhaDeCombate } from './painel-iniciativa';

interface Props {
  mesaId: string;
  combateId: string;
  linha: LinhaDeCombate;
  souMestre: boolean;
  /** Mesa encerrada ou tempo real fora do ar: tudo travado, com o motivo à vista. */
  motivoBloqueio: string | null;
}

/**
 * Uma linha da ordem de iniciativa (RV-063), com as ações que ela oferece:
 * rolar a iniciativa desta peça e — para o mestre — aplicar dano ou cura (RV-065).
 *
 * ## O turno não é transmitido só por cor
 *
 * A peça da vez recebe **três** sinais independentes: `aria-current="true"` no
 * item da lista, o texto escrito ("Na vez" / "Sua vez") e o realce visual. Quem
 * não distingue a cor lê a palavra; quem usa leitor de tela ouve o `aria-current`
 * e o texto. Foi o item de DoD explícito do card, e é regra do projeto desde a
 * v0.5.0.
 *
 * ## Por que o campo de expressão só aparece sem ficha
 *
 * Com ficha, o cliente manda a **chave** da forma de rolar e o servidor deriva o
 * bônus do sistema (RV-158). Oferecer aqui um campo de expressão para peça com
 * ficha devolveria ao navegador o poder de escolher a iniciativa do jogador — o
 * servidor aceitaria o número sem discutir. Sem ficha (o NPC), a expressão
 * digitada é o único caminho, e é o que vai.
 */
export function ParticipanteNaOrdem({
  mesaId,
  combateId,
  linha,
  souMestre,
  motivoBloqueio,
}: Props) {
  const rolar = useRolarIniciativa(mesaId);
  const aplicarPv = useAplicarPv(mesaId);
  const [rolagemEscolhida, setRolagemEscolhida] = useState('');
  const [expressao, setExpressao] = useState('');
  const [valorPv, setValorPv] = useState('');

  const bloqueado = motivoBloqueio !== null;
  const pedido = pedidoDeIniciativa(linha, rolagemEscolhida, expressao);
  const podeRolar = podeRolarIniciativa(linha, souMestre);
  // Zero é 400 no contrato (`MENSAGEM_DELTA_PV`): o botão trava em vez de gastar
  // uma requisição que já se sabe recusada.
  const delta = Number.parseInt(valorPv, 10);
  const deltaValido = Number.isInteger(delta) && delta > 0 && delta <= DELTA_PV_MAXIMO;
  const personagem = linha.personagem;

  return (
    <li
      // `aria-current` é o que diz "é aqui" para o leitor de tela, sem depender de
      // nenhuma pista visual.
      aria-current={linha.noTurno ? 'true' : undefined}
      className={`rounded-xl border px-2 py-1.5 ${
        linha.noTurno ? 'border-ouro bg-ouro/10' : 'border-borda bg-painel-2'
      }`}
    >
      <div className="flex items-baseline gap-2">
        <span className="w-9 shrink-0 text-right text-sm tabular-nums text-ouro">
          {linha.iniciativa ?? '—'}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-texto">{linha.nome}</span>
        {linha.noTurno && (
          <span
            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              linha.minha ? 'bg-ouro text-fundo' : 'border border-ouro/50 text-ouro'
            }`}
          >
            {linha.minha ? '▶ Sua vez' : '▶ Na vez'}
          </span>
        )}
      </div>

      <p className="ml-11 text-[11px] text-texto-2">
        <span className="tabular-nums">{linha.posicao}º</span>
        {' · '}
        {linha.iniciativa === null ? 'ainda não rolou' : 'iniciativa rolada'}
        {personagem && ` · ${rotuloDeVida(personagem.pvAtual, personagem.pvMax)}`}
        {!personagem && ' · sem ficha'}
      </p>

      {podeRolar && (
        <div className="ml-11 mt-1 flex flex-wrap items-center gap-1">
          {linha.opcoes.length > 1 && (
            <select
              aria-label={`Como rolar a iniciativa de ${linha.nome}`}
              disabled={bloqueado || rolar.isPending}
              value={rolagemEscolhida}
              onChange={(e) => setRolagemEscolhida(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-borda bg-fundo px-1.5 py-1 text-[11px] text-texto disabled:opacity-50"
            >
              {linha.opcoes.map((opcao) => (
                <option key={opcao.chave} value={opcao.padrao ? '' : opcao.chave}>
                  {opcao.rotulo} {opcao.expressao}
                </option>
              ))}
            </select>
          )}
          {linha.opcoes.length === 0 && (
            <input
              aria-label={`Iniciativa de ${linha.nome}`}
              placeholder="17 ou 1d20+2"
              maxLength={200}
              disabled={bloqueado || rolar.isPending}
              value={expressao}
              onChange={(e) => setExpressao(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-borda bg-fundo px-1.5 py-1 text-[11px] text-texto disabled:opacity-50"
            />
          )}
          <Botao
            variante="secundario"
            className="!px-2 !py-1 text-[11px]"
            disabled={bloqueado || rolar.isPending || pedido === null}
            title={
              motivoBloqueio ??
              (pedido === null
                ? 'Esta peça não tem ficha: informe o número ou a expressão.'
                : undefined)
            }
            onClick={() => pedido && rolar.mutate({ combateId, ...pedido })}
          >
            🎲 Rolar
          </Botao>
        </div>
      )}

      {souMestre && personagem && (
        <div className="ml-11 mt-1 flex flex-wrap items-center gap-1">
          <input
            type="number"
            min={1}
            max={DELTA_PV_MAXIMO}
            step={1}
            aria-label={`Dano ou cura em ${linha.nome}`}
            placeholder="PV"
            disabled={bloqueado || aplicarPv.isPending}
            value={valorPv}
            onChange={(e) => setValorPv(e.target.value)}
            className="w-16 rounded-lg border border-borda bg-fundo px-1.5 py-1 text-[11px] tabular-nums text-texto disabled:opacity-50"
          />
          <Botao
            variante="perigo"
            className="!px-2 !py-1 text-[11px]"
            disabled={bloqueado || aplicarPv.isPending || !deltaValido}
            title={motivoBloqueio ?? `Aplicar dano em ${linha.nome}`}
            onClick={() =>
              aplicarPv.mutate(
                { combateId, tokenId: linha.tokenId, delta: -delta },
                { onSuccess: () => setValorPv('') },
              )
            }
          >
            🗡️ Dano
          </Botao>
          <Botao
            variante="secundario"
            className="!px-2 !py-1 text-[11px]"
            disabled={bloqueado || aplicarPv.isPending || !deltaValido}
            title={motivoBloqueio ?? `Curar ${linha.nome}`}
            onClick={() =>
              aplicarPv.mutate(
                { combateId, tokenId: linha.tokenId, delta },
                { onSuccess: () => setValorPv('') },
              )
            }
          >
            ✚ Cura
          </Botao>
        </div>
      )}

      {rolar.isError && <Erro erro={rolar.error} compacto className="mt-1" />}
      {aplicarPv.isError && <Erro erro={aplicarPv.error} compacto className="mt-1" />}
    </li>
  );
}
