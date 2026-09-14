-- Pós-venda preventivo (Comercial). Substitui o quadro manual de
-- marketing_pos_venda, que fica intacto para histórico.
--
-- Fluxo: o HUB monta a lista de vendas do dia anterior (ERP) → gestores B2B e
-- B2C aprovam quem recebe ligação → o operador liga e registra o roteiro →
-- insatisfeito/crítico abre tratativa para o supervisor; interesse de compra
-- vai para o vendedor.

-- Configuração única (linha id = 1).
create table if not exists public.pos_venda_config (
  id smallint primary key default 1 check (id = 1),
  gestor_b2b uuid references public.usuarios(id) on delete set null,
  gestor_b2c uuid references public.usuarios(id) on delete set null,
  supervisor_b2b uuid references public.usuarios(id) on delete set null,
  supervisor_b2c uuid references public.usuarios(id) on delete set null,
  -- Recorrente: N pedidos ou mais nos últimos X dias antes da venda → fora da lista.
  recorrencia_pedidos int not null default 4,
  recorrencia_dias int not null default 90,
  -- Pouco histórico: até N pedidos nos 365 dias anteriores.
  pouco_historico_pedidos int not null default 2,
  -- Não volta para a lista quem já foi contatado nesse intervalo.
  dias_sem_recontato int not null default 60,
  max_tentativas int not null default 3,
  prazo_critico_dias int not null default 1,
  prazo_insatisfeito_dias int not null default 3,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.usuarios(id) on delete set null
);
insert into public.pos_venda_config (id) values (1) on conflict (id) do nothing;

-- Aprovação da lista por dia e carteira.
create table if not exists public.pos_venda_listas (
  id uuid primary key default gen_random_uuid(),
  data_venda date not null,
  segmento text not null check (segmento in ('B2B', 'B2C')),
  aprovado_por uuid references public.usuarios(id) on delete set null,
  aprovado_em timestamptz not null default now(),
  unique (data_venda, segmento)
);

-- Um cliente por dia de venda.
create table if not exists public.pos_venda_contatos (
  id uuid primary key default gen_random_uuid(),
  data_venda date not null,
  segmento text not null check (segmento in ('B2B', 'B2C')),
  cod_cliente text not null,
  cliente_nome text not null,
  tipo_pessoa text,
  telefone text,
  celular text,
  cidade text,
  documentos text[] not null default '{}',
  valor_total numeric(14,2) not null default 0,
  cod_vendedor text,
  nome_vendedor text,
  vendedor_user_id uuid references public.usuarios(id) on delete set null,

  -- primeira_compra | pouco_historico | ativo | recorrente
  categoria text not null,
  pedidos_365d int not null default 0,
  pedidos_janela int not null default 0,
  -- 1 primeira compra, 2 pouco histórico, 3 indicado pelo gestor
  prioridade smallint,
  -- fora | pendente | excluido | a_ligar | retornar | contatado | nao_contatado
  status text not null default 'pendente',
  motivo_fora text,

  tentativas int not null default 0,
  ultima_tentativa_em timestamptz,
  ultimo_resultado text,
  retornar_em timestamptz,

  experiencia_esperada text,
  dificuldades text[] not null default '{}',
  dificuldade_detalhe text,
  melhoria text,
  nota smallint check (nota between 0 and 10),
  voltaria_comprar text,
  classificacao text check (classificacao in ('satisfeito', 'melhoria', 'insatisfeito', 'critico')),
  observacoes text,
  duracao_segundos int,
  ligado_por uuid references public.usuarios(id) on delete set null,
  contatado_em timestamptz,

  interesse_comercial boolean not null default false,
  interesse_produto text,
  vendedor_notificado_em timestamptz,
  vendedor_retorno_em timestamptz,
  vendedor_retorno_obs text,

  supervisor_id uuid references public.usuarios(id) on delete set null,
  supervisor_notificado_em timestamptz,
  tratativa_responsavel uuid references public.usuarios(id) on delete set null,
  tratativa_prazo date,
  tratativa_status text check (tratativa_status in ('aberta', 'resolvida')),
  tratativa_resolucao text,
  tratativa_resolvida_em timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (data_venda, cod_cliente)
);

create index if not exists idx_pos_venda_contatos_status on public.pos_venda_contatos (status, data_venda);
create index if not exists idx_pos_venda_contatos_cliente on public.pos_venda_contatos (cod_cliente, contatado_em);
create index if not exists idx_pos_venda_contatos_tratativa on public.pos_venda_contatos (tratativa_status) where tratativa_status is not null;
create index if not exists idx_pos_venda_contatos_interesse on public.pos_venda_contatos (vendedor_user_id) where interesse_comercial;

-- Mesmo padrão do projeto: RLS ligado, controle de acesso na aplicação.
alter table public.pos_venda_config enable row level security;
alter table public.pos_venda_listas enable row level security;
alter table public.pos_venda_contatos enable row level security;

do $$
declare t text;
begin
  foreach t in array array['pos_venda_config', 'pos_venda_listas', 'pos_venda_contatos'] loop
    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_all'
    ) then
      execute format('create policy %I on public.%I for all using (true) with check (true)', t || '_all', t);
    end if;
  end loop;
end $$;
