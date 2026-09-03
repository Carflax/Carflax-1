-- Regras de atendimento definidas pelo supervisor.
--
-- Texto livre, em português, avaliado pela IA junto com a análise diária. O
-- supervisor escreve o que quer vigiar ("me avise quando o cliente mandar
-- mensagem e o atendente responder com áudio") sem depender de alguém programar
-- cada verificação — que é o que tornaria a coisa inviável de manter.
create table if not exists public.coach_regras (
  id           uuid primary key default gen_random_uuid(),
  regra        text not null,
  ativa        boolean not null default true,
  -- Nulo = vale para todos os atendentes. Preenchido = só para aquele, para
  -- acompanhar um ponto específico de quem está em treinamento.
  vendedor_id  uuid,
  criado_por   uuid,
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- O agendador lê "as regras ativas" uma vez por execução.
create index if not exists idx_coach_regras_ativas
  on public.coach_regras (ativa)
  where ativa;

comment on table public.coach_regras is
  'Regras em texto livre que a IA verifica nas conversas do dia. Nulo em vendedor_id = vale para todos.';

-- Onde as violações do dia são registradas, junto com o resto da análise.
alter table public.coach_atendimento_diario
  add column if not exists alertas jsonb not null default '[]'::jsonb;

comment on column public.coach_atendimento_diario.alertas is
  'Violações das regras do supervisor: [{regra, cliente, quando, trecho, explicacao}].';
