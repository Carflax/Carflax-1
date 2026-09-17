-- Aprendizado da Isabela com as conversas dos vendedores.
--
-- O backend lê conversas reais do WhatsApp que viraram venda (e, para
-- contraste, as que pararam no orçamento) e a IA resume como os vendedores da
-- Carflax atendem: abertura, perguntas, argumentos, venda casada, fechamento.
-- O resumo nasce como RASCUNHO; só depois que um gestor revisa e aprova ele
-- entra nas instruções da Isabela — para ela não aprender hábito ruim (ex.:
-- prometer desconto). Vale sempre o aprovado mais recente.

create table if not exists public.isabela_aprendizados (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'processando'
    check (status in ('processando', 'rascunho', 'aprovado', 'descartado', 'erro')),
  conteudo text,
  conversas_venda integer not null default 0,
  conversas_sem_venda integer not null default 0,
  erro text,
  criado_por text,
  aprovado_por text,
  aprovado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_isabela_aprendizados_status on public.isabela_aprendizados (status, aprovado_em desc);

alter table public.isabela_aprendizados enable row level security;

drop policy if exists isabela_aprendizados_le on public.isabela_aprendizados;
create policy isabela_aprendizados_le on public.isabela_aprendizados for select to authenticated using (true);
drop policy if exists isabela_aprendizados_altera on public.isabela_aprendizados;
create policy isabela_aprendizados_altera on public.isabela_aprendizados for update to authenticated using (true) with check (true);
