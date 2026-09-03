-- Entrega dos avisos do coach: quem recebe e o que já foi enviado.

-- ── Quem recebe ──────────────────────────────────────────────────────────────
--
-- Tabela em vez de deduzir pelo cargo. "Todos os supervisores" pela regra de
-- cargo alcançaria 9 pessoas — incluindo RH, Estoque e Administrativo, que não
-- têm nada a ver com atendimento e receberiam alerta de áudio no WhatsApp de
-- madrugada. Aqui a lista é explícita e o supervisor edita quando quiser.
create table if not exists public.coach_destinatarios (
  usuario_id  uuid primary key,
  -- O aviso sai como notificação do HUB (o sininho), que é onde o supervisor
  -- já acompanha o resto. O canal de WhatsApp fica reservado, desligado por
  -- padrão: existe a coluna, mas nada envia por ele hoje.
  whatsapp    boolean not null default false,
  hub         boolean not null default true,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

comment on table public.coach_destinatarios is
  'Quem recebe os avisos do coach de atendimento. Lista explícita — cargo não define.';

-- ── O que já foi avisado ─────────────────────────────────────────────────────
--
-- O vigia roda a cada 15 min com janela sobreposta (para não perder mensagem em
-- cima da virada), então a MESMA violação aparece em duas rodadas seguidas. Sem
-- registro do que já saiu, o supervisor receberia o alerta duas vezes.
create table if not exists public.coach_alertas (
  id           uuid primary key default gen_random_uuid(),
  -- Impressão digital da ocorrência: conversa + horário + regra. É o que
  -- identifica "é o mesmo caso" entre duas passadas do vigia.
  chave        text not null unique,
  regra        text not null,
  vendedor_id  uuid,
  vendedor_nome text,
  remote_jid   text,
  cliente      text,
  quando       text,
  trecho       text,
  explicacao   text,
  enviado_em   timestamptz,
  criado_em    timestamptz not null default now()
);

create index if not exists idx_coach_alertas_criado
  on public.coach_alertas (criado_em desc);

comment on column public.coach_alertas.chave is
  'vendedor|jid|quando|regra — impede reenviar a mesma violação a cada rodada do vigia.';
