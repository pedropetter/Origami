create table if not exists public.admin_state (
  id text primary key,
  stock jsonb not null default '[]'::jsonb,
  booking_statuses jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.admin_state enable row level security;

drop policy if exists "admin_state_select_authenticated" on public.admin_state;
create policy "admin_state_select_authenticated"
on public.admin_state
for select
to authenticated
using (true);

drop policy if exists "admin_state_insert_authenticated" on public.admin_state;
create policy "admin_state_insert_authenticated"
on public.admin_state
for insert
to authenticated
with check (true);

drop policy if exists "admin_state_update_authenticated" on public.admin_state;
create policy "admin_state_update_authenticated"
on public.admin_state
for update
to authenticated
using (true)
with check (true);

insert into public.admin_state (id, stock, booking_statuses)
values ('main', '[]'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
