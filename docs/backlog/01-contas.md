# E01 — Contas e sessão

Hoje o access token dura 7 dias, não é revogável e o socket não é derrubado no logout. Estes cards fecham o ciclo de vida da sessão.

---

### RV-010 — Refresh token com rotação

**Épico:** E01 · **Depende de:** RV-003 · **Tamanho:** G · **Onda:** 2

**História**
> Como **jogador**, quero **continuar logado com segurança**, para **não perder a sessão no meio de uma partida nem deixar um token válido por 7 dias se meu dispositivo for comprometido**.

**Contexto técnico**
- [JwtServicoToken](../../apps/api/src/infra/auth/jwt-servico-token.ts) emite um único token de 7 dias.
- Alvo: access token de 15 min + refresh token opaco de 30 dias, rotacionado a cada uso e persistido com hash.

**Escopo**
- `apps/api/supabase/migrations/000X_sessoes.sql`: tabela `sessoes` (`id`, `usuario_id`, `token_hash`, `expira_em`, `revogada_em`, `criado_em`, `user_agent`)
- `apps/api/src/dominio/contas/sessao.ts` (entidade com invariantes de expiração/revogação)
- `apps/api/src/aplicacao/ports/repositorios.ts`: `SessaoRepository`
- `apps/api/src/aplicacao/contas/renovar-sessao.ts`
- Ajustes em `RegistrarUsuario`, `AutenticarUsuario`, rotas de auth
- `apps/web/src/lib/api.ts`: intercepta 401 → tenta renovar uma vez → repete a requisição

**Critérios de aceite**
```gherkin
Cenário: Access token expirado é renovado sem o usuário perceber
  Dado que meu access token expirou e meu refresh token é válido
  Quando o front chamar uma rota protegida
  Então ele renova a sessão e repete a chamada com sucesso
  E o refresh token antigo deixa de ser aceito

Cenário: Reuso de refresh token revoga a família
  Dado um refresh token já rotacionado
  Quando alguém tentar usá-lo novamente
  Então recebo 401 e todas as sessões daquele usuário são revogadas

Cenário: Refresh expirado exige novo login
  Dado um refresh token com expira_em no passado
  Quando eu tentar renovar
  Então recebo 401 e sou redirecionado para /login
```

**Testes obrigatórios**
- Domínio: `Sessao` rejeita renovação quando expirada ou revogada.
- Use case: rotação emite novo par e invalida o anterior.
- Contrato: 401 → renovação → 200 em uma única chamada do front (mock de fetch).

**DoD específico**
- [ ] Refresh token nunca é logado nem devolvido em URL.
- [ ] Apenas o hash do refresh token é persistido.

---

### RV-011 — Logout com revogação e desconexão do socket

**Épico:** E01 · **Depende de:** RV-010 · **Tamanho:** M · **Onda:** 2

**História**
> Como **usuário**, quero **que "Sair" encerre a sessão de verdade**, para **que ninguém continue recebendo os eventos da minha mesa naquele dispositivo**.

**Contexto técnico**
- Hoje [store-sessao.ts](../../apps/web/src/features/auth/store-sessao.ts) apenas limpa o estado local; o socket permanece conectado até o próximo reload.

**Escopo**
- `apps/api/src/aplicacao/contas/encerrar-sessao.ts`
- `apps/api/src/apresentacao/http/rotas-auth.ts`: `POST /auth/sair`
- `apps/web/src/features/auth/api.ts`: `useSair()` chamando a API, `desconectarSocket()` e `queryClient.clear()`
- `apps/web/src/features/mesas/PaginaDashboard.tsx` e demais pontos de logout

**Critérios de aceite**
```gherkin
Cenário: Sair encerra tudo
  Dado que estou numa mesa com o socket conectado
  Quando eu clicar em "Sair"
  Então a sessão é revogada no servidor
  E o socket é desconectado
  E o cache do TanStack Query é limpo
  E sou levado para /login

Cenário: Token revogado não abre socket
  Dado um access token de sessão revogada
  Quando eu tentar conectar o socket com ele
  Então o handshake é recusado
```

**Testes obrigatórios**
- Contrato: `POST /auth/sair` → 204 e refresh subsequente → 401.
- Front: teste do hook garantindo `desconectarSocket` e `clear` chamados.

---

### RV-012 — Perfil do usuário

**Épico:** E01 · **Depende de:** — · **Tamanho:** M · **Onda:** 2

**História**
> Como **usuário**, quero **editar meu nome e trocar minha senha**, para **manter minha identidade na mesa correta e minha conta segura**.

