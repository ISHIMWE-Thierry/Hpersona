# YooKassa Pro Subscription Setup

Hpersona Pro = **100 ₽ / month** for unlimited humanization. Implemented via
[YooKassa](https://yookassa.ru/) — Russia's most popular payment gateway
(supports Visa, Mastercard, Mir, SBP, YooMoney).

## Flow

1. User clicks **Upgrade to Pro — 100₽** on `/humanizer`.
2. `POST /api/humanizer/payment/create` creates a `humanizerOrders/{id}` doc
   (status `pending_payment`) and a YooKassa payment, then returns a
   `confirmation_url`.
3. The browser is redirected to YooKassa's hosted payment page.
4. After payment, YooKassa POSTs to `POST /api/humanizer/payment/webhook`. The
   webhook re-fetches the payment from YooKassa's API (never trusts the body),
   then sets `humanizerUsage/{uid}.proUntil = now + 30 days` and marks the
   order `active`.
5. The user is redirected back to `/humanizer?payment=success`. The page polls
   `GET /api/humanizer/payment/status?orderId=...` until the order flips to
   `active`, then shows a green Pro banner.

## Required env vars

Add these to `.env.local` (and to Vercel project settings):

```bash
# YooKassa — get these from https://yookassa.ru/my (Settings → API)
YOOKASSA_SHOP_ID=123456
YOOKASSA_SECRET_KEY=test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
YOOKASSA_RETURN_URL=https://your-domain.com/humanizer?payment=success

# Firebase Admin (server-side Firestore writes)
# Generate at: Firebase Console → Project Settings → Service Accounts → Generate new private key
FIREBASE_ADMIN_PROJECT_ID=ikamba-1c669
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxxxx@ikamba-1c669.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
```

> Note the literal `\n` in the private key — Vercel preserves them and the
> server code calls `replace(/\\n/g, '\n')` to restore real line breaks.

## Webhook URL (configure in YooKassa)

In your YooKassa dashboard under **Integration → HTTP notifications**, add:

```
https://your-domain.com/api/humanizer/payment/webhook
```

Subscribe to events:
- `payment.succeeded`
- `payment.canceled`

## Firestore collections written

- `humanizerOrders/{orderId}` — `{ uid, plan, amount, currency, status, yookassaPaymentId, yookassaStatus, proUntil, createdAt }`
- `humanizerUsage/{uid}` — adds `proUntil: number` (ms epoch)

## Pro check

Client code uses the helper:

```ts
import { isProActive } from '@/lib/humanizer-usage';

if (isProActive(usage)) {
  // skip word-budget gating, skip consumeUsage
}
```
