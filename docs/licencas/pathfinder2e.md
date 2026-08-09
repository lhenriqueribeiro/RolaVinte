# Licenciamento do conteúdo de Pathfinder 2e

> Decisão fechada. Não é para re-decidir a cada card — é para **cumprir**. A verificação automatizada desta página vive em [`packages/shared/src/sistemas/pathfinder2e/licenca.ts`](../../packages/shared/src/sistemas/pathfinder2e/licenca.ts) e roda em [`licenca.test.ts`](../../packages/shared/src/sistemas/pathfinder2e/licenca.test.ts).

Referência do épico: [E15 — Pathfinder 2e](../backlog/15-pathfinder2e.md), card RV-150.

## 1. O que está decidido

| | Decisão |
|---|---|
| **Mecânicas** (proficiência, graus de sucesso, CDs, tipos de modificador, economia de ações, MAP) | **Permitido** implementar, **com atribuição**. São Open Game Content sob a OGL 1.0a. |
| **Conteúdo** (talentos, magias, itens, monstros, texto descritivo) | **Não distribuímos.** Só entra como semente curada e pequena, com `fonte` em cada item, atrás da port `CatalogoPathfinder` (RV-157). |
| *Scraping* do [Archives of Nethys](https://2e.aonprd.com/) | **Proibido.** O site opera sob a Community Use Policy da Paizo somada à OGL 1.0a, e veda expressamente uso comercial. |
| Dataset do sistema pf2e do **Foundry VTT** | **Proibido** empacotar. A permissão existe pela parceria Foundry Gaming ↔ Paizo e **não é transferível** para este projeto. |
| Pesquisa de regras no AoN | **Leia para entender, não copie.** Fórmula, faixa numérica e nome de mecânica entram; texto descritivo não. |

Consequência arquitetural: mecânica é **código** em `packages/shared/src/sistemas/pathfinder2e/` (funções puras); conteúdo é **dado** atrás de uma port. No dia em que houver um import licenciado, troca-se o adapter e o domínio não muda uma linha.

## 2. A atribuição viaja junto do conteúdo

O texto de atribuição é a constante `ATRIBUICAO_PF2E`, em [`atribuicao.ts`](../../packages/shared/src/sistemas/pathfinder2e/atribuicao.ts). Ele aparece:

- em **toda tela** que exibe conteúdo de PF2e, pelo componente `AvisoLicenca` (`apps/web/src/components/ui/AvisoLicenca.tsx`);
- **dentro do dado**: todo item de semente carrega o campo obrigatório `fonte`, porque quem consome a API não vê o rodapé de uma página.

Rodapé de página não é atribuição suficiente para um JSON que sai da API. É por isso que `fonte` é obrigatório e que a ausência dele reprova no teste, nomeando o arquivo e a chave do item.

## 3. Teto de conteúdo

O teto está em `LIMITE_SEMENTE`, em [`atribuicao.ts`](../../packages/shared/src/sistemas/pathfinder2e/atribuicao.ts), **e em nenhum outro lugar** — nem nesta página. Duas cópias de um número viram uma cópia desatualizada; um teste garante que a segunda não exista.

Ele limita itens por tipo e bytes por arquivo no diretório da semente. Não é dimensionamento de produto: é o alarme que dispara no dia em que alguém colar um dump. Aumentá-lo exige alterar a constante e escrever o motivo no diff.

## 4. Seção 15 — avisos de copyright

**OGL-PENDENTE.** Este repositório ainda **não distribui nenhum conteúdo** de Pathfinder: o diretório [`semente/`](../../packages/shared/src/sistemas/pathfinder2e/semente/) está vazio e só carrega o seu README.

No commit que trouxer o **primeiro** item de semente, esta seção precisa ganhar:

1. o **texto verbatim** da Open Game License 1.0a, copiado da fonte oficial (a Seção 10 da própria OGL exige que uma cópia da licença acompanhe todo Open Game Content distribuído);
2. os **avisos de copyright da Seção 15** de cada obra usada, transcritos exatamente como publicados pela editora;
3. o aviso exigido pela [Community Use Policy da Paizo](https://paizo.com/communityuse), na redação que a política determina, para qualquer material que dependa dela.

E o marcador `OGL-PENDENTE` acima precisa **sumir** no mesmo commit.

Isto não é um lembrete de boa vontade: `auditarSemente` reprova quando existe item de semente e o marcador ainda está aqui. A mensagem de falha diz o que fazer. Enquanto a semente estiver vazia, a auditoria passa — semente vazia é estado válido.

## 5. O que nunca entra no repositório

- Dependência de rede, script de download ou *crawler* para buscar conteúdo de PF2e.
- Cópia de texto descritivo de livro ou do AoN.
- Arquivo de dados vindo de outro VTT.

## 6. Links

- [Community Use Policy da Paizo](https://paizo.com/communityuse)
- [Open Game License 1.0a](https://paizo.com/pathfinder/compatibility/ogl)
- [paizo.com](https://paizo.com)
- [Archives of Nethys](https://2e.aonprd.com/) — consulta, nunca extração
