-- Corrige o índice único de rh_candidatos.
--
-- A versão anterior era PARCIAL (`where arquivo_path is not null`). O Postgres só
-- aceita inferir um índice parcial no ON CONFLICT se a query repetir o mesmo
-- predicado — e o client do Supabase (`upsert({ onConflict })`) não tem como
-- mandar isso. Resultado: a importação quebrava com
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification".
--
-- Trocamos por um índice TOTAL. Currículo colado tem arquivo_path null, e no
-- Postgres NULL nunca conflita com NULL, então os colados seguem entrando como
-- registros novos — que é o comportamento desejado.

drop index if exists public.rh_candidatos_vaga_arquivo_uidx;

create unique index if not exists rh_candidatos_vaga_arquivo_uidx
  on public.rh_candidatos (vaga_id, arquivo_path);
