-- Solicitações de coleta em fornecedor (Compras › Coletas).
--
-- Hoje o comprador pede a coleta no grupo do WhatsApp e a expedição descobre
-- depois do romaneio pronto. Aqui a solicitação fica registrada com tipo (venda
-- casada ou reposição), prazo, urgência (alta exige justificativa) e a cidade do
-- fornecedor, para casar com o dia em que já existe entrega naquela região.
--
-- Status: solicitada → programada (dia e motorista) → coletada; ou cancelada.

create table if not exists public.coletas (
  id                uuid primary key default gen_random_uuid(),
  criado_em         timestamptz not null default now(),
  criado_por        uuid,
  criado_por_nome   text,

  fornecedor        text not null,
  fornecedor_codigo text,
  contato           text,
  endereco          text,
  bairro            text,
  cidade            text not null,
  uf                text not null default 'SP',

  tipo              text not null check (tipo in ('venda_casada', 'reposicao')),
  referencia        text,           -- pedido de compra, NF ou cliente da venda casada
  itens             text not null,  -- o que coletar, como o comprador escreve
  volumes           integer,
  peso_kg           numeric(10,2),

  coletar_ate       date not null,
  urgencia          text not null check (urgencia in ('baixa', 'media', 'alta')),
  justificativa     text,
  observacao        text,

  status            text not null default 'solicitada'
                    check (status in ('solicitada', 'programada', 'coletada', 'cancelada')),
  rom_date          date,           -- dia programado para a coleta
  driver_cod        text,
  driver_name       text,
  programada_em     timestamptz,
  programada_por    uuid,
  coletada_em       timestamptz,
  coletada_por      uuid,
  cancelada_em      timestamptz,
  cancelada_por     uuid,
  motivo_cancelamento text,

  -- Urgência alta sem justificativa era o problema do grupo do WhatsApp.
  constraint coletas_justificativa_alta check (urgencia <> 'alta' or coalesce(btrim(justificativa), '') <> '')
);

create index if not exists coletas_status_idx on public.coletas (status, coletar_ate);
create index if not exists coletas_rom_date_idx on public.coletas (rom_date);
create index if not exists coletas_cidade_idx on public.coletas (cidade);

alter table public.coletas enable row level security;

drop policy if exists "Autenticados gerenciam coletas" on public.coletas;
create policy "Autenticados gerenciam coletas" on public.coletas
  for all to authenticated using (true) with check (true);
