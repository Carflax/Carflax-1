-- Atribuição de anúncio nos leads de WhatsApp.
--
-- Anúncios click-to-WhatsApp entregam, na PRIMEIRA mensagem do lead, um bloco de
-- referral com o anúncio que originou o clique. O handler da Evolution já lia
-- isso (externalAdReply) e gravava origem/campanha, mas descartava o ID do
-- anúncio — que é justamente a chave para cruzar lead com o gasto da campanha.
-- O handler da Cloud API oficial não lia nada, e é por onde entra o número LIVE.
--
-- Guardamos o dado bruto do anúncio para que a atribuição possa ser recalculada
-- depois (ex.: resolver ad_id → nome da campanha pela Graph API) sem depender de
-- o cliente ter dito "vim do google" no chat.

alter table public.marketing_clientes
  add column if not exists ad_id text,
  add column if not exists ad_headline text,
  add column if not exists ad_source_url text,
  add column if not exists ctwa_clid text,
  add column if not exists atribuido_em timestamptz;

comment on column public.marketing_clientes.ad_id is
  'ID do anúncio que originou o lead (referral.source_id da Cloud API / externalAdReply.sourceId da Evolution). Chave para cruzar com o gasto por campanha.';
comment on column public.marketing_clientes.ctwa_clid is
  'Click ID do click-to-WhatsApp — identificador do clique, usado para conciliação com a Meta.';

-- Relatório de rentabilidade agrupa por anúncio; sem índice isso vira scan.
create index if not exists marketing_clientes_ad_id_idx
  on public.marketing_clientes (ad_id)
  where ad_id is not null;
