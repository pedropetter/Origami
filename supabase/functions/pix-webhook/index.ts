import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { PIX_WEBHOOK_SECRET, upsertBookingStatus } from "../_shared/supabase.ts";

function digitsOnly(value: string | number | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const secret = req.headers.get("x-webhook-secret") || "";
    if (!PIX_WEBHOOK_SECRET || secret !== PIX_WEBHOOK_SECRET) {
      return jsonResponse({ error: "Webhook nao autorizado" }, 401);
    }

    const body = await req.json();
    const bookingKey = String(body.bookingKey || "");
    const destinationPixKey = digitsOnly(body.destinationPixKey || body.chavePix || "");

    if (!bookingKey) return jsonResponse({ error: "bookingKey obrigatorio" }, 400);
    if (destinationPixKey !== digitsOnly("63993051851")) {
      return jsonResponse({ error: "Chave PIX de destino nao confere com a barbearia" }, 400);
    }

    await upsertBookingStatus(bookingKey, "confirmado");
    return jsonResponse({ ok: true, status: "confirmado" });
  } catch (error) {
    return jsonResponse({ error: error.message || "Falha no webhook PIX" }, 500);
  }
});
