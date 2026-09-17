-- Transferência da Isabela vai para um vendedor de verdade.
--
-- vendedores_ids: quem pode receber conversas da Isabela (marcado no HUB).
-- Na transferência ela escolhe, entre eles, quem tem menos conversas abertas e
-- grava marketing_clientes.vendedor_id — antes a conversa ficava "Aguardando",
-- sem dono. transferida_para guarda quem recebeu.

alter table public.isabela_config add column if not exists vendedores_ids text[] not null default '{}';
alter table public.isabela_conversas add column if not exists transferida_para text;
