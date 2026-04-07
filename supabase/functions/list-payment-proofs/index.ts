import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, TABLES } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { data, error } = await adminClient
      .from(TABLES.paymentProofs)
      .select("id, booking_key, booking_date, slot, customer_name, customer_phone, service_id, professional_id, file_name, mime_type, public_url, proof_text, analysis, created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const items = (data || []).map((row) => ({
      id: row.id,
      bookingKey: row.booking_key,
      date: row.booking_date,
      slot: row.slot,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      serviceId: row.service_id,
      professionalId: row.professional_id,
      fileName: row.file_name,
      mimeType: row.mime_type,
      publicUrl: row.public_url,
      proofText: row.proof_text,
      analysis: row.analysis,
      createdAt: row.created_at,
    }));

    return jsonResponse({ items });
  } catch (error) {
    return jsonResponse({ error: error.message || "Falha ao listar comprovantes" }, 500);
  }
});
