-- Cliente do pedido no registro de corte, para o relatório de Estoque mostrar
-- pedido, cliente, cabo, metros, quem cortou e a hora sem consultar o ERP.
alter table public.coletor_cortes_cabo add column if not exists cliente text;
