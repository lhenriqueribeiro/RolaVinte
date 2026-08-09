import type { MensagemDTO, TermoAvaliado } from '@rolavinte/shared';

/**
 * Uma entrada do chat (RV-070, RV-071).
 *
 * O que este arquivo carrega além de layout: **o usuário precisa saber, olhando,
 * que aquilo não é público**. Sussurro e rolagem oculta ganham moldura própria,
 * ícone e um rótulo que diz para quem a mensagem foi — nunca só uma cor
 * diferente, que daltônico não separa e leitor de tela não lê.
 *
 * O que este arquivo **não** faz: filtrar. A privacidade é do servidor (o
 * histórico e o broadcast já saem filtrados por `mensagemVisivelPara`); esconder
 * no cliente seria fingir uma defesa (F4 da taxonomia). Se um sussurro alheio
 * chegar aqui, o defeito é do backend, e escondê-lo na renderização apagaria a
 * única evidência.
 */

/** Descrição textual de quem enxerga a mensagem; `null` quando é pública. */
export interface AvisoPrivacidade {
  icone: string;
  texto: string;
}

export function avisoPrivacidade(
  mensagem: MensagemDTO,
  usuarioId: string | null,
): AvisoPrivacidade | null {
  if (mensagem.tipo === 'sussurro') {
    const souODestinatario =
      mensagem.destinatarioId !== null && mensagem.destinatarioId === usuarioId;
    return {
      icone: '🤫',
      texto: souODestinatario
        ? `Sussurro de ${mensagem.autorNome}, só para você`
        : `Sussurro para ${mensagem.destinatarioNome ?? 'destinatário desconhecido'}`,
    };
  }
  if (mensagem.tipo === 'rolagem-oculta') {
    // Rolagem oculta não tem destinatário: quem vê é só o autor, o mestre.
    return { icone: '🔒', texto: 'Rolagem oculta — só você vê este resultado' };
  }
  return null;
}

/** Moldura da mensagem por tipo. A cor acompanha o rótulo, nunca o substitui. */
const ESTILO_POR_TIPO: Record<MensagemDTO['tipo'], string> = {
  fala: 'px-1 py-0.5',
  sistema: 'px-1 py-0.5',
  rolagem: 'rounded-lg border border-ouro/30 bg-ouro/5 px-3 py-2',
  sussurro: 'rounded-lg border border-dashed border-roxo/70 bg-roxo/10 px-3 py-2',
  'rolagem-oculta': 'rounded-lg border border-dashed border-roxo/70 bg-roxo/10 px-3 py-2',
};

function DetalheRolagem({ termos }: { termos: TermoAvaliado[] }) {
  return (
    <span className="text-xs text-texto-2">
      {termos.map((termo, i) => (
        <span key={i}>
          {i > 0 && <span> {termo.sinal === 1 ? '+' : '−'} </span>}
          {i === 0 && termo.sinal === -1 && <span>− </span>}
          {termo.tipo === 'constante' ? (
            termo.valor
          ) : (
            <span>
              {termo.quantidade}d{termo.faces}
              {termo.manter ? `${termo.manter.modo}${termo.manter.quantidade}` : ''} [
              {termo.dados.map((d, j) => (
                <span key={j} className={d.descartado ? 'line-through opacity-50' : ''}>
                  {j > 0 && ', '}
                  {d.valor}
                </span>
              ))}
              ]
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

function SeloPrivacidade({ aviso }: { aviso: AvisoPrivacidade }) {
  return (
    <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold tracking-wide text-roxo-claro uppercase">
      <span aria-hidden>{aviso.icone}</span>
      {aviso.texto}
    </p>
  );
}

export function MensagemChat({
  mensagem,
  usuarioId,
}: {
  mensagem: MensagemDTO;
  /** Quem está lendo — decide "sussurro para X" contra "sussurro de Y". */
  usuarioId: string | null;
}) {
  const minha = mensagem.autorId !== null && mensagem.autorId === usuarioId;
  const aviso = avisoPrivacidade(mensagem, usuarioId);
  const hora = new Date(mensagem.criadoEm).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (mensagem.rolagem) {
    return (
      <div className={ESTILO_POR_TIPO[mensagem.tipo]}>
        {aviso && <SeloPrivacidade aviso={aviso} />}
        <p className="text-xs text-texto-2">
          <span className={minha ? 'text-ouro' : 'text-texto'}>{mensagem.autorNome}</span> rolou{' '}
          <code className="text-ouro">{mensagem.rolagem.expressao}</code>
          {mensagem.motivo && <span> · {mensagem.motivo}</span>} · {hora}
        </p>
        <p className="my-0.5 font-titulo text-2xl text-ouro">🎲 {mensagem.rolagem.total}</p>
        <DetalheRolagem termos={mensagem.rolagem.termos} />
      </div>
    );
  }

  return (
    <div className={ESTILO_POR_TIPO[mensagem.tipo]}>
      {aviso && <SeloPrivacidade aviso={aviso} />}
      <p className="text-sm">
        <span className={`font-semibold ${minha ? 'text-ouro' : 'text-texto'}`}>
          {mensagem.autorNome}
        </span>{' '}
        <span className="text-xs text-texto-2">{hora}</span>
      </p>
      <p className="text-sm break-words whitespace-pre-wrap text-texto/90">{mensagem.conteudo}</p>
    </div>
  );
}
