create table if not exists public.inbound_faxes (
  fax_id text primary key,
  sender text not null,
  recipient text not null,
  page_count integer,
  partial boolean not null default false,
  received_at timestamptz not null,
  object_path text not null
);
alter table public.inbound_faxes enable row level security;
revoke all on public.inbound_faxes from anon, authenticated;
grant all on public.inbound_faxes to service_role;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('faxes', 'faxes', false, 20971520, array['application/pdf'])
on conflict (id) do update set public = false;
