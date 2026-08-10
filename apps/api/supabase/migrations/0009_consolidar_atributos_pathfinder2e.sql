-- Atributo em um lugar só: consolidação dos modificadores de PF2e (RV-098).
--
-- O DEFEITO QUE ESTA MIGRATION FECHA:
-- um personagem de Pathfinder 2e tinha os atributos em DOIS lugares. A coluna
-- comum `personagens.atributos` era exigida na criação e gravada (18/14/16…), e
-- a ficha lia outras seis chaves dentro de `personagens.dados`
-- (`modificadorForca`…`modificadorCarisma`), que ficavam em 0. Quem informava
-- Força 18 via o valor desaparecer, e a perícia calculava como se fosse 0.
--
-- A DECISÃO (RV-098, saída 2 das três oferecidas pelo card):
-- o atributo continua na coluna comum — um lugar só — e o que passa a ser do
-- sistema é a ESCALA: 1..30 com modificador derivado no d20 clássico, −5..+8
-- como modificador direto no PF2e. A escala é dado da definição do sistema
-- (`EscalaDeAtributo`, packages/shared/src/sistemas/tipos.ts), e a partir do
-- RV-098 `personagens.dados` de uma ficha de PF2e NÃO guarda modificador nenhum.
--
-- POR QUE D&D 5e NÃO É TOCADO:
-- o `where` filtra `mesas.sistema = 'pathfinder2e'`. A escala do d20 clássico é
-- exatamente a de sempre, então toda linha de D&D 5e, Tormenta 20, Ordem
-- Paranormal e genérica fica byte a byte como está — nenhuma conversão, nenhuma
-- perda. É a razão principal de a decisão ter sido esta e não "mover o atributo
-- para `dados` em todo sistema", que exigiria reescrever a coluna de todo
-- personagem já gravado.
--
-- COMO OS DOIS VALORES SÃO CONSOLIDADOS, ATRIBUTO POR ATRIBUTO:
-- havia duas fontes, e escolher a errada apaga o que o jogador digitou.
--   1. modificador gravado em `dados` diferente de zero  → é o que a ficha
--      exibia e usava na conta; manda.
--   2. senão, converte o valor da coluna comum pela fórmula do d20
--      ((valor − 10) / 2, limitado a −5..+8) → é o que a criação gravou e que a
--      ficha ignorava: Força 18 vira +4, que é o que aquele 18 sempre significou.
--   3. sem nenhum dos dois → 0.
-- Nenhuma das duas metades é descartada em silêncio. O caso 2 é o único que
-- interpreta: converter é mais fiel do que zerar (perderia o que foi digitado) e
-- do que copiar 18 como modificador (número fora da escala, que a aplicação
-- passaria a recusar em toda edição).
--
-- POR QUE O `where` TAMBÉM EXIGE UMA DAS CHAVES ANTIGAS:
-- reaplicar esta migration sem esse filtro converteria de novo um modificador já
-- consolidado (+4 viraria −3). Migration aplicada não roda outra vez — o registro
-- da 0006 impede —, mas a proteção é barata e o estrago seria silencioso.
--
-- ORDEM: aplique depois da 0008. Enquanto ela não rodar, ficha de PF2e gravada
-- antes exibe o valor da coluna comum como se fosse modificador e recusa
-- salvamento por estar fora da escala — falha ruidosa, de propósito.

create or replace function rv098_modificador_pf2e(mod_gravado jsonb, valor_comum jsonb)
returns integer language sql immutable as $$
  select case
    when jsonb_typeof(mod_gravado) = 'number' and (mod_gravado #>> '{}')::numeric <> 0
      then (mod_gravado #>> '{}')::numeric::integer
    when jsonb_typeof(valor_comum) = 'number'
      then greatest(-5, least(8, floor(((valor_comum #>> '{}')::numeric - 10) / 2)::integer))
    else 0
  end;
$$;

update personagens p
set
  atributos = jsonb_build_object(
    'forca', rv098_modificador_pf2e(p.dados -> 'modificadorForca', p.atributos -> 'forca'),
    'destreza', rv098_modificador_pf2e(p.dados -> 'modificadorDestreza', p.atributos -> 'destreza'),
    'constituicao', rv098_modificador_pf2e(
      p.dados -> 'modificadorConstituicao', p.atributos -> 'constituicao'
    ),
    'inteligencia', rv098_modificador_pf2e(
      p.dados -> 'modificadorInteligencia', p.atributos -> 'inteligencia'
    ),
    'sabedoria', rv098_modificador_pf2e(
      p.dados -> 'modificadorSabedoria', p.atributos -> 'sabedoria'
    ),
    'carisma', rv098_modificador_pf2e(p.dados -> 'modificadorCarisma', p.atributos -> 'carisma')
  ),
  dados = p.dados
    - 'modificadorForca'
    - 'modificadorDestreza'
    - 'modificadorConstituicao'
    - 'modificadorInteligencia'
    - 'modificadorSabedoria'
    - 'modificadorCarisma'
from mesas m
where m.id = p.mesa_id
  and m.sistema = 'pathfinder2e'
  and p.dados ?| array[
    'modificadorForca',
    'modificadorDestreza',
    'modificadorConstituicao',
    'modificadorInteligencia',
    'modificadorSabedoria',
    'modificadorCarisma'
  ];

-- A função existiu para esta consolidação e não faz parte do schema: mantê-la
-- deixaria no banco uma regra de um card já fechado, sem ninguém para chamá-la.
drop function rv098_modificador_pf2e(jsonb, jsonb);

insert into migrations_aplicadas (nome) values
  ('0009_consolidar_atributos_pathfinder2e')
on conflict (nome) do nothing;
