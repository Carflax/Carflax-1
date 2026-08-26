-- Lead que vendeu não pode continuar marcado como "Perdido".
--
-- Como isso acontecia: arquivar a conversa grava `temperatura = 'Perdido'`
-- sempre que o motivo escolhido não é "Convertido" — e o antigo arquivamento em
-- massa por inatividade fazia o mesmo, sem ninguém olhar. Quando a venda saía
-- depois (ou passava a vir do ERP), nada voltava para corrigir o desfecho.
--
-- O efeito não é cosmético: esses leads entravam nos relatórios como perda,
-- derrubando a conversão do vendedor e o ROI da campanha que os gerou.
--
-- A causa está corrigida no sync (db/src/lib/leadErpSyncScheduler.js marca
-- Convertido junto com a venda). Aqui acertamos o histórico — inclusive os leads
-- fora da janela de 90 dias que a varredura não alcança mais.

update public.marketing_clientes
set temperatura = 'Convertido',
    status      = 'Convertido',
    updated_at  = now()
where coalesce(valor_venda, 0) > 0
  and (temperatura is distinct from 'Convertido' or status is distinct from 'Convertido')
  and coalesce(temperatura, '') in ('Perdido', 'Frio', 'Morno', 'Quente', '');
