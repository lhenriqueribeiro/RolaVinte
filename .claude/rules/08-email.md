# Guardrail: Email

- Todo envio passa pela port `ServicoEmail`, declarada junto com as outras ports de infraestrutura em `aplicacao/ports/`. O SDK do Resend aparece **apenas** no adapter em `infra/email/`.
- **Email é disparado por assinante de evento de domínio**, nunca inline no caso de uso: convite gravado publica o fato, o assinante montado no composition root envia. A razão é dura — falha de email não pode derrubar a operação de negócio. O event bus captura a falha do assinante e a registra em log; o convite continua criado.
- Templates são **funções puras** que devolvem `{ assunto, html }`, em `infra/email/templates/`, com texto em PT-BR. Sem dado sensível no corpo: nunca senha, hash ou token de sessão. Token de convite de uso único é permitido — é o próprio propósito da mensagem.
- Remetente vem do env. Sem chave do provedor, o composition root injeta o adapter de console em vez de falhar: **o app precisa subir e funcionar offline** em desenvolvimento.
- Nunca logar conteúdo de email. Log só de metadado — destinatário e id devolvido pelo provedor.
- Reenvio de convite para o mesmo email tem **cooldown, e ele é regra do agregado `Mesa`**, não do adapter nem da rota. Rate limit de cortesia que vive na borda não sobrevive à segunda porta de entrada.

## O que rejeitar em code review

- `import` do SDK de email fora de `infra/email/`.
- Envio chamado direto de dentro de um caso de uso.
- Template que interpola credencial, hash ou token de sessão.
- Log com corpo ou assunto renderizado.
- Caminho novo de convite sem passar pelo cooldown do agregado.
