-- Ocorrências de entrega: o motorista registra pelo celular (link público, papel
-- `anon`) quando algo sai do previsto na rota — cliente ausente, endereço errado,
-- recusa da mercadoria, avaria, problema no veículo. O registro cai na
-- subcategoria "Ocorrências" dentro de Entregas > Romaneios, onde a logística
-- trata e resolve.
--
-- Os dados da entrega (nf, cliente, motorista, romaneio) são copiados no momento
-- do registro em vez de lidos por join: a ocorrência é o retrato do que aconteceu
-- naquele momento e precisa continuar legível mesmo se a entrega for reordenada,
-- reatribuída ou removida do romaneio.
create table if not exists public.entregas_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  entrega_id uuid references public.entregas(id) on delete set null,
  rom_code text,
  rom_date date,
  nf text,
  client text,
  address text,
  driver_cod text,
  driver_name text,
  tipo text not null,
  descricao text,
  image text,
  -- aberta | resolvida
  status text not null default 'aberta',
  -- true quando o motorista marcou que não conseguiu entregar (entrega vira failed)
  bloqueou_entrega boolean not null default false,
  resolucao text,
  resolvido_por text,
  resolvido_em timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_ocorrencias_rom_code on public.entregas_ocorrencias(rom_code);
create index if not exists idx_ocorrencias_status on public.entregas_ocorrencias(status);
create index if not exists idx_ocorrencias_rom_date on public.entregas_ocorrencias(rom_date desc);
create index if not exists idx_ocorrencias_entrega on public.entregas_ocorrencias(entrega_id);

alter table public.entregas_ocorrencias enable row level security;

-- RLS aberto para anon/authenticated, mesmo padrão das demais tabelas de negócio
-- do projeto (controle de acesso é no app). O INSERT precisa de `anon` porque a
-- tela do motorista roda sem login.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'entregas_ocorrencias'
      and policyname = 'ocorrencias_all_anon_authenticated'
  ) then
    create policy "ocorrencias_all_anon_authenticated"
      on public.entregas_ocorrencias
      for all
      to anon, authenticated
      using (true)
      with check (true);
  end if;
end $$;

-- Realtime: a tela de Ocorrências atualiza sozinha quando o motorista registra
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'entregas_ocorrencias'
  ) then
    alter publication supabase_realtime add table public.entregas_ocorrencias;
  end if;
end $$;
