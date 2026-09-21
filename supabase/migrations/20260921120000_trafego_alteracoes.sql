-- Histórico da Gestão de Tráfego: quem ativou, pausou, mudou orçamento ou
-- criou campanha no Google Ads / Meta Ads pelo HUB, com o antes e o depois.
--
-- Só o backend (service role) grava e lê: RLS ligado e sem política para
-- usuários, porque a tela consome pelo endpoint /api/marketing/trafego/historico.

create table if not exists public.trafego_alteracoes (
  id            uuid primary key default gen_random_uuid(),
  criado_em     timestamptz not null default now(),
  usuario_id    uuid,
  usuario_email text,
  plataforma    text not null check (plataforma in ('google', 'meta')),
  campanha_id   text,
  campanha_nome text,
  acao          text not null,
  antes         jsonb,
  depois        jsonb
);

create index if not exists trafego_alteracoes_criado_em_idx
  on public.trafego_alteracoes (criado_em desc);

alter table public.trafego_alteracoes enable row level security;
