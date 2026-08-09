# Semente de conteúdo de Pathfinder 2e

Este diretório guarda uma **amostra curada e pequena** de conteúdo de PF2e. Ele nasce vazio, e essa é a intenção: o repositório não pode distribuir o corpus do jogo.

A decisão de licenciamento está em [docs/licencas/pathfinder2e.md](../../../../../../docs/licencas/pathfinder2e.md). Este README é a parte operacional dela — e nada aqui é promessa: [`licenca.ts`](../licenca.ts) lê estas regras e [`licenca.test.ts`](../licenca.test.ts) as executa sobre os arquivos reais deste diretório.

## O que pode entrar

- **Mecânica** (aritmética de proficiência, graus de sucesso, CDs, MAP) não mora aqui: é código, em `packages/shared/src/sistemas/pathfinder2e/`.
- **Conteúdo** (perícias, talentos, magias, itens) entra aqui só como amostra, e cada item declara de onde veio.
- **Proibido**: *scraping* do Archives of Nethys, dataset pf2e do Foundry VTT, texto descritivo copiado de livro. Leia para entender, não copie.

## Formato

Um arquivo `.json` por tipo — o nome do arquivo **é** o tipo (`pericias.json` → tipo `pericias`). O topo do arquivo é um array de itens:

```json
[
  {
    "chave": "acrobacia",
    "nome": "Acrobacia",
    "fonte": "Pathfinder Player Core (Paizo) — Open Game Content sob a OGL 1.0a"
  }
]
```

`chave`, `nome` e `fonte` são obrigatórios. `fonte` é obrigatório porque a atribuição precisa viajar **junto do dado**: quem consome a API não vê o rodapé da tela.

Qualquer outro arquivo (como este README) é ignorado pela auditoria.

## Teto

O teto de itens por tipo e de bytes por arquivo está em `LIMITE_SEMENTE`, em [`atribuicao.ts`](../atribuicao.ts) — **e em nenhum outro lugar**, de propósito. Os números não estão escritos neste README para que não exista uma segunda cópia para envelhecer; um teste garante isso.

O teto é baixo porque ele não serve para dimensionar o produto: serve para ficar vermelho no dia em que alguém colar um dump aqui dentro. Aumentá-lo é uma decisão consciente — altere `LIMITE_SEMENTE` e escreva o motivo no diff.

## Antes de colocar o primeiro item

Enquanto este diretório está vazio, `docs/licencas/pathfinder2e.md` pode carregar o marcador `OGL-PENDENTE`. No commit que trouxer o primeiro item, o texto verbatim da OGL 1.0a e os avisos de copyright da Seção 15 precisam estar no documento e o marcador precisa sumir — senão a auditoria falha. Distribuir Open Game Content sem a licença junto é exatamente o risco que esta fronteira existe para impedir.
