-- Marca as coordenadas que NÃO são do endereço real do cliente.
--
-- A geocodificação cai em cascata: quando o logradouro não é encontrado, o pino
-- vai para o centro do bairro e, no pior caso, para o centro da cidade. Antes
-- isso ficava indistinguível de um acerto — a PLASCAR (Av. Wilhelm Winter,
-- Distrito Industrial) aparecia sobre a Catedral de Jundiaí, 5,7 km fora.
--
-- Com a flag, o mapa mostra esses pinos como aproximados em vez de fingir
-- precisão. Coordenadas já gravadas ficam nulas e são reavaliadas na próxima
-- geocodificação.
alter table public.entregas
  add column if not exists geo_aprox boolean;

comment on column public.entregas.geo_aprox is
  'true = pino no centro do bairro/cidade (endereço não resolvido); false = logradouro encontrado';
