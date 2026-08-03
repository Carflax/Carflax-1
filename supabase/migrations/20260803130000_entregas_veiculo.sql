-- Vínculo do veículo ao romaneio/entrega: escolhido ao lançar a NF (ou editado
-- depois no card do romaneio). Substitui, para o mapa ao vivo, o vínculo fixo
-- motorista→veículo por um vínculo por rota/dia (mais fiel à operação).
alter table public.entregas
  add column if not exists veiculo_id uuid references public.frota_veiculos(id) on delete set null;

create index if not exists idx_entregas_veiculo on public.entregas(veiculo_id);
