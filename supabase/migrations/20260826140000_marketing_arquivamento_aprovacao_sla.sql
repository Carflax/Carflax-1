-- Controle de arquivamento de conversas do WhatsApp + escalonamento de SLA.
--
-- Motivo: o atendente conseguia arquivar uma conversa com o cliente esperando
-- resposta. Como o alerta de SLA (useTrafegoSemRespostaAlert) filtrava
-- `arquivado = false`, arquivar apagava o problema da tela do supervisor — sem
-- deixar rastro de quem arquivou nem quando.
--
-- Agora:
--   1. Arquivar com "dívida aberta" (última mensagem é do cliente / há não lidas)
--      não arquiva: cria um pedido em marketing_arquivamento_aprovacoes e a
--      conversa CONTINUA ativa até o supervisor decidir.
--   2. O escalador roda no servidor (não no navegador) e ignora `arquivado`,
--      exceto quando o arquivamento foi auditado (sla_silenciado_em preenchido).

-- ── Auditoria do arquivamento ─────────────────────────────────────────────────
alter table public.marketing_clientes
  add column if not exists arquivado_por     uuid,
  add column if not exists arquivado_em      timestamptz,
  add column if not exists sla_silenciado_em timestamptz,
  add column if not exists sla_nivel_alertado smallint not null default 0,
  add column if not exists sla_alerta_ref    timestamptz;

comment on column public.marketing_clientes.arquivado_por      is 'Usuário que efetivou o arquivamento (o aprovador, quando passou por aprovação).';
comment on column public.marketing_clientes.arquivado_em       is 'Instante do arquivamento efetivo.';
comment on column public.marketing_clientes.sla_silenciado_em  is 'Arquivamento auditado: o escalador para de alertar esta conversa. Limpo ao desarquivar.';
comment on column public.marketing_clientes.sla_nivel_alertado is 'Último degrau de escalonamento já disparado (0=nenhum, 1=atendente, 2=supervisor, 3=diretoria).';
comment on column public.marketing_clientes.sla_alerta_ref     is 'ultima_conversa_em usado no último alerta: quando muda, o degrau reinicia em 0.';

-- ── Fila de aprovação de arquivamento ─────────────────────────────────────────
create table if not exists public.marketing_arquivamento_aprovacoes (
  id                 uuid primary key default gen_random_uuid(),
  remote_jid         text        not null,
  cliente_nome       text,
  solicitante_id     uuid,
  solicitante_nome   text,
  motivo             text        not null,
  forma_pagamento    text,
  observacao         text,
  -- Foto do débito no momento do pedido: serve de prova para o supervisor decidir
  -- sem precisar abrir a conversa (e de histórico depois).
  ultima_mensagem    text,
  ultima_mensagem_em timestamptz,
  minutos_espera     integer,
  mensagens_nao_lidas integer     not null default 0,
  -- 'cancelado': o atendente respondeu o cliente antes da decisão — a dívida
  -- que motivou o pedido deixou de existir, então ele sai da fila sozinho.
  status             text        not null default 'pendente'
                       check (status in ('pendente', 'aprovado', 'recusado', 'cancelado')),
  aprovador_id       uuid,
  aprovador_nome     text,
  decisao_observacao text,
  decidido_em        timestamptz,
  created_at         timestamptz not null default now()
);

comment on table public.marketing_arquivamento_aprovacoes is
  'Pedidos de arquivamento de conversa com o cliente aguardando resposta. Só o supervisor de vendas decide.';

-- Uma conversa não pode ter dois pedidos pendentes ao mesmo tempo.
create unique index if not exists uniq_arq_aprov_pendente_por_jid
  on public.marketing_arquivamento_aprovacoes (remote_jid)
  where status = 'pendente';

create index if not exists idx_arq_aprov_status_created
  on public.marketing_arquivamento_aprovacoes (status, created_at desc);

alter table public.marketing_arquivamento_aprovacoes enable row level security;

-- Mesmo padrão das demais tabelas do módulo de marketing: o acesso é feito pelo
-- HUB autenticado; quem PODE aprovar é decidido na aplicação (podeAprovarArquivamento).
drop policy if exists "Permitir leitura total em aprovacoes de arquivamento" on public.marketing_arquivamento_aprovacoes;
create policy "Permitir leitura total em aprovacoes de arquivamento"
  on public.marketing_arquivamento_aprovacoes for select using (true);

drop policy if exists "Permitir insercao total em aprovacoes de arquivamento" on public.marketing_arquivamento_aprovacoes;
create policy "Permitir insercao total em aprovacoes de arquivamento"
  on public.marketing_arquivamento_aprovacoes for insert with check (true);

drop policy if exists "Permitir atualizacao total em aprovacoes de arquivamento" on public.marketing_arquivamento_aprovacoes;
create policy "Permitir atualizacao total em aprovacoes de arquivamento"
  on public.marketing_arquivamento_aprovacoes for update using (true);

-- Realtime: o supervisor recebe o pedido na hora, sem F5. Idempotente.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'marketing_arquivamento_aprovacoes'
  ) then
    alter publication supabase_realtime add table public.marketing_arquivamento_aprovacoes;
  end if;
end $$;
