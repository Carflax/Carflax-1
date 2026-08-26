-- Corrige as vendas somadas em duplicidade.
--
-- O modal de venda chama registerSale tanto para registrar quanto para ATUALIZAR,
-- e a função inseria uma linha nova e somava TODAS as linhas do lead. Ou seja:
-- cada correção do vendedor era somada à anterior. Um lead corrigido três vezes
-- com R$ 1.532 ficou marcado com R$ 4.596 — e esse número foi para o valor_venda,
-- para a conversão do vendedor e para o ROI da campanha.
--
-- A causa já foi corrigida no app (a linha manual passa a ser substituída). Aqui
-- limpamos o histórico: a tela nunca ofereceu "adicionar outra venda" — só
-- registrar, editar e excluir — então várias linhas manuais no mesmo lead são
-- sempre esse bug, nunca compras distintas. Linhas vindas do ERP (documento
-- preenchido) representam pedidos diferentes e não são tocadas.

-- 1. Mantém só o lançamento manual mais recente de cada lead.
with ranked as (
  select
    id,
    row_number() over (
      partition by remote_jid
      order by created_at desc nulls last, id desc
    ) as rn
  from public.marketing_vendas
  where documento is null
)
delete from public.marketing_vendas v
using ranked r
where v.id = r.id
  and r.rn > 1;

-- 2. Recalcula o valor do lead a partir do que sobrou.
update public.marketing_clientes c
set valor_venda = t.total,
    updated_at  = now()
from (
  select remote_jid, round(sum(valor)::numeric, 2) as total
  from public.marketing_vendas
  group by remote_jid
) t
where t.remote_jid = c.remote_jid
  and coalesce(c.valor_venda, 0) <> t.total;

-- Nota: lead com valor_venda e NENHUMA linha em marketing_vendas não é tocado.
-- A tela de Leads (LeadsView) grava o valor direto em marketing_clientes, sem
-- passar por marketing_vendas — zerar por ausência de linha apagaria venda boa.
