-- De onde saiu o corte: da bobina ou do picado (sobras). Com isso o saldo de
-- cada um, a partir do último inventário, é descontado separadamente.
-- Cortes anteriores ficam sem origem (null).
alter table public.coletor_cortes_cabo
  add column if not exists origem text check (origem in ('bobina', 'picado'));
