-- O "quanto sobrou na bobina" saiu do registro de corte do Coletor a pedido do
-- usuário: fica só pedido, cabo, metros e quem cortou.
alter table public.coletor_cortes_cabo drop column if exists saldo_bobina;
