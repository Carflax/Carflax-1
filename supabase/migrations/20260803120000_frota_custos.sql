-- Frota & Custos do Relatório de Entregas.
-- O km rodado real vem da API oficial da Link Monitoramento (odômetro do
-- rastreador). Combustível, custo diário e pedágio são cadastro/constante.
-- O app não usa Supabase Auth: RLS habilitado com policies permissivas (igual
-- ao resto do projeto); o backend usa service role e passa por cima do RLS.

-- 1. Cadastro dos veículos da frota. `placa` casa com o campo `rotulo` da API.
create table if not exists public.frota_veiculos (
  id uuid primary key default gen_random_uuid(),
  placa text not null unique,
  modelo text,
  km_por_litro numeric not null default 0,
  custo_diario numeric not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. Vínculo fixo motorista → veículo. driver_cod é a chave usada na tabela
--    `entregas` (rota atribuída no app de entregas).
create table if not exists public.frota_motorista_veiculo (
  driver_cod text primary key,
  veiculo_id uuid not null references public.frota_veiculos(id) on delete cascade,
  updated_at timestamptz not null default now()
);

-- 3. Km diário sincronizado da API (cache). km_real = (odometro_final -
--    odometro_inicial) do dia, em km. `pedagio` é lançamento MANUAL — o sync
--    nunca escreve nessa coluna (fica de fora do payload do upsert), então
--    re-sincronizar não zera o pedágio já lançado.
create table if not exists public.frota_km_diario (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.frota_veiculos(id) on delete cascade,
  data date not null,
  odometro_inicial numeric,
  odometro_final numeric,
  km_real numeric not null default 0,
  pedagio numeric not null default 0,
  synced_at timestamptz not null default now(),
  unique (veiculo_id, data)
);

create index if not exists idx_frota_km_diario_data on public.frota_km_diario(data);
create index if not exists idx_frota_km_diario_veiculo on public.frota_km_diario(veiculo_id);

-- 4. Configuração global (linha única): preço do litro do combustível.
create table if not exists public.frota_config (
  id integer primary key default 1,
  preco_combustivel numeric not null default 0,
  updated_at timestamptz not null default now(),
  constraint frota_config_single_row check (id = 1)
);

insert into public.frota_config (id, preco_combustivel)
  values (1, 0)
  on conflict (id) do nothing;

-- ── RLS (permissivo, igual ao restante do projeto) ──────────────────────────
alter table public.frota_veiculos enable row level security;
alter table public.frota_motorista_veiculo enable row level security;
alter table public.frota_km_diario enable row level security;
alter table public.frota_config enable row level security;

create policy "frota_veiculos_all" on public.frota_veiculos
  for all using (true) with check (true);
create policy "frota_motorista_veiculo_all" on public.frota_motorista_veiculo
  for all using (true) with check (true);
create policy "frota_km_diario_all" on public.frota_km_diario
  for all using (true) with check (true);
create policy "frota_config_all" on public.frota_config
  for all using (true) with check (true);
