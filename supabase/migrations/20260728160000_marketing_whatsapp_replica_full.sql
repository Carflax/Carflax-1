-- Configura REPLICA IDENTITY FULL na marketing_whatsapp para que o Supabase
-- Realtime envie a row completa nos eventos UPDATE (necessário para o shim do
-- WhatsApp GO receber message_id, status etc. no payload do postgres_changes).
--
-- Sem FULL, o Realtime só envia a primary key no `old` e apenas as colunas
-- alteradas no `new`, o que pode omitir campos que o frontend precisa.
--
-- Impacto: aumenta levemente o WAL para UPDATEs nesta tabela (grava a row
-- inteira no log), mas a tabela tem poucas colunas e o volume de UPDATEs é
-- baixo (apenas mudanças de status).

alter table public.marketing_whatsapp replica identity full;
