import { NextRequest, NextResponse } from 'next/server';
import { adminDb, isFirebaseAdminConfigured } from '@/lib/firebase-admin';
import { createPayment, isYooKassaConfigured } from '@/lib/yookassa';

export const runtime = 'nodejs';

interface CreateBody {
  uid?: string;
  email?: string;
  plan?: 'monthly_pro';
}

const PRICE_RUB = 100;

export async function POST(req: NextRequest) {
  try {
    if (!isYooKassaConfigured()) {
      return NextResponse.json(
        { ok: false, error: 'Online payments are not configured.' },
        { status: 503 }
      );
    }
    if (!isFirebaseAdminConfigured()) {
      return NextResponse.json(
        { ok: false, error: 'Server-side Firestore is not configured.' },
        { status: 503 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as CreateBody;
    const uid = (body.uid || '').trim();
    const email = (body.email || '').trim();
    const plan = body.plan || 'monthly_pro';
    if (!uid) {
      return NextResponse.json({ ok: false, error: 'uid required' }, { status: 400 });
    }

    const db = adminDb();

    // Persist pending order so the webhook can find it.
    const orderRef = db.collection('humanizerOrders').doc();
    const orderId = orderRef.id;
    await orderRef.set({
      uid,
      email,
      plan,
      amount: PRICE_RUB,
      currency: 'RUB',
      status: 'pending_payment',
      createdAt: new Date().toISOString(),
    });

    const payment = await createPayment({
      amount: PRICE_RUB,
      currency: 'RUB',
      description: 'Hpersona Pro — Monthly subscription',
      orderId,
      uid,
      plan,
      userEmail: email,
    });

    await orderRef.update({
      yookassaPaymentId: payment.id,
      yookassaStatus: payment.status,
      updatedAt: new Date().toISOString(),
    });

    const url = payment.confirmation?.confirmation_url;
    if (!url) {
      return NextResponse.json(
        { ok: false, error: 'YooKassa did not return a confirmation URL.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: { orderId, paymentId: payment.id, confirmationUrl: url, amount: PRICE_RUB },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[payment/create] error:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
