import { NextRequest, NextResponse } from 'next/server';
import { adminDb, isFirebaseAdminConfigured } from '@/lib/firebase-admin';
import { getPayment } from '@/lib/yookassa';

export const runtime = 'nodejs';

/**
 * Poll order status. Used by the page after the user returns from YooKassa
 * so we can show "Pro active" without waiting for the webhook.
 */
export async function GET(req: NextRequest) {
  try {
    const orderId = req.nextUrl.searchParams.get('orderId') || '';
    if (!orderId) {
      return NextResponse.json({ ok: false, error: 'orderId required' }, { status: 400 });
    }
    if (!isFirebaseAdminConfigured()) {
      return NextResponse.json({ ok: false, error: 'admin not configured' }, { status: 503 });
    }
    const db = adminDb();
    const ref = db.collection('humanizerOrders').doc(orderId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'order not found' }, { status: 404 });
    }
    const order = snap.data() || {};

    // If still pending and we have a YooKassa id, re-poll the gateway.
    if (order.status === 'pending_payment' && order.yookassaPaymentId) {
      try {
        const payment = await getPayment(order.yookassaPaymentId);
        if (payment.status === 'succeeded' && order.status !== 'active') {
          // Best effort: trigger same upgrade as webhook by writing usage doc.
          const PRO_DURATION_DAYS = 30;
          const uid = order.uid as string;
          if (uid) {
            const usageRef = db.collection('humanizerUsage').doc(uid);
            const usageSnap = await usageRef.get();
            const currentProUntil =
              usageSnap.exists && typeof usageSnap.get('proUntil') === 'number'
                ? (usageSnap.get('proUntil') as number)
                : 0;
            const base = Math.max(currentProUntil, Date.now());
            const proUntil = base + PRO_DURATION_DAYS * 24 * 60 * 60 * 1000;
            await usageRef.set(
              { uid, proUntil, updatedAt: new Date().toISOString() },
              { merge: true }
            );
            await ref.update({
              status: 'active',
              yookassaStatus: 'succeeded',
              proUntil,
              activatedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            return NextResponse.json({
              ok: true,
              data: { status: 'active', yookassaStatus: 'succeeded', proUntil },
            });
          }
        }
        return NextResponse.json({
          ok: true,
          data: { status: order.status, yookassaStatus: payment.status },
        });
      } catch {
        // ignore — fall through to stored status
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        status: order.status,
        yookassaStatus: order.yookassaStatus || null,
        proUntil: order.proUntil || null,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
