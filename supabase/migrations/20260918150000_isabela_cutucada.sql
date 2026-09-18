-- Isabela: retomada ("cutucada") quando o cliente para de responder.
--
-- Depois de alguns minutos sem resposta do cliente à última mensagem dela, a
-- Isabela manda UMA mensagem curta retomando o assunto ("ainda precisa do
-- orçamento?"). `cutucada_em` guarda quando foi, para não repetir no mesmo
-- silêncio: só volta a valer depois que o cliente escrever de novo.

alter table public.isabela_conversas add column if not exists cutucada_em timestamptz;
