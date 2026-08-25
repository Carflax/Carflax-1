-- Vínculo entre a conversa do WhatsApp e o cadastro do cliente no ERP.
--
-- Não existe chave formal entre os dois mundos: o vendedor atende no WhatsApp e
-- cadastra o cliente na Citel. Estas colunas guardam o vínculo já resolvido, para
-- as telas e relatórios não terem que recalcular (e para dar para auditar COMO
-- cada vínculo foi feito).
--
--   vinculo_origem = 'documento' -> número do orçamento/pedido do PDF enviado na
--                                   conversa. Exato.
--   vinculo_origem = 'telefone'  -> telefone da conversa bateu com CADCLI.
--                                   Confiável, mas não infalível.
--   vinculo_origem = 'manual'    -> alguém corrigiu na tela.
alter table public.marketing_clientes
  add column if not exists cod_cliente_erp text,
  add column if not exists vinculo_origem  text,
  add column if not exists vinculado_em    timestamptz;

create index if not exists marketing_clientes_cod_erp_idx
  on public.marketing_clientes (cod_cliente_erp);
