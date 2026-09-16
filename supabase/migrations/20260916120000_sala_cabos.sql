-- Sala de Cabos: controle de saldo POR BOBINA e registro de cada corte.
--
-- O ERP só conhece o total do produto ("2,5mm PT Cobrecom: 500 m"), não em quais
-- bobinas esse total está. Um corte de 2 m sem anotar faz o sistema continuar
-- vendendo a bobina como inteira — e o cliente recebe 498 m. Aqui cada bobina
-- tem saldo próprio e cada corte fica gravado com pedido, metros, saldo e QUEM
-- cortou (identificado por PIN no tablet da sala, não por quem separou o pedido).
--
-- Escrita só pelo backend (service role). RLS ligado e sem policy para anon:
-- o hash do PIN não pode ficar legível pelo front.

create table if not exists public.sala_cabos_operadores (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.usuarios(id) on delete set null,
  nome text not null,
  pin_hash text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sala_cabos_bobinas (
  id uuid primary key default gen_random_uuid(),
  -- Número curto impresso na etiqueta (BOB-000123), digitável no tablet.
  numero bigserial unique,
  empresa text not null,
  cod_produto text not null,
  descricao text not null,
  metragem_inicial numeric(12,2) not null check (metragem_inicial > 0),
  saldo numeric(12,2) not null check (saldo >= 0),
  status text not null default 'ativa' check (status in ('ativa', 'finalizada')),
  observacao text,
  criado_por_id uuid references public.sala_cabos_operadores(id) on delete set null,
  criado_por_nome text,
  finalizada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sala_cabos_bobinas_produto
  on public.sala_cabos_bobinas (empresa, cod_produto) where status = 'ativa';

create table if not exists public.sala_cabos_movimentos (
  id uuid primary key default gen_random_uuid(),
  bobina_id uuid not null references public.sala_cabos_bobinas(id) on delete cascade,
  -- entrada: cadastro da bobina (contagem inicial ou bobina nova)
  -- corte:   metros que saíram da bobina
  -- ajuste:  medição do saldo real (sobra/falta encontrada)
  tipo text not null check (tipo in ('entrada', 'corte', 'ajuste')),
  metros numeric(12,2) not null,
  saldo_antes numeric(12,2) not null,
  saldo_depois numeric(12,2) not null,
  motivo text not null default 'pedido'
    check (motivo in ('pedido', 'amostra', 'perda', 'ponta', 'uso_interno', 'contagem', 'entrada')),
  pedido text,
  pedido_empresa text,
  observacao text,
  operador_id uuid references public.sala_cabos_operadores(id) on delete set null,
  operador_nome text not null,
  estornado_em timestamptz,
  estornado_por text,
  estorno_motivo text,
  created_at timestamptz not null default now()
);

create index if not exists idx_sala_cabos_mov_bobina on public.sala_cabos_movimentos (bobina_id, created_at desc);
create index if not exists idx_sala_cabos_mov_pedido on public.sala_cabos_movimentos (pedido) where pedido is not null;
create index if not exists idx_sala_cabos_mov_data on public.sala_cabos_movimentos (created_at desc);

alter table public.sala_cabos_operadores enable row level security;
alter table public.sala_cabos_bobinas enable row level security;
alter table public.sala_cabos_movimentos enable row level security;

-- Movimento atômico: trava a bobina, confere saldo e grava saldo + histórico
-- juntos. Sem isso, dois cortes simultâneos na mesma bobina perderiam um.
create or replace function public.sala_cabos_movimentar(
  p_bobina_id uuid,
  p_tipo text,
  p_metros numeric,
  p_motivo text,
  p_pedido text,
  p_pedido_empresa text,
  p_observacao text,
  p_operador_id uuid,
  p_operador_nome text
) returns public.sala_cabos_movimentos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bobina public.sala_cabos_bobinas;
  v_novo numeric(12,2);
  v_mov public.sala_cabos_movimentos;
begin
  select * into v_bobina from public.sala_cabos_bobinas where id = p_bobina_id for update;
  if not found then
    raise exception 'BOBINA_NAO_ENCONTRADA';
  end if;
  if v_bobina.status <> 'ativa' then
    raise exception 'BOBINA_FINALIZADA';
  end if;

  if p_tipo = 'corte' then
    if p_metros <= 0 then raise exception 'METROS_INVALIDOS'; end if;
    if p_metros > v_bobina.saldo then raise exception 'SALDO_INSUFICIENTE'; end if;
    v_novo := v_bobina.saldo - p_metros;
  elsif p_tipo = 'ajuste' then
    -- p_metros é o saldo REAL medido; o movimento guarda a diferença.
    if p_metros < 0 then raise exception 'METROS_INVALIDOS'; end if;
    v_novo := p_metros;
  else
    raise exception 'TIPO_INVALIDO';
  end if;

  update public.sala_cabos_bobinas
     set saldo = v_novo,
         status = case when v_novo = 0 then 'finalizada' else 'ativa' end,
         finalizada_em = case when v_novo = 0 then now() else null end,
         updated_at = now()
   where id = p_bobina_id;

  insert into public.sala_cabos_movimentos
    (bobina_id, tipo, metros, saldo_antes, saldo_depois, motivo, pedido, pedido_empresa,
     observacao, operador_id, operador_nome)
  values
    (p_bobina_id, p_tipo,
     case when p_tipo = 'corte' then p_metros else v_novo - v_bobina.saldo end,
     v_bobina.saldo, v_novo, p_motivo, p_pedido, p_pedido_empresa,
     p_observacao, p_operador_id, p_operador_nome)
  returning * into v_mov;

  return v_mov;
end $$;

-- Estorno de corte lançado errado: devolve os metros à bobina (reabrindo-a se
-- tinha zerado) e marca o movimento, sem apagar — o histórico fica completo.
create or replace function public.sala_cabos_estornar(
  p_movimento_id uuid,
  p_por text,
  p_motivo text
) returns public.sala_cabos_movimentos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mov public.sala_cabos_movimentos;
begin
  select * into v_mov from public.sala_cabos_movimentos where id = p_movimento_id for update;
  if not found then raise exception 'MOVIMENTO_NAO_ENCONTRADO'; end if;
  if v_mov.tipo <> 'corte' then raise exception 'SO_CORTE_ESTORNA'; end if;
  if v_mov.estornado_em is not null then raise exception 'JA_ESTORNADO'; end if;

  perform 1 from public.sala_cabos_bobinas where id = v_mov.bobina_id for update;

  update public.sala_cabos_bobinas
     set saldo = saldo + v_mov.metros,
         status = 'ativa',
         finalizada_em = null,
         updated_at = now()
   where id = v_mov.bobina_id;

  update public.sala_cabos_movimentos
     set estornado_em = now(), estornado_por = p_por, estorno_motivo = p_motivo
   where id = p_movimento_id
  returning * into v_mov;

  return v_mov;
end $$;

revoke all on function public.sala_cabos_movimentar(uuid, text, numeric, text, text, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.sala_cabos_estornar(uuid, text, text) from public, anon, authenticated;
