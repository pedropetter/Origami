const PIX_KEY = "63993051851";

function digitsOnly(value: string | number | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function analyzeProofText(rawText: string, expectedAmount?: number | null) {
  const normalized = normalizeText(rawText);
  const compactDigits = digitsOnly(rawText);
  const expectedDigits = expectedAmount != null ? digitsOnly(Number(expectedAmount).toFixed(2)) : "";
  const pixKeyDigits = digitsOnly(PIX_KEY);
  const hasPixWord = /(pix|comprovante|transferencia|transferencia enviada|pagamento)/.test(normalized);
  const hasBankWord = /(banco|nubank|caixa|bradesco|itau|inter|santander|sicredi|mercado pago|pagbank|transacao|endtoendid|autenticacao)/.test(normalized);
  const hasPaidWord = /(concluido|concluida|aprovado|aprovada|realizado|efetuado|sucesso|pago)/.test(normalized);
  const hasTargetPixKey = compactDigits.includes(pixKeyDigits);
  const hasRecipientHint = normalized.includes("barbearia origami") || normalized.includes("origami");
  const hasExpectedAmount = expectedDigits ? compactDigits.includes(expectedDigits) : false;

  let decision = "pending";
  if (hasTargetPixKey && hasPixWord && hasPaidWord && (hasBankWord || hasRecipientHint)) {
    decision = "approved";
  }
  if (!hasTargetPixKey && rawText.trim()) {
    decision = "rejected";
  }

  return {
    decision,
    hasPixWord,
    hasBankWord,
    hasPaidWord,
    hasTargetPixKey,
    hasRecipientHint,
    hasExpectedAmount,
    checkedAt: new Date().toISOString(),
  };
}

export function encodeService(serviceId: string, professionalId: string) {
  return JSON.stringify({
    serviceId: serviceId || "",
    professionalId: professionalId || "sem-preferencia",
  });
}

export function decodeDataUrl(dataUrl: string) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Arquivo em formato invalido");
  const mimeType = match[1];
  const binary = atob(match[2]);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return { mimeType, bytes };
}

export function storagePathFor(fileName: string) {
  const safeName = (fileName || "comprovante").replace(/[^a-zA-Z0-9._-]/g, "-");
  return `bookings/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
}
