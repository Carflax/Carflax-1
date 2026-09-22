-- Carlinhos: cadastro do cliente no ERP feito pelo próprio atendente virtual.
--
-- `cadastro` guarda o que ele gravou (ou achou já cadastrado): código do cliente
-- na Citel, documento, nome e o vendedor que ficou no cadastro. A transferência
-- usa esse vendedor, para o cliente cair com quem já está no cadastro do ERP.

alter table public.isabela_conversas add column if not exists cadastro jsonb;
