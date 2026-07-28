-- Habilita realtime na marketing_whatsapp.
--
-- Motivo: a tela "WhatsApp GO" recebe as mensagens ao vivo via realtime do
-- Supabase (o webhook do Evolution GO grava aqui, e o shim do cliente escuta os
-- postgres_changes desta tabela). O WhatsApp comercial (Evolution v2) recebia ao
-- vivo pelo socket do Evolution, então esta tabela nunca tinha sido publicada —
-- por isso as mensagens do GO só apareciam ao recarregar a página.
--
-- Idempotente: só adiciona se ainda não estiver na publicação.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'marketing_whatsapp'
  ) then
    alter publication supabase_realtime add table public.marketing_whatsapp;
  end if;
end $$;
