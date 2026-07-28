-- Auditoria de entrega e leitura das mensagens do CRM (crm_conversas).
--
-- Motivo: o booleano `lida` era marcado como true SEMPRE que o destinatário
-- fechava a conversa/central — mesmo sem ter lido nada. Isso permitia o vendedor
-- alegar "não chegou / não vi" sem prova em contrário. Agora cada mensagem carrega
-- carimbos imutáveis de servidor, no modelo WhatsApp:
--   created_at  -> ENVIADA  (o servidor recebeu a mensagem)
--   entregue_em -> ENTREGUE (chegou no app do destinatário, com ele logado)
--   lida_em     -> VISTA    (o balão realmente apareceu na tela dele)
-- `escalado_em` trava a idempotência do alerta ao supervisor (uma vez só por msg).
--
-- Importante: colunas adicionadas SEM default e SEM backfill em massa — assim o
-- ALTER é instantâneo (só metadados), sem reescrever a tabela nem arriscar
-- statement_timeout. `created_at` ganha default now() apenas para inserts NOVOS;
-- as linhas antigas ficam com created_at NULL e o app usa (created_at ?? timestamp).

alter table public.crm_conversas
  add column if not exists created_at  timestamptz,
  add column if not exists entregue_em timestamptz,
  add column if not exists lida_em     timestamptz,
  add column if not exists escalado_em timestamptz;

-- Só afeta inserts futuros (metadados; não reescreve linhas existentes).
alter table public.crm_conversas
  alter column created_at set default now();

comment on column public.crm_conversas.created_at  is 'ENVIADA: instante de servidor do insert (default now() p/ novas; antigas usam timestamp).';
comment on column public.crm_conversas.entregue_em is 'ENTREGUE: instante em que o app do destinatário recebeu/carregou a mensagem (ele logado).';
comment on column public.crm_conversas.lida_em     is 'VISTA: instante em que o balão apareceu de fato na tela do destinatário (IntersectionObserver).';
comment on column public.crm_conversas.escalado_em is 'Trava de idempotência: quando o alerta de "não visualizada" foi enviado ao supervisor.';

-- Índice parcial para o escalador varrer só o que interessa (não-visto e não-escalado).
create index if not exists idx_crm_conversas_pendente_escala
  on public.crm_conversas (created_at)
  where lida_em is null and escalado_em is null;
