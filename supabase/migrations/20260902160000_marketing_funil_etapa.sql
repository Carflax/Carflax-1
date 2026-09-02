-- Funil de vendas do WhatsApp: a etapa em que cada conversa está.
--
-- Até aqui não existia etapa nenhuma. O que havia era `temperatura` (Frio/
-- Morno/Quente), que é leitura de interesse, não posição no processo — e
-- `status`, que a IA preenche com texto livre e hoje tem mais de 60 valores
-- distintos ("Não vendemos o material: rodapé", "chamou e não falou nada").
-- Nenhum dos dois serve para arrastar um card de uma coluna para outra.
--
-- Fica nulo por padrão de propósito: enquanto ninguém arrastar o card, o quadro
-- deriva a coluna dos dados que já existem (tem venda? tem orçamento? está
-- perdido?). Assim o funil nasce populado, sem backfill, e o valor gravado aqui
-- só aparece quando alguém decidiu a etapa na mão — passando a valer sobre a
-- derivação.
alter table public.marketing_clientes
  add column if not exists funil_etapa text;

comment on column public.marketing_clientes.funil_etapa is
  'Etapa do funil definida manualmente ao arrastar o card. Nulo = derivar dos dados (venda/orçamento/temperatura).';

-- O quadro lê "as conversas ativas com etapa", então o índice parcial cobre
-- exatamente as linhas que ele busca e ignora o resto da tabela.
create index if not exists idx_marketing_clientes_funil_etapa
  on public.marketing_clientes (funil_etapa)
  where funil_etapa is not null;
