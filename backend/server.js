const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

loadEnv(path.join(__dirname, '.env'));

const CONFIG = {
  port: Number(process.env.PORT || 8787),
  supabaseUrl: String(process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
  serviceRoleKey: String(process.env.SUPABASE_SERVICE_ROLE_KEY || ''),
  bucket: String(process.env.SUPABASE_BUCKET || 'payment-proofs'),
  allowedOrigin: process.env.ALLOWED_ORIGIN || '*',
  pixKey: '63993051851',
  bookingsTable: 'bookings',
  adminStateTable: 'admin_state',
  paymentProofsTable: 'payment_proofs',
  adminStateId: 'main'
};

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  });
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': CONFIG.allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  res.end(JSON.stringify(payload));
}

function assertConfig() {
  if (!CONFIG.supabaseUrl || !CONFIG.serviceRoleKey) {
    throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no backend/.env');
  }
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: CONFIG.serviceRoleKey,
    Authorization: `Bearer ${CONFIG.serviceRoleKey}`,
    ...extra
  };
}

async function supabaseRequest(resourcePath, options = {}) {
  assertConfig();
  const response = await fetch(`${CONFIG.supabaseUrl}${resourcePath}`, {
    method: options.method || 'GET',
    headers: {
      ...supabaseHeaders(options.headers || {})
    },
    body: options.body
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  return { ok: response.ok, status: response.status, data };
}

async function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 15 * 1024 * 1024) {
        reject(new Error('Payload muito grande'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function encodeService(serviceId, professionalId) {
  return JSON.stringify({
    serviceId: serviceId || '',
    professionalId: professionalId || 'sem-preferencia'
  });
}

function analyzeProofText(rawText, expectedAmount) {
  const normalized = normalizeText(rawText);
  const compactDigits = digitsOnly(rawText);
  const expectedDigits = digitsOnly(expectedAmount != null ? Number(expectedAmount).toFixed(2) : '');
  const pixKeyDigits = digitsOnly(CONFIG.pixKey);
  const hasPixWord = /(pix|comprovante|transferencia|transferencia enviada|pagamento)/.test(normalized);
  const hasBankWord = /(banco|nubank|caixa|bradesco|itau|inter|santander|sicredi|mercado pago|pagbank|transacao|endtoendid|autenticacao)/.test(normalized);
  const hasPaidWord = /(concluido|concluida|aprovado|aprovada|realizado|efetuado|sucesso|pago)/.test(normalized);
  const hasTargetPixKey = compactDigits.includes(pixKeyDigits);
  const hasRecipientHint = normalized.includes('barbearia origami') || normalized.includes('origami');
  const hasExpectedAmount = expectedDigits ? compactDigits.includes(expectedDigits) : false;
  let decision = 'pending';
  if (hasTargetPixKey && hasPixWord && hasPaidWord && (hasBankWord || hasRecipientHint)) decision = 'approved';
  if (!hasTargetPixKey && rawText && rawText.trim()) decision = 'rejected';
  return {
    decision,
    hasPixWord,
    hasBankWord,
    hasPaidWord,
    hasTargetPixKey,
    hasRecipientHint,
    hasExpectedAmount,
    checkedAt: new Date().toISOString()
  };
}

async function readAdminState() {
  const result = await supabaseRequest(`/rest/v1/${CONFIG.adminStateTable}?id=eq.${encodeURIComponent(CONFIG.adminStateId)}&select=id,booking_statuses`, {
    headers: { 'Content-Type': 'application/json' }
  });
  if (!result.ok) throw new Error(`Falha ao ler admin_state: ${result.status}`);
  return Array.isArray(result.data) && result.data.length ? result.data[0] : { id: CONFIG.adminStateId, booking_statuses: {} };
}

async function writeBookingStatus(bookingKey, status) {
  const current = await readAdminState();
  const statuses = current.booking_statuses && typeof current.booking_statuses === 'object' ? current.booking_statuses : {};
  statuses[bookingKey] = status;
  const payload = [{ id: CONFIG.adminStateId, booking_statuses: statuses }];
  const result = await supabaseRequest(`/rest/v1/${CONFIG.adminStateTable}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(payload)
  });
  if (!result.ok) throw new Error(`Falha ao atualizar status no admin_state: ${result.status}`);
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Arquivo em formato inválido');
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64')
  };
}

async function uploadToStorage(fileName, mimeType, dataUrl) {
  const parsed = parseDataUrl(dataUrl);
  const extension = path.extname(fileName || '') || (mimeType === 'application/pdf' ? '.pdf' : '.bin');
  const storagePath = `bookings/${Date.now()}-${crypto.randomUUID()}${extension}`;
  const result = await supabaseRequest(`/storage/v1/object/${CONFIG.bucket}/${storagePath}`, {
    method: 'POST',
    headers: {
      'Content-Type': mimeType || parsed.mimeType || 'application/octet-stream',
      'x-upsert': 'true'
    },
    body: parsed.buffer
  });
  if (!result.ok) throw new Error(`Falha ao enviar arquivo para o storage: ${result.status}`);
  return {
    path: storagePath,
    publicUrl: `${CONFIG.supabaseUrl}/storage/v1/object/public/${CONFIG.bucket}/${storagePath}`
  };
}

async function handleCreateBooking(req, res) {
  const body = await readJson(req);
  const bookingKey = `${body.bookingDate}|${body.slot}`;
  const payload = [{
    booking_date: body.bookingDate,
    slot: body.slot,
    name: body.name,
    phone: body.phone,
    service: encodeService(body.serviceId, body.professionalId),
    created_at: new Date().toISOString()
  }];
  const result = await supabaseRequest(`/rest/v1/${CONFIG.bookingsTable}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(payload)
  });
  if (!result.ok) {
    const conflict = result.status === 409 || /duplicate|conflict/i.test(JSON.stringify(result.data || ''));
    return json(res, conflict ? 409 : 500, { conflict, error: result.data || 'Falha ao criar agendamento' });
  }
  await writeBookingStatus(bookingKey, 'aguardando');
  return json(res, 200, { ok: true, status: 'aguardando', bookingKey });
}

async function handleCreatePaymentProof(req, res) {
  const body = await readJson(req);
  const bookingKey = body.bookingKey || `${body.bookingDate}|${body.slot}`;
  const analysis = analyzeProofText(body.proofText || '', body.expectedAmount);
  const upload = await uploadToStorage(body.fileName, body.mimeType, body.fileDataUrl);
  const record = {
    id: `proof-${bookingKey}`,
    booking_key: bookingKey,
    booking_date: body.bookingDate,
    slot: body.slot,
    customer_name: body.customerName || '',
    customer_phone: body.customerPhone || '',
    service_id: body.serviceId || '',
    professional_id: body.professionalId || '',
    file_name: body.fileName || 'comprovante',
    mime_type: body.mimeType || '',
    public_url: upload.publicUrl,
    storage_path: upload.path,
    proof_text: body.proofText || '',
    analysis: analysis,
    created_at: new Date().toISOString()
  };
  const result = await supabaseRequest(`/rest/v1/${CONFIG.paymentProofsTable}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify([record])
  });
  if (!result.ok) throw new Error(`Falha ao gravar comprovante: ${result.status}`);
  const nextStatus = analysis.decision === 'approved' ? 'confirmado' : 'aguardando';
  await writeBookingStatus(bookingKey, nextStatus);
  return json(res, 200, {
    ok: true,
    status: nextStatus,
    proof: {
      id: record.id,
      bookingKey: bookingKey,
      date: record.booking_date,
      slot: record.slot,
      customerName: record.customer_name,
      customerPhone: record.customer_phone,
      serviceId: record.service_id,
      professionalId: record.professional_id,
      fileName: record.file_name,
      mimeType: record.mime_type,
      publicUrl: record.public_url,
      proofText: record.proof_text,
      analysis: record.analysis,
      createdAt: record.created_at
    }
  });
}

async function handleListPaymentProofs(_req, res) {
  const result = await supabaseRequest(`/rest/v1/${CONFIG.paymentProofsTable}?select=id,booking_key,booking_date,slot,customer_name,customer_phone,service_id,professional_id,file_name,mime_type,public_url,proof_text,analysis,created_at&order=created_at.desc`, {
    headers: { 'Content-Type': 'application/json' }
  });
  if (!result.ok) throw new Error(`Falha ao ler comprovantes: ${result.status}`);
  const items = Array.isArray(result.data) ? result.data.map((row) => ({
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
    createdAt: row.created_at
  })) : [];
  return json(res, 200, { items });
}

async function handleWebhook(req, res) {
  const body = await readJson(req);
  const destinationKey = digitsOnly(body.destinationPixKey || body.chavePix || '');
  const bookingKey = body.bookingKey || '';
  if (!bookingKey) return json(res, 400, { error: 'bookingKey é obrigatório' });
  if (!destinationKey || destinationKey !== digitsOnly(CONFIG.pixKey)) {
    return json(res, 400, { error: 'Chave PIX de destino não confere com a barbearia' });
  }
  await writeBookingStatus(bookingKey, 'confirmado');
  return json(res, 200, { ok: true, status: 'confirmado' });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': CONFIG.allowedOrigin,
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    });
    return res.end();
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/bookings') {
      return await handleCreateBooking(req, res);
    }
    if (req.method === 'POST' && url.pathname === '/api/payment-proofs') {
      return await handleCreatePaymentProof(req, res);
    }
    if (req.method === 'GET' && url.pathname === '/api/payment-proofs') {
      return await handleListPaymentProofs(req, res);
    }
    if (req.method === 'POST' && url.pathname === '/api/webhooks/pix') {
      return await handleWebhook(req, res);
    }
    return json(res, 404, { error: 'Rota não encontrada' });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: error.message || 'Erro interno' });
  }
});

server.listen(CONFIG.port, () => {
  console.log(`Origami backend ativo em http://localhost:${CONFIG.port}`);
});
