# Guardrail: Email (Resend)

- Todo envio passa pela port `ServicoEmail` (`aplicacao/ports/servico-email.ts`). O SDK `resend` aparece **apenas** em `infra/email/resend-servico-email.ts`.
- Emails são disparados por **assinantes de eventos de domínio** (`JogadorConvidado` → email de convite), nunca inline no use case — falha de email não pode falhar a operação de negócio.
- Templates: funções puras TypeScript que retornam `{ assunto, html }` em `infra/email/templates/`, texto em PT-BR. Sem dados sensíveis no corpo (nunca senha/token de sessão; token de convite de uso único é permitido).
- Remetente e domínio via env (`EMAIL_REMETENTE`). Em desenvolvimento sem `RESEND_API_KEY`, usar `ServicoEmailConsole` (loga no stdout) — o app precisa funcionar offline.
- Nunca logar conteúdo de email em produção; logar apenas `{ para, template, id }`.
- Rate limit de cortesia: reenvio de convite para o mesmo email tem cooldown (regra de domínio no agregado `Mesa`).
