# Backend Origami

Backend Node simples para intermediar:

- criacao de agendamentos em analise
- upload de comprovantes para o Supabase Storage
- validacao server-side do texto do comprovante
- atualizacao de status no `admin_state`

## Como usar

1. Copie `backend/.env.example` para `backend/.env`
2. Preencha:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_BUCKET`
3. Rode o SQL de:
   - `supabase-bookings.sql`
   - `supabase-admin-panel.sql`
   - `supabase-payment-proofs.sql`
4. Inicie o backend:

```powershell
cd backend
npm start
```

5. No `index.html`, preencha `CONFIG.backendUrl` com algo como:

```js
backendUrl: 'http://localhost:8787'
```

## Rotas

- `GET /health`
- `POST /api/bookings`
- `POST /api/payment-proofs`
- `GET /api/payment-proofs`
- `POST /api/webhooks/pix`

## Observacao

Esse backend já remove a `service_role` do navegador, mas a validacao bancaria ainda depende do texto informado ou de um webhook do provedor PIX. Para validacao bancaria forte, conecte `POST /api/webhooks/pix` ao PSP/banco usado pela barbearia.
