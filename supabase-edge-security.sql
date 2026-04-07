drop policy if exists "public_can_insert_bookings" on public.bookings;

create policy "service_role_manages_bookings"
on public.bookings
for all
to service_role
using (true)
with check (true);

drop policy if exists "public_can_read_bookings" on public.bookings;
create policy "public_can_read_bookings"
on public.bookings
for select
to anon
using (true);

drop policy if exists "payment_proofs_service_only_select" on public.payment_proofs;
drop policy if exists "payment_proofs_service_only_insert" on public.payment_proofs;
drop policy if exists "payment_proofs_service_only_update" on public.payment_proofs;

create policy "service_role_manages_payment_proofs"
on public.payment_proofs
for all
to service_role
using (true)
with check (true);
