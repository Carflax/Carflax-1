-- Inventário da sala de cabos (Estoque › Cabos › Inventário).
--
-- O gestor conta cada cabo vendido a metro e separa o que está na bobina do que
-- está picado (sobras cortadas). Quem vai cortar vê esses números na tela de
-- corte. Cada contagem é uma linha nova: a atual é a mais recente do produto, e
-- as anteriores ficam como histórico. O saldo do ERP no momento da contagem é
-- guardado para comparar depois.
--
-- Escrita e leitura só pelo backend (service role): RLS ligado, sem policy.

create table if not exists public.cabos_inventario (
  id uuid primary key default gen_random_uuid(),
  cod_produto text not null,
  descricao text not null,
  metros_bobina numeric(12,2) not null check (metros_bobina >= 0),
  metros_picado numeric(12,2) not null check (metros_picado >= 0),
  saldo_erp numeric(12,2),
  disponivel_erp numeric(12,2),
  contado_por_id uuid references public.usuarios(id) on delete set null,
  contado_por_nome text not null,
  observacao text,
  created_at timestamptz not null default now()
);

create index if not exists idx_cabos_inventario_produto
  on public.cabos_inventario (cod_produto, created_at desc);

alter table public.cabos_inventario enable row level security;
