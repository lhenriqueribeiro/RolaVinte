# Guardrail: SOLID

Aplicação prática dos princípios neste projeto — cada um com o **teste objetivo** que um revisor aplica. Princípio sem teste objetivo é opinião.

## S — Single Responsibility

- Um caso de uso = uma intenção do usuário = uma classe, com um método `executar()`.
- Rota faz três coisas e só três: valida a entrada com Zod, chama o caso de uso, mapeia a saída. Zero regra de negócio.
- O critério **não é tamanho**: composition root e registro de rotas são longos por natureza — eles listam o grafo, não decidem nada. O critério é: quantos motivos diferentes fariam este arquivo mudar? Se a resposta tem "e" no meio ("valida **e** persiste **e** notifica"), divida.
- **Teste objetivo:** descreva o arquivo numa frase sem usar "e". Não conseguiu? São duas responsabilidades.

## O — Open/Closed

- Comportamento que varia por chave (sistema de RPG, tipo de comando de chat, tipo de mensagem) entra por **extensão**, não por `if/else` crescendo num switch central.
- O ponto de extensão canônico deste projeto é um **`Record<Chave, Comportamento>` total**, montado num único lugar. Total é a palavra que importa: acrescentar um valor ao enum de chaves **para de compilar** até a linha nova existir. Um `Map` cru não dá isso — ele aceita chave faltando em silêncio, e é assim que se ganha um caso sem dono.
- Duas consequências práticas: quem consome o registro nunca conhece uma chave pelo nome (não há `switch` do lado de fora), e associar chave a comportamento é privilégio do registro — a mesma associação repetida em outro arquivo é uma segunda verdade ([10-verificabilidade.md](10-verificabilidade.md)).
- **Teste objetivo:** para adicionar a próxima variante, quantos arquivos existentes preciso editar? Um (o registro) é o esperado. Vários, ou um `switch`, é violação.

## L — Liskov Substitution

- Implementação de port honra o contrato **inteiro**, incluindo a semântica de erro. O fake em memória tem de ser substituível pelo adapter real sem que o caso de uso perceba.
- Proibido implementar método de port com `throw new Error('não implementado')` se algum consumidor o chama.
- Atenção ao inverso, que é o erro mais comum aqui: fake **mais generoso** que o adapter real passa por construção e esconde bug de persistência (**F3** da [taxonomia](../../docs/agentes/taxonomia-de-falhas.md)). Comportamento que depende de *como* o adapter grava se testa no adapter.
- **Teste objetivo:** se eu trocar o fake pelo adapter real, algum teste muda de resultado por motivo que não seja I/O? Se sim, os dois não implementam o mesmo contrato.

## I — Interface Segregation

- A port fala a linguagem do **consumidor**, não a do provedor: um caso de uso pede "publique esta mensagem nesta mesa", não recebe um servidor de socket inteiro para operar.
- Isso não significa uma port por caso de uso. A port de broadcast ganha um método por evento do contrato de tempo real de propósito: é o que faz mudar o formato de um evento quebrar a compilação de quem publica. Quebrá-la em pedaços multiplicaria fakes sem impedir nada.
- **Teste objetivo:** os nomes dos métodos são do domínio ou do provedor? `mensagemNova(...)` é port; `emit(...)`, `from(bucket)`, `query(...)` são provedor vazando para dentro.

## D — Dependency Inversion

- Casos de uso dependem de **abstrações** declaradas em `aplicacao/ports`, nunca de cliente de banco, SDK de email ou servidor de socket.
- Direção: a aplicação **declara** a port; a infraestrutura **implementa**. Quem declara é quem consome.
- **Teste objetivo:** o import está presente na lista barrada do lint para esta camada? Se o lint precisou ser afrouxado para o código passar, a dependência está invertida ao contrário.

## Checklist de review

- [ ] Consigo testar este caso de uso com fakes em memória, sem mock de framework?
- [ ] Adicionar a próxima variante exige editar código existente ou só acrescentar uma linha ao registro?
- [ ] Alguma port tem método que nenhum consumidor chama?
- [ ] O fake e o adapter real concordam sobre erro, ordem e efeito colateral?
- [ ] Alguma classe precisa de "e" para ser descrita?
