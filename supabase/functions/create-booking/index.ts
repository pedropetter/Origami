import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { encodeService } from "../_shared/analysis.ts";
import { adminClient, TABLES, upsertBookingStatus } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const bookingDate = body.bookingDate as string;
    const slot = body.slot as string;
    const name = body.name as string;
    const phone = body.phone as string;
    const serviceId = body.serviceId as string;
    const professionalId = body.professionalId as string;
    const bookingKey = `${bookingDate}|${slot}`;

    const { error } = await adminClient
      .from(TABLES.bookings)
      .insert({
        booking_date: bookingDate,
        slot,
        name,
        phone,
        service: encodeService(serviceId, professionalId),
      });

    if (error) {
      const isConflict = /duplicate|conflict/i.test(error.message || "");
      return jsonResponse({ conflict: isConflict, error: error.message }, isConflict ? 409 : 500);
    }

    await upsertBookingStatus(bookingKey, "aguardando");
    return jsonResponse({ ok: true, status: "aguardando", bookingKey });
  } catch (error) {
    return jsonResponse({ error: error.message || "Falha ao criar agendamento" }, 500);
  }
});
