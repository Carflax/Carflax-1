-- Cliques de anúncio que viraram conversa no WhatsApp.
--
-- O Google só entrega o gclid na página de destino do anúncio; em link wa.me
-- direto ele se perde. A página public/w.html registra o clique aqui e manda o
-- cliente para o WhatsApp com um código curto na mensagem, que o webhook usa
-- para casar o lead com a campanha.
create table if not exists public.ads_cliques (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique,

  -- Identificadores de clique
  gclid         text,
  gbraid        text,
  wbraid        text,
  fbclid        text,

  -- Origem declarada na URL do anúncio
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  utm_term      text,
  campaign_id   text,
  adgroup_id    text,
  creative_id   text,
  keyword       text,
  network       text,
  device        text,

  -- Contexto do clique
  referrer      text,
  user_agent    text,
  url_completa  text,

  -- Preenchidos quando a mensagem chega e o código é reconhecido
  remote_jid    text,
  casado_em     timestamptz,

  created_at    timestamptz not null default now()
);

create index if not exists ads_cliques_codigo_idx      on public.ads_cliques (codigo);
create index if not exists ads_cliques_created_at_idx  on public.ads_cliques (created_at desc);
create index if not exists ads_cliques_remote_jid_idx  on public.ads_cliques (remote_jid);
create index if not exists ads_cliques_gclid_idx       on public.ads_cliques (gclid);

alter table public.ads_cliques enable row level security;

-- A página de redirecionamento é pública e roda com a chave anon: precisa
-- inserir. Não pode ler nem alterar nada — quem lê é o backend, com service role.
drop policy if exists ads_cliques_insere_anon on public.ads_cliques;
create policy ads_cliques_insere_anon
  on public.ads_cliques for insert to anon
  with check (true);

-- Leitura só para usuário autenticado do HUB (relatórios).
drop policy if exists ads_cliques_le_autenticado on public.ads_cliques;
create policy ads_cliques_le_autenticado
  on public.ads_cliques for select to authenticated
  using (true);

-- ─── Casamento por janela de tempo ───────────────────────────────────────────
-- O código na mensagem pode ser apagado pelo cliente antes de enviar. Nesse caso
-- o webhook procura um clique recente ainda não casado; `confianca` registra
-- como a atribuição foi feita, para o relatório não tratar palpite como certeza.
--   'codigo'                -> o código veio na mensagem (1:1, exato)
--   'janela'                -> único clique sem dono na janela de tempo
--   'janela_mesma_campanha' -> vários cliques na janela, todos da mesma campanha
alter table public.ads_cliques add column if not exists confianca text;

-- Índice parcial: a busca por janela só olha cliques órfãos.
create index if not exists ads_cliques_pendentes_idx
  on public.ads_cliques (created_at desc) where remote_jid is null;
