import { analyzeProofText, decodeDataUrl, storagePathFor } from "../_shared/analysis.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { adminClient, PAYMENT_PROOFS_BUCKET, TABLES, upsertBookingStatus } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const bookingKey = body.bookingKey as string;
    const bookingDate = body.bookingDate as string;
    const slot = body.slot as string;
    const customerName = body.customerName as string;
    const customerPhone = body.customerPhone as string;
    const serviceId = body.serviceId as string;
    const professionalId = body.professionalId as string;
    const expectedAmount = body.expectedAmount as number | null;
    const proofText = String(body.proofText || "");
    const fileName = String(body.fileName || "comprovante");
    const mimeType = String(body.mimeType || "");
    const fileDataUrl = String(body.fileDataUrl || "");

    const analysis = analyzeProofText(proofText, expectedAmount);
    const decoded = decodeDataUrl(fileDataUrl);
    const storagePath = storagePathFor(fileName);

    const { error: uploadError } = await adminClient
      .storage
      .from(PAYMENT_PROOFS_BUCKET)
      .upload(storagePath, decoded.bytes, {
        contentType: mimeType || decoded.mimeType,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data: publicData } = adminClient
      .storage
      .from(PAYMENT_PROOFS_BUCKET)
      .getPublicUrl(storagePath);

    const record = {
      id: `proof-${bookingKey}`,
      booking_key: bookingKey,
      booking_date: bookingDate,
      slot,
      customer_name: customerName || "",
      customer_phone: customerPhone || "",
      service_id: serviceId || "",
      professional_id: professionalId || "",
      file_name: fileName,
      mime_type: mimeType || decoded.mimeType,
      public_url: publicData.publicUrl,
      storage_path: storagePath,
      proof_text: proofText,
      analysis,
    };

    const { error: proofError } = await adminClient
      .from(TABLES.paymentProofs)
      .upsert(record, { onConflict: "booking_key" });

    if (proofError) throw proofError;

    const nextStatus = analysis.decision === "approved" ? "confirmado" : "aguardando";
    await upsertBookingStatus(bookingKey, nextStatus);

    return jsonResponse({
      ok: true,
      status: nextStatus,
      proof: {
        id: record.id,
        bookingKey,
        date: bookingDate,
        slot,
        customerName,
        customerPhone,
        serviceId,
        professionalId,
        fileName,
        mimeType: record.mime_type,
        publicUrl: record.public_url,
        proofText,
        analysis,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return jsonResponse({ error: error.message || "Falha ao enviar comprovante" }, 500);
  }
});
