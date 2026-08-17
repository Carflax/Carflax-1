-- O formulário público de convite (ConviteFornecedorPublicView) grava o cadastro
-- com status 'inscricao_recebida', que já existe no front (FornecedorStatus em
-- src/components/marketing/eventos/types.ts) mas nunca entrou no CHECK do banco.
-- Resultado: todo envio do formulário estourava 23514 e o PostgREST devolvia 400.
--
-- Ordem dos valores segue o funil: contato -> media kit -> follow-up ->
-- inscrição recebida -> confirmado / recusado.

alter table public.evento_fornecedores
  drop constraint if exists evento_fornecedores_status_check;

alter table public.evento_fornecedores
  add constraint evento_fornecedores_status_check
  check (status in (
    'nao_contatado',
    'media_kit_enviado',
    'follow_up',
    'inscricao_recebida',
    'confirmado',
    'recusado'
  ));
