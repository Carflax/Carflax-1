-- Prospecção do dia (Comercial > Minha Carteira): 3 clientes da carteira por
-- vendedor por dia, cada um por um motivo diferente (risco, oportunidade,
-- reativação). O vendedor registra o trabalho em 6 campos:
-- Oportunidade → Risco → Potencial → Necessidade → Ação → Próximo passo.
create table if not exists public.carteira_prospeccao_diaria (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  cod_vendedor text not null,
  cliente_id text not null,
  nome_cliente text not null,
  -- Posição do card no dia (1..3).
  ordem smallint not null check (ordem between 1 and 3),
  -- risco | oportunidade | reativacao | relacionamento
  pilar text not null check (pilar in ('risco', 'oportunidade', 'reativacao', 'relacionamento')),
  motivo text not null,
  -- Números do ERP no momento da escolha (valor 12m, pedidos, recência...).
  metricas jsonb not null default '{}',
  telefone text,

  oportunidade text,
  risco text,
  potencial text,
  necessidade text,
  acao text,
  proximo_passo text,
  proximo_contato date,
  proximo_contato_feito boolean not null default false,

  concluido_em timestamptz,
  concluido_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (data, cod_vendedor, cliente_id),
  unique (data, cod_vendedor, ordem)
);

create index if not exists idx_carteira_prospeccao_vendedor
  on public.carteira_prospeccao_diaria (cod_vendedor, data desc);
create index if not exists idx_carteira_prospeccao_proximo
  on public.carteira_prospeccao_diaria (cod_vendedor, proximo_contato)
  where proximo_contato is not null and not proximo_contato_feito;

alter table public.carteira_prospeccao_diaria enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'carteira_prospeccao_diaria' and policyname = 'carteira_prospeccao_diaria_all'
  ) then
    create policy "carteira_prospeccao_diaria_all"
      on public.carteira_prospeccao_diaria for all using (true) with check (true);
  end if;
end $$;

