import { NextRequest, NextResponse } from 'next/server';
import { adminDb, isFirebaseAdminConfigured } from '@/lib/firebase-admin';
import { notifyUserRequestDecision } from '@/lib/email-service';

export const runtime = 'nodejs';

/**
 * Notifies the requester of a credit-request decision.
 * Called from the admin client after `decideRequest` succeeds.
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
    const decision = d.status === 'approved' ? 'approved' : 'denied';
    if (decision !== 'approved' && decision !== 'denied') {
      return NextResponse.json({ ok: true, skipped: true });
    }

    // If approved, fetch their current usage doc so we can describe the new limit.
    let newLimit: number | undefined;
    let unlimited = false;
    if (decision === 'approved' && d.uid) {
      const usageSnap = await db.collection('humanizerUsage').doc(d.uid as string).get();
      if (usageSnap.exists) {
        unlimited = !!usageSnap.get('unlimited');
        const lim = usageSnap.get('limit');
        if (typeof lim === 'number') newLimit = lim;
      }
    }

    await notifyUserRequestDecision({
      email: (d.email as string) || '',
      displayName: d.displayName as string | undefined,
      decision,
      newLimit,
      unlimited,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[notify-decision] error:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
