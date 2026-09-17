-- Ajustes da impressora de etiquetas (Dashboard › Produtos › Etiquetas de preço).
--
-- A posição da impressão varia de impressora para impressora (a Elgin L42 da
-- loja imprimia ~6 mm fora do lugar). O ajuste é feito no próprio HUB e fica
-- salvo por nome de impressora; o HUB manda esses valores para o servidor de
-- impressão local a cada impressão. Linha 'padrao' = impressora automática.

create table if not exists public.impressora_etiqueta_config (
  impressora text primary key,
  offset_x numeric(5,1) not null default 0 check (offset_x between -20 and 20),
  offset_y numeric(5,1) not null default 0 check (offset_y between -20 and 20),
  densidade smallint not null default 12 check (densidade between 0 and 15),
  velocidade smallint not null default 4 check (velocidade between 1 and 10),
  atualizado_por text,
  updated_at timestamptz not null default now()
);

alter table public.impressora_etiqueta_config enable row level security;

drop policy if exists impressora_etiqueta_config_le on public.impressora_etiqueta_config;
create policy impressora_etiqueta_config_le
  on public.impressora_etiqueta_config for select to authenticated using (true);

drop policy if exists impressora_etiqueta_config_insere on public.impressora_etiqueta_config;
create policy impressora_etiqueta_config_insere
  on public.impressora_etiqueta_config for insert to authenticated with check (true);

drop policy if exists impressora_etiqueta_config_altera on public.impressora_etiqueta_config;
create policy impressora_etiqueta_config_altera
  on public.impressora_etiqueta_config for update to authenticated using (true) with check (true);