**Escopo**
- `packages/shared/src/schemas/auth.ts`: `atualizarPerfilSchema`, `trocarSenhaSchema`
- `apps/api/src/dominio/contas/usuario.ts`: métodos `renomear(nome)` e `trocarSenha(hash)`
- `apps/api/src/aplicacao/contas/atualizar-perfil.ts`, `trocar-senha.ts`
- `apps/api/src/apresentacao/http/rotas-auth.ts`: `PATCH /auth/eu`, `POST /auth/eu/senha`
- `apps/web/src/features/auth/PaginaPerfil.tsx` + rota `/perfil`

**Critérios de aceite**
```gherkin
Cenário: Renomear reflete nas mesas
  Dado que meu nome é "Ana"
  Quando eu alterar para "Ana Mestra"
  Então o novo nome aparece na lista de participantes das minhas mesas

Cenário: Trocar senha exige a senha atual
  Quando eu enviar a senha atual errada
  Então recebo 403 e a senha não muda

Cenário: Troca de senha encerra as outras sessões
  Dado que troquei minha senha com sucesso
  Então as demais sessões do meu usuário são revogadas e a atual permanece
```

**Testes obrigatórios**
- Domínio: `renomear` rejeita nome com menos de 2 caracteres.
- Use case: senha atual incorreta → `nao-autorizado`, sem persistir.

**DoD específico**
- [ ] Mensagens de erro não revelam se a conta existe.

---

### RV-013 — Recuperação de senha por email

**Épico:** E01 · **Depende de:** RV-012 · **Tamanho:** G · **Onda:** 3

**História**
> Como **usuário que esqueceu a senha**, quero **redefini-la por email**, para **voltar a jogar sem precisar de suporte**.

**Contexto técnico**
- Reaproveite o padrão de evento de domínio + assinante usado em `JogadorConvidado` ([08-email.md](../../.claude/rules/08-email.md)): o use case publica, o assinante envia.

**Escopo**
- Migration `000X_redefinicoes_senha.sql` (`token_hash`, `expira_em`, `usado_em`)
- `apps/api/src/dominio/contas/eventos.ts`: `RedefinicaoSenhaSolicitada`
- `apps/api/src/aplicacao/contas/solicitar-redefinicao.ts`, `redefinir-senha.ts`
- `apps/api/src/infra/email/templates/redefinicao-senha.ts`
- `apps/web/src/features/auth/PaginaEsqueciSenha.tsx`, `PaginaRedefinirSenha.tsx`

**Critérios de aceite**
```gherkin
Cenário: Solicitação não revela se o email existe
  Quando eu pedir redefinição para um email não cadastrado
  Então recebo a mesma resposta 202 de um email existente
  E nenhum email é enviado

Cenário: Token de uso único e com prazo
  Dado um token de redefinição válido por 1 hora
  Quando eu usá-lo para definir a nova senha
  Então consigo entrar com a nova senha
  E o mesmo token passa a ser recusado

Cenário: Token expirado
  Dado um token emitido há mais de 1 hora
  Quando eu tentar usá-lo
  Então recebo 403 com orientação em PT-BR para solicitar novamente
```

**Testes obrigatórios**
- Domínio: expiração e uso único.
- Use case: falha de email não derruba a operação (assinante isolado).

**DoD específico**
- [ ] O corpo do email contém apenas o link com token de uso único — nunca a senha.

---

### RV-014 — Verificação de email no registro

**Épico:** E01 · **Depende de:** RV-013 · **Tamanho:** M · **Onda:** 3

**História**
> Como **mestre**, quero **saber que os emails da minha mesa são reais**, para **que convites cheguem e contas descartáveis não poluam a plataforma**.

**Escopo**
- Migration: `usuarios.email_verificado_em timestamptz`
- `apps/api/src/aplicacao/contas/confirmar-email.ts` + evento `ContaCriada`
- `apps/api/src/infra/email/templates/boas-vindas.ts`
- Faixa de aviso no front enquanto não verificado

**Critérios de aceite**
```gherkin
Cenário: Conta nova recebe email de confirmação
  Quando eu me registrar
  Então recebo um email com link de confirmação
  E consigo usar a plataforma normalmente com um aviso de "email não confirmado"

Cenário: Aceitar convite exige email confirmado
  Dado que minha conta não está confirmada
  Quando eu tentar aceitar um convite de mesa
  Então recebo 403 orientando confirmar o email primeiro
```

**Decisão registrada**
- Verificação **não bloqueia** login nem criação de mesa própria; bloqueia apenas aceitar convite, para não travar quem está avaliando a ferramenta.
