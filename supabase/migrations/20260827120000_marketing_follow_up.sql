-- Follow-up agendado da conversa do WhatsApp.
--
-- Até aqui o "agendar follow-up" da tela só existia em memória do React: não
-- havia coluna, nada gravava e nada lia de volta — a data sumia no primeiro F5
-- e nunca virava lembrete para ninguém.
--
-- Agora o agendamento arquiva a conversa (ela sai da caixa de entrada até a
-- data) e um agendador no servidor a devolve para os ativos na hora marcada,
-- mesmo com o HUB fechado — mesma razão do escalador de SLA rodar no servidor.
alter table public.marketing_clientes
  add column if not exists follow_up_em          timestamptz,
  add column if not exists follow_up_criado_por  uuid,
  add column if not exists follow_up_criado_em   timestamptz,
  -- Marca que o agendador já devolveu a conversa. É o que diferencia
  -- "esperando a data" de "voltou, trate agora" — e o que impede a rotina de
  -- desarquivar a mesma conversa a cada varredura.
  add column if not exists follow_up_atendido_em timestamptz;

comment on column public.marketing_clientes.follow_up_em is
  'Quando a conversa deve voltar para os ativos. Nulo = sem follow-up agendado.';
comment on column public.marketing_clientes.follow_up_atendido_em is
  'Quando o agendador devolveu a conversa. Enquanto preenchido, a tela mostra o selo de follow-up.';

-- A varredura roda de minuto em minuto e só procura o que está vencido e ainda
-- não atendido; o índice parcial mantém isso barato conforme a base cresce.
create index if not exists marketing_clientes_follow_up_pendente_idx
  on public.marketing_clientes (follow_up_em)
  where follow_up_em is not null and follow_up_atendido_em is null;
