-- Publica marketing_clientes no Realtime.
--
-- O HUB assina mudanças desta tabela em dois lugares — o canal
-- "whatsapp-clientes-changes" da tela de conversas e o do Funil de Vendas — mas
-- a tabela nunca esteve na publicação `supabase_realtime`. O canal conecta,
-- devolve SUBSCRIBED e simplesmente não recebe evento nenhum: testado com a
-- chave anônima, um UPDATE real na tabela não gerou nenhuma notificação.
--
-- É por isso que o funil só atualizava com F5 e o badge de mensagem não lida não
-- aparecia sozinho. E é o mesmo motivo de o listener da tela de conversas nunca
-- ter surtido efeito — ele existe desde antes, silenciosamente inerte.
--
-- `add table` falha se a tabela já estiver publicada, daí o bloco condicional:
-- a migration precisa poder rodar de novo sem quebrar.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'marketing_clientes'
  ) then
    alter publication supabase_realtime add table public.marketing_clientes;
  end if;
end
$$;

-- REPLICA IDENTITY FULL: sem isso o payload de UPDATE vem só com a chave
-- primária no `old`, e quem compara estado anterior x novo (a tela de conversas
-- faz isso com temperatura e não lidas) recebe um registro vazio.
alter table public.marketing_clientes replica identity full;
