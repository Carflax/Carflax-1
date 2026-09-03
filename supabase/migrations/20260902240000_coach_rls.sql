-- Policies das tabelas do coach.
--
-- As três tabelas nasceram com RLS ligado e sem policy nenhuma, o que nega tudo:
-- a tela do supervisor recebia "new row violates row-level security policy for
-- table coach_regras" ao tentar salvar a primeira regra.
--
-- Segue o mesmo padrão das outras tabelas do HUB (ver entregas_ocorrencias e
-- marketing_arquivamento_aprovacoes): acesso liberado para anon/authenticated,
-- porque o controle de quem enxerga o quê é feito na aplicação — o HUB usa uma
-- única chave anônima para todo mundo, e não há usuário do Postgres por pessoa
-- para uma policy discriminar.
--
-- ⚠️ Consequência que vale saber: quem tiver a chave anônima alcança estas
-- tabelas, mesmo sem ser supervisor. As análises citam trechos de conversa e
-- avaliam pessoas. Se isso precisar de sigilo real, o caminho é servir estas
-- tabelas só pelo backend (que usa a service role) e remover o acesso direto do
-- front — não dá para resolver só com policy enquanto a chave for compartilhada.
do $$
declare
  t text;
begin
  foreach t in array array['coach_regras', 'coach_atendimento_diario', 'coach_alertas', 'coach_destinatarios']
  loop
    execute format('alter table public.%I enable row level security', t);

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = t || '_all_anon_authenticated'
    ) then
      execute format(
        'create policy %I on public.%I for all to anon, authenticated using (true) with check (true)',
        t || '_all_anon_authenticated',
        t
      );
    end if;
  end loop;
end
$$;
