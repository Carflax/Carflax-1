-- Venda do lead puxada do ERP, em vez de digitada pelo vendedor.
--
-- O vínculo conversa → cadastro do ERP (cod_cliente_erp) já existe. Com ele dá
-- para ler os pedidos do cliente na Citel e preencher o valor da venda sozinho.
--
-- Regra de atribuição: só conta pedido emitido DEPOIS do orçamento enviado na
-- conversa (na falta de orçamento, depois do início da conversa). Sem isso, a
-- compra recorrente que o cliente faz no balcão entraria como conversão do
-- WhatsApp e inflaria a taxa de conversão do time.
--
-- `documento` é o número do pedido no ERP e é o que garante idempotência: a
-- varredura roda de 10 em 10 min e o mesmo pedido nunca entra duas vezes —
-- inclusive quando ele sai de "em aberto" para "faturado".

alter table public.marketing_vendas
  add column if not exists documento text,
  add column if not exists data      timestamptz,
  add column if not exists origem    text;

comment on column public.marketing_vendas.documento is 'Número do pedido no ERP (FGO_NUMDOC / VW_FATURAMENTO.DOCUMENTO). Nulo nas vendas lançadas à mão.';
comment on column public.marketing_vendas.origem    is 'erp = sincronizado da Citel; null/manual = digitado pelo vendedor.';

-- Idempotência da sincronização. Parcial porque as vendas manuais antigas não
-- têm documento e não podem colidir entre si.
create unique index if not exists uniq_marketing_vendas_jid_documento
  on public.marketing_vendas (remote_jid, documento)
  where documento is not null;

-- Origem do valor exibido no lead: quando o ERP assume, o número deixa de
-- depender de o vendedor lembrar de lançar.
alter table public.marketing_clientes
  add column if not exists venda_origem      text,
  add column if not exists venda_sync_em     timestamptz;

comment on column public.marketing_clientes.venda_origem  is 'erp = valor_venda veio dos pedidos da Citel; manual = lançado pelo vendedor.';
comment on column public.marketing_clientes.venda_sync_em is 'Última sincronização de vendas com o ERP.';

-- Orçamento também deixa de ser digitado: quando o vendedor gera o orçamento na
-- Citel no nome do cliente, o HUB passa a ler direto do ERP (FATGOR, ESPDOC='OR').
-- Antes isso só era capturado quando o PDF passava pela conversa.
alter table public.marketing_clientes
  add column if not exists orcamento_origem    text,
  add column if not exists orcamento_documento text,
  add column if not exists orcamento_sync_em   timestamptz;

comment on column public.marketing_clientes.orcamento_origem    is 'erp = lido dos orçamentos da Citel; pdf/carrinho/manual = veio pela conversa.';
comment on column public.marketing_clientes.orcamento_documento is 'Número do orçamento no ERP (FGO_NUMDOC) que originou o valor.';
