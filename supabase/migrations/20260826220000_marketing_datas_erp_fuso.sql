-- Corrige o dia das vendas/orçamentos sincronizados do ERP.
--
-- A VW_FATURAMENTO/FATGOR devolve DATA sem hora — é um dia do calendário. O
-- scheduler (db/src/lib/leadErpSyncScheduler.js) gravava com `toISOString()`,
-- que carimba o fuso do processo; como ele roda no servidor em UTC, o valor
-- virava meia-noite UTC. Só que o relatório de Marketing monta a janela do dia
-- no fuso do NAVEGADOR (-03:00), que começa às 03:00Z — a venda ficava 3 horas
-- ANTES do próprio dia e era contada no dia anterior. No dia em que aconteceu,
-- o relatório mostrava zero.
--
-- O scheduler já foi corrigido para gravar o dia fixado em -03:00 (mesmo
-- formato do lançamento manual da tela de Leads). Esta migração reancora o que
-- já está gravado.
--
-- Idempotente: reancorar um valor que já está em 03:00Z devolve 03:00Z.

update public.marketing_clientes
   set data_venda = date_trunc('day', data_venda at time zone 'UTC') at time zone 'America/Sao_Paulo'
 where venda_origem = 'erp'
   and data_venda is not null;

update public.marketing_clientes
   set data_orcamento = date_trunc('day', data_orcamento at time zone 'UTC') at time zone 'America/Sao_Paulo'
 where orcamento_origem = 'erp'
   and data_orcamento is not null;

update public.marketing_vendas
   set data = date_trunc('day', data at time zone 'UTC') at time zone 'America/Sao_Paulo'
 where origem = 'erp'
   and data is not null;
