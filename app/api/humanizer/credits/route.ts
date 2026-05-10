import { NextResponse } from 'next/server';

const UD_API_KEY = process.env.UNDETECTABLE_API_KEY || '';
const UD_BASE = 'https://humanize.undetectable.ai';

export const runtime = 'nodejs';
export const maxDuration = 15;
// Don't let Next/edge cache this — credits change every humanize call.
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!UD_API_KEY) {
    return NextResponse.json(
      { error: 'UNDETECTABLE_API_KEY not configured on server.' },
      { status: 500 }
    );
  }
  // Hard 8s timeout — UD's check-user-credits is normally <500ms, anything
  // longer means the upstream is degraded and we'd rather show a stale
  // value than hang the page until the gateway gives up at 30s+.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetch(`${UD_BASE}/check-user-credits`, {
      method: 'GET',
      headers: { apikey: UD_API_KEY, accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    const data = await r.json().catch(() => ({}));
    return NextResponse.json(data, {
      status: r.status,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    const aborted =
      err instanceof Error &&
      (err.name === 'AbortError' || err.message.includes('aborted'));
    return NextResponse.json(
      {
        error: aborted
          ? 'Humanizer credits check timed out (upstream is slow).'
          : 'Failed to reach humanizer service',
        detail: String(err),
      },
      { status: aborted ? 504 : 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
