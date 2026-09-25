-- Coleta encaixada num romaneio específico (não só "hoje com o motorista X").
alter table public.coletas add column if not exists rom_code text;
