// Server-side YooKassa client — adapted from IkambaVPN.
// API docs: https://yookassa.ru/developers/api
//
// Flow:
//   1. POST /api/humanizer/payment/create  → creates a YooKassa payment, returns confirmation_url
//   2. Browser redirects to confirmation_url, user pays
//   3. YooKassa POSTs to /api/humanizer/payment/webhook
//   4. Webhook re-fetches payment via API → upgrades the user to Pro

import { randomUUID } from 'crypto';

const SHOP_ID = process.env.YOOKASSA_SHOP_ID || '';
const SECRET_KEY = process.env.YOOKASSA_SECRET_KEY || '';
const API_BASE = 'https://api.yookassa.ru/v3';

export const RETURN_URL =
  process.env.YOOKASSA_RETURN_URL || 'https://hpersona.vercel.app/humanizer?payment=success';

export interface YooKassaAmount {
  value: string;
  currency: string;
}

export interface YooKassaPayment {
  id: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';
  amount: YooKassaAmount;
  description?: string;
  confirmation?: { type: string; confirmation_url?: string };
  metadata?: Record<string, string>;
  paid: boolean;
  created_at: string;
}

export interface CreatePaymentParams {
  amount: number;
  currency?: string;
  description: string;
  orderId: string;
  userEmail?: string;
  uid: string;
  plan: string;
}

function authHeader(): string {
  return 'Basic ' + Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString('base64');
}

export function isYooKassaConfigured(): boolean {
  return !!(SHOP_ID && SECRET_KEY);
}

export async function createPayment(p: CreatePaymentParams): Promise<YooKassaPayment> {
  if (!isYooKassaConfigured()) {
    throw new Error('YooKassa not configured (missing YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY)');
  }

  const body = {
    amount: { value: p.amount.toFixed(2), currency: p.currency || 'RUB' },
    confirmation: { type: 'redirect', return_url: RETURN_URL },
    capture: true,
    description: p.description,
    metadata: {
      order_id: p.orderId,
      uid: p.uid,
      plan: p.plan,
      user_email: p.userEmail || '',
    },
    receipt: p.userEmail
      ? {
          customer: { email: p.userEmail },
          items: [
            {
              description: p.description,
              quantity: '1',
              amount: { value: p.amount.toFixed(2), currency: p.currency || 'RUB' },
              vat_code: 1,
            },
          ],
        }
      : undefined,
  };

  const res = await fetch(`${API_BASE}/payments`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Idempotence-Key': randomUUID(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YooKassa ${res.status}: ${text}`);
  }
  return (await res.json()) as YooKassaPayment;
}

export async function getPayment(paymentId: string): Promise<YooKassaPayment> {
  if (!isYooKassaConfigured()) throw new Error('YooKassa not configured');
  const res = await fetch(`${API_BASE}/payments/${paymentId}`, {
    headers: { Authorization: authHeader() },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YooKassa ${res.status}: ${text}`);
  }
  return (await res.json()) as YooKassaPayment;
}
