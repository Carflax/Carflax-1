-- Coach de atendimento: análise diária das conversas de cada atendente.
--
-- Guarda o resultado em vez de gerar sob demanda na tela: a análise é cara
-- (uma chamada de IA por atendente por dia) e não muda depois que o dia fecha.
-- Assim o histórico fica disponível para comparar evolução ao longo das semanas,
-- que é o que faz a coisa virar treinamento e não só um alerta que passa.
create table if not exists public.coach_atendimento_diario (
  id             uuid primary key default gen_random_uuid(),
  dia            date not null,
  vendedor_id    uuid not null,
  vendedor_nome  text,
  -- Volume analisado, para dar contexto à nota: "6 de 10" num dia de 2 conversas
  -- não significa o mesmo que num dia de 30.
  conversas      integer not null default 0,
  mensagens      integer not null default 0,
  -- 0 a 10. Serve para acompanhar tendência, não para punir número isolado.
  nota           numeric(3,1),
  resumo         text,
  -- Listas de texto curto: o que foi bem, o que corrigir e exemplos reais
  -- citados da conversa (o exemplo é o que faz o atendente reconhecer o erro).
  acertos        jsonb not null default '[]'::jsonb,
  pontos_corrigir jsonb not null default '[]'::jsonb,
  exemplos       jsonb not null default '[]'::jsonb,
  modelo         text,
  criado_em      timestamptz not null default now()
);

-- Um registro por atendente por dia: rodar o agendador duas vezes atualiza em
-- vez de duplicar.
create unique index if not exists idx_coach_diario_dia_vendedor
  on public.coach_atendimento_diario (dia, vendedor_id);

-- A tela lista "os últimos dias deste atendente" e "o dia de hoje do time".
create index if not exists idx_coach_diario_vendedor_dia
  on public.coach_atendimento_diario (vendedor_id, dia desc);

comment on table public.coach_atendimento_diario is
  'Análise diária, por IA, das conversas de WhatsApp de cada atendente. Gerada pelo coachAtendimentoScheduler.';
