-- Migration: Criar tabela produtos_fotos para mapear fotos da Shopify com os códigos dos produtos (cod_item/SKU do ERP)
create table if not exists public.produtos_fotos (
  cod_item text primary key,
  foto_url text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Ativa RLS
alter table public.produtos_fotos enable row level security;

-- Permite leitura pública
drop policy if exists "Allow public read access to produtos_fotos" on public.produtos_fotos;
create policy "Allow public read access to produtos_fotos"
  on public.produtos_fotos for select
  using (true);

-- Permite gravação livre para service role e anon autenticado
drop policy if exists "Allow write access to produtos_fotos" on public.produtos_fotos;
create policy "Allow write access to produtos_fotos"
  on public.produtos_fotos for all
  using (true);
