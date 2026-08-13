-- Notificacoes gerais do HUB: avisos persistentes direcionados a usuarios especificos.
-- Diferente de comunicados (feed publico), estas sao notificacoes fixas por usuario.
create table if not exists public.hub_notificacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usuarios(id) on delete cascade,
  titulo text not null,
  descricao text,
  tipo text not null default 'info',
  metadata jsonb default '{}',
  lida boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_hub_notificacoes_user on public.hub_notificacoes(user_id, lida);

alter table public.hub_notificacoes enable row level security;

create policy "hub_notificacoes_select_all"
  on public.hub_notificacoes for select
  using (true);

create policy "hub_notificacoes_insert_all"
  on public.hub_notificacoes for insert
  with check (true);

create policy "hub_notificacoes_update_all"
  on public.hub_notificacoes for update
  using (true);

create policy "hub_notificacoes_delete_all"
  on public.hub_notificacoes for delete
  using (true);

alter publication supabase_realtime add table public.hub_notificacoes;
