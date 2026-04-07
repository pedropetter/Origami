create table if not exists public.payment_proofs (
  id text primary key,
  booking_key text not null unique,
  booking_date date not null,
  slot text not null,
  customer_name text not null default '',
  customer_phone text not null default '',
  service_id text not null default '',
  professional_id text not null default '',
  file_name text not null,
  mime_type text not null default '',
  public_url text not null,
  storage_path text not null,
  proof_text text not null default '',
  analysis jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists payment_proofs_created_at_idx
on public.payment_proofs (created_at desc);

create index if not exists payment_proofs_booking_date_slot_idx
on public.payment_proofs (booking_date, slot);

alter table public.payment_proofs enable row level security;

drop policy if exists "payment_proofs_service_only_select" on public.payment_proofs;
create policy "payment_proofs_service_only_select"
on public.payment_proofs
for select
to service_role
using (true);

drop policy if exists "payment_proofs_service_only_insert" on public.payment_proofs;
create policy "payment_proofs_service_only_insert"
on public.payment_proofs
for insert
to service_role
with check (true);

drop policy if exists "payment_proofs_service_only_update" on public.payment_proofs;
create policy "payment_proofs_service_only_update"
on public.payment_proofs
for update
to service_role
using (true)
with check (true);

insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', true)
on conflict (id) do nothing;
