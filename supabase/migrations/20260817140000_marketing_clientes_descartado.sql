-- Flag para marcar leads descartados (importação em massa, spam, etc.)
-- sem removê-los do banco. Relatórios filtram descartado = false.
ALTER TABLE public.marketing_clientes
  ADD COLUMN IF NOT EXISTS descartado boolean NOT NULL DEFAULT false;

-- Marca os ~523 leads que entraram em 28-29/07/2026 pela ativação do
-- WhatsApp GO/API oficial: status "Cliente Curioso", sem venda, sem orçamento.
UPDATE public.marketing_clientes
SET descartado = true
WHERE created_at >= '2026-07-28T00:00:00Z'
  AND created_at < '2026-07-30T00:00:00Z'
  AND COALESCE(temperatura, 'Frio') IN ('Frio', 'Perdido')
  AND status = 'Cliente Curioso'
  AND COALESCE(valor_venda, 0) = 0
  AND COALESCE(valor_orcamento, 0) = 0;
