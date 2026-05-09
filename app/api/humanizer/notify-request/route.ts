import { NextRequest, NextResponse } from 'next/server';
import { adminDb, isFirebaseAdminConfigured } from '@/lib/firebase-admin';
import { notifyAdminsCreditRequest } from '@/lib/email-service';

export const runtime = 'nodejs';

/**
 * Notifies admins of a new humanizer credit request.
 * Called from the client after `createCreditRequest` succeeds.
 * Body: { requestId: string }
 */
export async function POST(req: NextRequest) {
  try {
    if (!isFirebaseAdminConfigured()) {
      return NextResponse.json({ ok: false, error: 'admin not configured' }, { status: 503 });
    }
    const { requestId } = (await req.json().catch(() => ({}))) as { requestId?: string };
    if (!requestId) {
      return NextResponse.json({ ok: false, error: 'missing requestId' }, { status: 400 });
    }
    const db = adminDb();
    const snap = await db.collection('humanizerRequests').doc(requestId).get();
    if (!snap.exists) {
      return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
    }
    const d = snap.data() || {};
    await notifyAdminsCreditRequest({
      uid: (d.uid as string) || '',
      email: (d.email as string) || '',
      displayName: d.displayName as string | undefined,
      message: (d.message as string) || '',
      requestedLimit:
        typeof d.requestedLimit === 'number' ? (d.requestedLimit as number) : null,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[notify-request] error:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
