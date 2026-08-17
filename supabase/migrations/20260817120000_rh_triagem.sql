-- Migration: RH > Triagem de Currículos
--
-- Estrutura da triagem automatizada: vagas (com os pesos/critérios de pontuação),
-- candidatos (currículo + extração da IA + score calculado) e um cache de
-- geocodificação para não bater no Nominatim repetido a cada análise.
--
-- Regra de ouro: a IA só EXTRAI fatos do currículo (cidade, experiência, segmento).
-- Quem pontua é o backend, de forma determinística, usando a DISTÂNCIA REAL
-- (geocodificação) e não o nome da cidade — cidade "vizinha" pode estar a 1h.

-- ─── Vagas ────────────────────────────────────────────────────────────────────
create table if not exists public.rh_vagas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  -- Local de trabalho: origem do cálculo de distância. Default = matriz Carflax
  -- (Av. Américo Bruno, 75 · Jundiaí/SP), já geocodificada.
  local_texto text not null default 'Av. Américo Bruno, 75 - Jundiaí/SP',
  lat numeric not null default -23.1902,
  lng numeric not null default -46.8694,
  -- Requisito obrigatório ausente = eliminação automática (ex.: "CNH D", "CNPJ").
  requisitos_obrigatorios text[] not null default array[]::text[],
  -- Segmentos que valem ponto de aderência.
  segmentos text[] not null default array['material de construção','hidráulica','elétrica']::text[],
  -- Termos que caracterizam "experiência na função" desta vaga.
  palavras_funcao text[] not null default array[]::text[],
  -- Pesos e faixas de distância. Editável por vaga na tela.
  criterios jsonb not null default jsonb_build_object(
    'peso_distancia', 35,
    'peso_experiencia_funcao', 25,
    'peso_segmento', 20,
    'peso_tempo_experiencia', 10,
    'peso_experiencia_recente', 10,
    'anos_experiencia_ideal', 3,
    'meses_recente', 6,
    'faixa_excelente_km', 15,
    'faixa_aceitavel_km', 25,
    'faixa_baixa_km', 40,
    'corte_km', 40
  ),
  status text not null default 'aberta',
  criado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Candidatos ───────────────────────────────────────────────────────────────
create table if not exists public.rh_candidatos (
  id uuid primary key default gen_random_uuid(),
  vaga_id uuid not null references public.rh_vagas(id) on delete cascade,

  -- Identificação (extraída do currículo, editável na tela)
  nome text,
  email text,
  telefone text,
  cidade text,
  uf text,
  endereco_texto text,

  -- Geolocalização e distância real até o local da vaga
  lat numeric,
  lng numeric,
  distancia_km numeric,

  -- Arquivo original no bucket privado `curriculos`
  arquivo_path text,
  arquivo_nome text,
  fonte text not null default 'upload', -- upload | texto | indeed | email

  texto_cv text,

  -- Resultado da triagem
  score integer,
  faixa text,            -- verde | amarelo | vermelho | eliminado
  recomendacao text,     -- RECOMENDADO | AVALIAR | BAIXA PRIORIDADE | ELIMINADO
  motivo text,
  destaques text[] not null default array[]::text[],
  criterios jsonb,       -- breakdown ponto a ponto (auditoria da nota)

  -- Fatos extraídos pela IA (base do cálculo)
  anos_experiencia numeric,
  experiencia_funcao boolean,
  segmento_match boolean,
  meses_ultimo_emprego integer,
  requisitos_faltantes text[] not null default array[]::text[],

  status text not null default 'novo', -- novo | entrevista | aprovado | descartado
  erro text,
  analisado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Reenviar o mesmo arquivo para a mesma vaga não duplica o candidato.
-- Índice TOTAL, não parcial: o ON CONFLICT do upsert só consegue inferir um
-- índice parcial se a query repetir o predicado, o que o client do Supabase não
-- permite. Currículo colado tem arquivo_path null e NULL não conflita com NULL
-- no Postgres, então os colados continuam entrando como registros novos.
create unique index if not exists rh_candidatos_vaga_arquivo_uidx
  on public.rh_candidatos (vaga_id, arquivo_path);

create index if not exists rh_candidatos_vaga_score_idx
  on public.rh_candidatos (vaga_id, score desc nulls last);

create index if not exists rh_candidatos_status_idx
  on public.rh_candidatos (status);

-- ─── Cache de geocodificação ──────────────────────────────────────────────────
-- O Nominatim pede uso leve (1 req/s). Cidade se repete muito entre currículos,
-- então a consulta normalizada vira chave de cache permanente.
create table if not exists public.rh_geocache (
  consulta text primary key,
  lat numeric,
  lng numeric,
  encontrado boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.rh_vagas enable row level security;
alter table public.rh_candidatos enable row level security;
alter table public.rh_geocache enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_vagas' and policyname='rh_vagas_all') then
    create policy "rh_vagas_all" on public.rh_vagas for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_candidatos' and policyname='rh_candidatos_all') then
    create policy "rh_candidatos_all" on public.rh_candidatos for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='rh_geocache' and policyname='rh_geocache_all') then
    create policy "rh_geocache_all" on public.rh_geocache for all using (true) with check (true);
  end if;
end $$;

-- ─── Bucket dos currículos (PRIVADO — currículo é dado pessoal) ───────────────
insert into storage.buckets (id, name, public)
values ('curriculos', 'curriculos', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='curriculos_insert_authenticated'
  ) then
    create policy "curriculos_insert_authenticated"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'curriculos');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='curriculos_select_authenticated'
  ) then
    create policy "curriculos_select_authenticated"
      on storage.objects for select to authenticated
      using (bucket_id = 'curriculos');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='curriculos_delete_authenticated'
  ) then
    create policy "curriculos_delete_authenticated"
      on storage.objects for delete to authenticated
      using (bucket_id = 'curriculos');
  end if;
end $$;
