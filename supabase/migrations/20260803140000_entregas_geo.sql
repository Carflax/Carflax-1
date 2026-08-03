-- Coordenadas geocodificadas do endereço da entrega, para plotar o cliente no
-- mapa ao vivo. Preenchidas sob demanda pelo backend (Nominatim) e cacheadas aqui
-- para não geocodificar o mesmo endereço toda vez.
alter table public.entregas
  add column if not exists lat numeric,
  add column if not exists lng numeric,
  add column if not exists geo_at timestamptz;
