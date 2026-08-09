# Guardrail: Frontend (apps/web)

## Stack

- **React 19** + **Vite 6** + TypeScript estrito.
- **Rotas**: React Router 7 (declarativo). **Server state**: TanStack Query 5. **Client state**: Zustand (apenas estado de UI/jogo local).
- **Estilo**: Tailwind CSS 4 (tema dark de mesa de RPG). Componentes próprios em `components/ui`.
- **Tempo real**: socket.io-client encapsulado em um único módulo (`lib/socket.ts`) + hooks por feature.
- **Contratos**: tipos e schemas Zod importados de `@rolavinte/shared` — o front nunca redeclara formatos da API.

## Estrutura (feature-sliced)

```
apps/web/src/
  app/            router, providers (QueryClient, tema), guards de rota
  components/ui/  primitivos reutilizáveis (Botao, Campo, Dialogo...)
  features/
    auth/         login, registro, sessão (store + api + páginas)
    mesas/        dashboard, criação, convites
    jogo/         tabletop (cena/tokens), chat, iniciativa
    personagens/  ficha, lista
  lib/            apiClient, socket, utilitários
```

## Regras

- **Server state ≠ client state**: dados da API vivem no TanStack Query (com `queryKey` padronizada `['mesas']`, `['mesa', id]`...). Zustand guarda só UI/jogo efêmero (ferramenta selecionada, token arrastando, sessão).
- Componente de página não chama `fetch`/axios: usa hooks da feature (`useMesas()`, `useRolarDados()`), que usam o `apiClient` central.
- Eventos de socket atualizam o cache do Query (`setQueryData`) ou stores — nunca estado duplicado em `useState` solto.
- Todos os textos de UI em **PT-BR**. Sem i18n framework por ora; strings inline são aceitáveis.
- Acessibilidade mínima: elementos interativos são `button`/`a` reais, inputs com `label`, foco visível.
- Sem `any`; respostas da API validadas/tipadas pelos schemas do shared.
- Componentes de apresentação não importam `lib/socket` diretamente — só hooks de feature.

## Performance no tabletop

- Movimentação de token durante drag é otimista/local (Zustand); persiste e emite socket no `pointerup`.
- Re-render do grid não pode depender do chat: features isoladas, seletores finos no Zustand.
