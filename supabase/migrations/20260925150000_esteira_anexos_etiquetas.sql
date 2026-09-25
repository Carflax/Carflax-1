-- Esteira: anexos e etiquetas nos cards.
--
-- attachments: [{ "name": "briefing.pdf", "url": "https://...", "path": "cardId/...", "type": "application/pdf", "size": 12345 }]
--              link colado entra com path nulo e type "link".
-- labels:      [{ "name": "Instagram", "color": "violet" }]
alter table public.marketing_esteira
  add column if not exists attachments jsonb not null default '[]'::jsonb,
  add column if not exists labels jsonb not null default '[]'::jsonb;

-- Bucket público (a URL vai direto no card), escrita só para usuário logado.
insert into storage.buckets (id, name, public)
values ('esteira-anexos', 'esteira-anexos', true)
on conflict (id) do nothing;

drop policy if exists "esteira_anexos_insert" on storage.objects;
create policy "esteira_anexos_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'esteira-anexos');

drop policy if exists "esteira_anexos_delete" on storage.objects;
create policy "esteira_anexos_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'esteira-anexos');
