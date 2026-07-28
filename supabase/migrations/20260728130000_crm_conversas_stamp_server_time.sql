-- Carimba os tempos de auditoria (created_at, entregue_em, lida_em) SEMPRE com o
-- relógio do SERVIDOR, ignorando o horário enviado pelo cliente.
--
-- Motivo: entregue_em/lida_em eram gravados com `new Date()` do aparelho de quem
-- recebe/lê. Um celular com o relógio adiantado (visto em produção: ~35s à frente)
-- carimbava as confirmações no futuro — corrompendo a auditoria (uma "vista" podia
-- parecer anterior à "enviada") e fazendo a entrega instantânea parecer lenta.
-- Com o trigger, o cliente pode mandar qualquer horário: o servidor sobrescreve.
-- A transição só acontece uma vez (null -> now()); depois o carimbo é imutável.

create or replace function public.crm_conversas_stamp_server_time()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    -- enviada = instante real do insert no servidor
    new.created_at := now();
  end if;

  -- entregue_em: quando passa de null -> não-null, usa o relógio do servidor
  if new.entregue_em is not null and (TG_OP = 'INSERT' or old.entregue_em is null) then
    new.entregue_em := now();
  end if;

  -- lida_em (vista): idem
  if new.lida_em is not null and (TG_OP = 'INSERT' or old.lida_em is null) then
    new.lida_em := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_crm_conversas_stamp on public.crm_conversas;
create trigger trg_crm_conversas_stamp
  before insert or update on public.crm_conversas
  for each row
  execute function public.crm_conversas_stamp_server_time();
