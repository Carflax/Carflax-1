-- Estende o carimbo de servidor para TODOS os horários da mensagem: além de
-- created_at/entregue_em/lida_em, o próprio `timestamp` (que ordena as bolhas e
-- aparece no chat) passa a ser gravado com o relógio do SERVIDOR no insert.
--
-- Motivo: o `timestamp` era `new Date()` do aparelho de quem envia. Aparelhos com
-- relógio adiantado/atrasado geravam mensagens fora de ordem e com hora errada no
-- balão. Regra do negócio: tudo usa o horário do servidor, nunca o local do usuário.
--
-- Observação: inserts de importação histórica (ex.: migração do Firebase, já
-- executada) passariam a receber now() — não re-execute aquela importação com este
-- trigger ativo se quiser preservar as datas originais.

create or replace function public.crm_conversas_stamp_server_time()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    -- enviada + horário exibido = instante real do insert no servidor
    new.created_at := now();
    new."timestamp" := now();
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

-- O trigger já existe (criado na migração anterior) e aponta para esta função;
-- o create or replace acima basta. Recria por segurança/idempotência.
drop trigger if exists trg_crm_conversas_stamp on public.crm_conversas;
create trigger trg_crm_conversas_stamp
  before insert or update on public.crm_conversas
  for each row
  execute function public.crm_conversas_stamp_server_time();
