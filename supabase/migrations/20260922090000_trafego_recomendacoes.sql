-- Recomendações diárias de tráfego geradas pela IA (Gestão de Tráfego › Recomendações).
--
-- Uma linha por análise. `itens` guarda as sugestões e o estado de cada uma
-- (pendente, aplicada, feita, descartada + motivo); o que for recusado volta no
-- histórico da análise seguinte para a IA não repetir.
--
-- Só o backend (service role) grava e lê: RLS ligado e sem política para
-- usuários, porque a tela consome pelo endpoint /api/marketing/trafego/recomendacoes.

create table if not exists public.trafego_recomendacoes (
  id          uuid primary key default gen_random_uuid(),
  criado_em   timestamptz not null default now(),
  data        date not null,
  status      text not null default 'gerando' check (status in ('gerando', 'pronto', 'erro')),
  origem      text not null default 'agenda',
  modelo      text,
  gerado_por  text,
  resumo      text,
  itens       jsonb not null default '[]'::jsonb,
  contexto    jsonb,
  erro        text
);

create index if not exists trafego_recomendacoes_data_idx
  on public.trafego_recomendacoes (data desc, criado_em desc);

alter table public.trafego_recomendacoes enable row level security;
