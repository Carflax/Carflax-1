-- Corrige leads marcados como "Convertido" (status ou temperatura) que não
-- têm venda real (valor_venda = 0 ou NULL). Esses foram marcados sem querer.

-- Status: volta para "Cliente Curioso" (estado padrão)
UPDATE public.marketing_clientes
SET status = 'Cliente Curioso'
WHERE status = 'Convertido'
  AND COALESCE(valor_venda, 0) = 0;

-- Temperatura: volta para "Frio"
UPDATE public.marketing_clientes
SET temperatura = 'Frio'
WHERE temperatura = 'Convertido'
  AND COALESCE(valor_venda, 0) = 0;
