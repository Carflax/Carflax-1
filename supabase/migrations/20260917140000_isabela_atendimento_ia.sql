-- Isabela: atendente virtual do WhatsApp (API oficial).
--
-- Atende o lead novo até um vendedor assumir: entende o pedido, consulta
-- catálogo/preço/estoque no ERP, monta o pré-orçamento e transfere para o
-- vendedor fechar. Quem responde é o backend (db/src/lib/isabela), disparado
-- pelo webhook do WhatsApp.
--
-- isabela_config     → uma linha só (id = 1), editada no HUB.
-- isabela_conversas  → estado da Isabela em cada conversa.
-- marketing_whatsapp.autor = 'isabela' marca as mensagens enviadas por ela
-- (vendedor_id fica nulo: quem assume a conversa é sempre uma pessoa).

create table if not exists public.isabela_config (
  id smallint primary key default 1 check (id = 1),
  ativo boolean not null default false,
  -- 'teste': só responde aos números de numeros_teste; 'todos': todo lead novo.
  modo text not null default 'teste' check (modo in ('teste', 'todos')),
  numeros_teste text[] not null default '{}',
  -- Texto livre com o que ela precisa saber da loja (horário, endereço, entrega...).
  informacoes_loja text not null default '',
  -- Orientações extras do gestor, somadas ao comportamento padrão.
  instrucoes_extras text not null default '',
  atualizado_por text,
  updated_at timestamptz not null default now()
);

insert into public.isabela_config (id, informacoes_loja)
values (1, 'Carflax Hidráulica e Elétrica — Av. Américo Bruno, 75, Ponte São João, Jundiaí - SP (CEP 13218-080).')
on conflict (id) do nothing;

create table if not exists public.isabela_conversas (
  remote_jid text primary key,
  -- ativa: Isabela respondendo · transferida: ela passou para o vendedor ·
  -- assumida: um vendedor respondeu ou clicou em assumir · pausada: desligada à mão.
  status text not null default 'ativa' check (status in ('ativa', 'transferida', 'assumida', 'pausada')),
  iniciada_em timestamptz not null default now(),
  transferida_em timestamptz,
  motivo_transferencia text,
  resumo text,
  pre_orcamento jsonb,
  respostas integer not null default 0,
  ultimo_erro text,
  updated_at timestamptz not null default now()
);

alter table public.marketing_whatsapp add column if not exists autor text;

alter table public.isabela_config enable row level security;
alter table public.isabela_conversas enable row level security;

drop policy if exists isabela_config_le on public.isabela_config;
create policy isabela_config_le on public.isabela_config for select to authenticated using (true);
drop policy if exists isabela_config_altera on public.isabela_config;
create policy isabela_config_altera on public.isabela_config for update to authenticated using (true) with check (true);

drop policy if exists isabela_conversas_le on public.isabela_conversas;
create policy isabela_conversas_le on public.isabela_conversas for select to authenticated using (true);
drop policy if exists isabela_conversas_altera on public.isabela_conversas;
create policy isabela_conversas_altera on public.isabela_conversas for update to authenticated using (true) with check (true);
drop policy if exists isabela_conversas_insere on public.isabela_conversas;
create policy isabela_conversas_insere on public.isabela_conversas for insert to authenticated with check (true);

-- Tela do WhatsApp acompanha ao vivo quando ela transfere ou é pausada.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'isabela_conversas'
  ) then
    alter publication supabase_realtime add table public.isabela_conversas;
  end if;
end $$;
