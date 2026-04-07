import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const TABLES = {
  bookings: "bookings",
  adminState: "admin_state",
  paymentProofs: "payment_proofs",
};

export const ADMIN_STATE_ID = "main";
export const PAYMENT_PROOFS_BUCKET = Deno.env.get("PAYMENT_PROOFS_BUCKET") ?? "payment-proofs";
export const PIX_WEBHOOK_SECRET = Deno.env.get("PIX_WEBHOOK_SECRET") ?? "";

export async function upsertBookingStatus(bookingKey: string, status: string) {
  const { data: current, error: currentError } = await adminClient
    .from(TABLES.adminState)
    .select("id, booking_statuses")
    .eq("id", ADMIN_STATE_ID)
    .maybeSingle();

  if (currentError) throw currentError;

  const statuses = current?.booking_statuses && typeof current.booking_statuses === "object"
    ? { ...current.booking_statuses }
    : {};

  statuses[bookingKey] = status;

  const { error } = await adminClient
    .from(TABLES.adminState)
    .upsert({ id: ADMIN_STATE_ID, booking_statuses: statuses }, { onConflict: "id" });

  if (error) throw error;
}
