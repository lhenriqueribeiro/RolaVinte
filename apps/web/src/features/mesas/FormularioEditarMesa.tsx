import { useState, type FormEvent } from 'react';
import { SISTEMAS_RPG, type MesaDTO, type SistemaRpg } from '@rolavinte/shared';
import { Botao } from '@/components/ui/Botao';
import { Campo, CampoArea } from '@/components/ui/Campo';
import { useAtualizarMesa } from './api';
import { NOME_SISTEMA } from './formatos';

interface Props {
  mesa: MesaDTO;
  /** Texto do bloqueio (mesa encerrada). `null` quando a mesa aceita escrita. */
  motivoBloqueio: string | null;
}

/**
 * Edição dos dados da mesa (RV-024). A validação de verdade mora no domínio: o
 * formulário só espelha os limites e mostra a mensagem que a API devolver.
 */
export function FormularioEditarMesa({ mesa, motivoBloqueio }: Props) {
  const atualizar = useAtualizarMesa(mesa.id);
  const [nome, setNome] = useState(mesa.nome);
  const [descricao, setDescricao] = useState(mesa.descricao);
  const [sistema, setSistema] = useState<SistemaRpg>(mesa.sistema);
  const [salvo, setSalvo] = useState(false);

  const bloqueado = motivoBloqueio !== null;
  const alterado = nome !== mesa.nome || descricao !== mesa.descricao || sistema !== mesa.sistema;

  function submeter(evento: FormEvent) {
    evento.preventDefault();
    setSalvo(false);
    atualizar.mutate({ nome, descricao, sistema }, { onSuccess: () => setSalvo(true) });
  }

  function descartar() {
    setNome(mesa.nome);
    setDescricao(mesa.descricao);
    setSistema(mesa.sistema);
    setSalvo(false);
    atualizar.reset();
  }

  return (
    <section className="rounded-xl border border-borda bg-painel-2 p-3">
      <h3 className="mb-2 font-titulo text-sm text-ouro">📝 Dados da mesa</h3>
      <form onSubmit={submeter} className="flex flex-col gap-2">
        <Campo
          rotulo="Nome da mesa"
          required
          minLength={3}
          maxLength={80}
          disabled={bloqueado}
          value={nome}
          onChange={(e) => {
            setNome(e.target.value);
            setSalvo(false);
          }}
        />
        <CampoArea
          rotulo="Descrição"
          maxLength={500}
          disabled={bloqueado}
          value={descricao}
          onChange={(e) => {
            setDescricao(e.target.value);
            setSalvo(false);
          }}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`sistema-${mesa.id}`} className="text-sm text-texto-2">
            Sistema
          </label>
          <select
            id={`sistema-${mesa.id}`}
            className="rounded-lg border border-borda bg-fundo px-3 py-2 text-sm text-texto disabled:opacity-50"
            disabled={bloqueado}
            value={sistema}
            onChange={(e) => {
              setSistema(e.target.value as SistemaRpg);
              setSalvo(false);
            }}
          >
            {SISTEMAS_RPG.map((s) => (
              <option key={s} value={s}>
                {NOME_SISTEMA[s]}
              </option>
            ))}
          </select>
        </div>

        {atualizar.isError && (
          <p role="alert" className="text-xs text-perigo">
            {atualizar.error.message}
          </p>
        )}
        {salvo && !alterado && (
          <p role="status" className="text-xs text-sucesso">
            Alterações salvas. Os demais participantes veem os novos dados ao reabrir a mesa.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Botao type="submit" disabled={bloqueado || !alterado || atualizar.isPending}>
            {atualizar.isPending ? 'Salvando…' : 'Salvar alterações'}
          </Botao>
          <Botao
            variante="fantasma"
            disabled={bloqueado || !alterado}
            onClick={descartar}
            className="text-xs"
          >
            Descartar
          </Botao>
        </div>
        {motivoBloqueio && <p className="text-[11px] text-texto-2">{motivoBloqueio}</p>}
      </form>
    </section>
  );
}
