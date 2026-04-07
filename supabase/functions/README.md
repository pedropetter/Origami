# Supabase Edge Functions

Functions criadas:

- `create-booking`
- `upload-payment-proof`
- `list-payment-proofs`
- `pix-webhook`

## Secrets necessarios

Configure no projeto Supabase:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PAYMENT_PROOFS_BUCKET=payment-proofs`
- `PIX_WEBHOOK_SECRET=defina-um-segredo-forte`

## Deploy

```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase secrets set SUPABASE_URL=https://SEU-PROJETO.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=SUA_SERVICE_ROLE_KEY
supabase secrets set PAYMENT_PROOFS_BUCKET=payment-proofs
supabase secrets set PIX_WEBHOOK_SECRET=seu-segredo-forte
supabase functions deploy create-booking
supabase functions deploy upload-payment-proof
supabase functions deploy list-payment-proofs
supabase functions deploy pix-webhook --no-verify-jwt
```

## O que cada uma faz

- `create-booking`: cria o agendamento como `aguardando`
- `upload-payment-proof`: salva o arquivo no Storage, analisa o texto do comprovante e auto-confirma apenas quando a análise passar
- `list-payment-proofs`: devolve a biblioteca de comprovantes para o painel admin
- `pix-webhook`: ponto de entrada para confirmação real de PSP/banco
