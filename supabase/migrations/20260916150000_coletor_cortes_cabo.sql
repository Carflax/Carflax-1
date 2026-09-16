-- Corte de cabo registrado na SEPARAÇÃO do Coletor.
--
-- Substitui a primeira versão da Sala de Cabos (20260916120000_sala_cabos.sql:
-- tablet fixo, PIN e bobina etiquetada), descartada pelo usuário no mesmo dia —
-- sem nenhuma bobina ou corte gravado, só um operador de teste.
--
-- Agora é o papel da sala levado para o Coletor: ao separar um cabo vendido a
-- metro, o separador informa QUEM CORTOU (nem sempre é ele) e QUANTO SOBROU na
-- bobina. Pedido, cabo e dia vêm do próprio pedido.

drop function if exists public.sala_cabos_movimentar(uuid, text, numeric, text, text, text, text, uuid, text);
drop function if exists public.sala_cabos_estornar(uuid, text, text);
drop table if exists public.sala_cabos_movimentos;
drop table if exists public.sala_cabos_bobinas;
drop table if exists public.sala_cabos_operadores;

create table if not exists public.coletor_cortes_cabo (
  id uuid primary key default gen_random_uuid(),
  empresa text not null,
  pedido text not null,
  cod_produto text not null,
  descricao text not null,
  metros numeric(12,2) not null check (metros > 0),
  -- Quanto ficou na bobina depois do corte, lido/medido por quem cortou.
  saldo_bobina numeric(12,2) not null check (saldo_bobina >= 0),
  cortado_por_codigo text,
  cortado_por_nome text not null,
  registrado_por_codigo text,
  registrado_por_nome text,
  observacao text,
  created_at timestamptz not null default now()
);

create index if not exists idx_coletor_cortes_cabo_pedido on public.coletor_cortes_cabo (empresa, pedido);
create index if not exists idx_coletor_cortes_cabo_produto on public.coletor_cortes_cabo (empresa, cod_produto, created_at desc);
create index if not exists idx_coletor_cortes_cabo_data on public.coletor_cortes_cabo (created_at desc);

-- Mesmo regime das outras tabelas coletor_* (o app grava direto com a anon key).
alter table public.coletor_cortes_cabo enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'coletor_cortes_cabo' and policyname = 'coletor_cortes_cabo_all'
  ) then
    create policy "coletor_cortes_cabo_all"
      on public.coletor_cortes_cabo for all using (true) with check (true);
  end if;
end $$;
