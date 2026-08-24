-- Custos fixos de marketing (agência, ferramentas, assinaturas).
--
-- O investimento hoje só considera o que Meta e Google cobram pelas APIs. Os
-- R$ 3.000/mês da agência — e qualquer ferramenta paga — ficavam de fora, o que
-- inflava o retorno do tráfego todo mês pelo valor inteiro desses custos.
--
-- Guardamos o valor MENSAL com vigência (inicio/fim). O relatório aceita
-- qualquer intervalo de datas, então o valor do período é rateado por dias
-- dentro de cada mês — meio mês de agência entra como metade, não como o mês
-- cheio nem como zero.

create table if not exists public.marketing_custos_fixos (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  categoria text not null default 'Agência',
  valor_mensal numeric(12,2) not null check (valor_mensal >= 0),
  inicio date not null,
  fim date,                       -- null = ainda vigente
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_custos_fixos_periodo_valido check (fim is null or fim >= inicio)
);

create index if not exists marketing_custos_fixos_vigencia_idx
  on public.marketing_custos_fixos (inicio, fim);

alter table public.marketing_custos_fixos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='marketing_custos_fixos' and policyname='marketing_custos_fixos_all'
  ) then
    create policy "marketing_custos_fixos_all"
      on public.marketing_custos_fixos for all using (true) with check (true);
  end if;
end $$;
