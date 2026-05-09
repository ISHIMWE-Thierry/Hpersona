import { NextRequest, NextResponse } from 'next/server';
import { adminDb, isFirebaseAdminConfigured } from '@/lib/firebase-admin';
import { getPayment } from '@/lib/yookassa';

export const runtime = 'nodejs';

const PRO_DURATION_DAYS = 30;

interface WebhookEvent {
  event?: string;
  object?: {
    id?: string;
    status?: string;
    metadata?: Record<string, string>;
  };
}

/**
 * YooKassa webhook receiver.
 * YooKassa POSTs payment.succeeded / payment.canceled events here. We always
 * re-fetch the payment from YooKassa's API rather than trusting the body,
 * then upgrade the user to Pro for 30 days.
 */
export async function POST(req: NextRequest) {
  try {
    const event = (await req.json().catch(() => ({}))) as WebhookEvent;
    const paymentId = event.object?.id;
    const eventType = event.event || '';

    console.log(`[yookassa-webhook] ${eventType} ${paymentId}`);

    if (!paymentId) {
      return NextResponse.json({ ok: false, error: 'missing payment id' }, { status: 400 });
    }
    if (!isFirebaseAdminConfigured()) {
      return NextResponse.json({ ok: false, error: 'admin not configured' }, { status: 503 });
    }

    // Always re-verify with YooKassa.
    const payment = await getPayment(paymentId);
    const orderId = payment.metadata?.order_id;
    const uid = payment.metadata?.uid;

    if (!orderId || !uid) {
      console.warn(`[yookassa-webhook] missing metadata on ${paymentId}`);
      return NextResponse.json({ ok: true });
    }

    const db = adminDb();
    const orderRef = db.collection('humanizerOrders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      console.warn(`[yookassa-webhook] order ${orderId} not found`);
      return NextResponse.json({ ok: true });
    }
    const order = orderSnap.data() || {};

    const succeeded =
      eventType === 'payment.succeeded' || payment.status === 'succeeded';
    const cancelled =
      eventType === 'payment.canceled' || payment.status === 'canceled';

    if (succeeded) {
      if (order.status === 'active') {
        return NextResponse.json({ ok: true });
      }
      // Extend pro window from now (or from current proUntil if still in future).
      const usageRef = db.collection('humanizerUsage').doc(uid);
      const usageSnap = await usageRef.get();
      const currentProUntil =
        usageSnap.exists && typeof usageSnap.get('proUntil') === 'number'
          ? (usageSnap.get('proUntil') as number)
          : 0;
      const base = Math.max(currentProUntil, Date.now());
      const proUntil = base + PRO_DURATION_DAYS * 24 * 60 * 60 * 1000;

      await usageRef.set(
        {
          uid,
          proUntil,
          unlimited: false,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      await orderRef.update({
        status: 'active',
        yookassaStatus: 'succeeded',
        proUntil,
        activatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      console.log(`[yookassa-webhook] ✅ uid=${uid} pro until ${new Date(proUntil).toISOString()}`);
    } else if (cancelled) {
      await orderRef.update({
        status: 'cancelled',
        yookassaStatus: 'canceled',
        updatedAt: new Date().toISOString(),
      });
    } else {
      await orderRef.update({
        yookassaStatus: payment.status,
        updatedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[yookassa-webhook] error:', msg);
    // Always 200 so YooKassa doesn't retry forever.
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
