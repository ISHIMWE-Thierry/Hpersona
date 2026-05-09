import { NextResponse } from 'next/server';

const UD_API_KEY = process.env.UNDETECTABLE_API_KEY || '';
const UD_BASE = 'https://humanize.undetectable.ai';

export async function GET() {
  if (!UD_API_KEY) {
    return NextResponse.json(
      { error: 'UNDETECTABLE_API_KEY not configured on server.' },
      { status: 500 }
    );
  }
  try {
    const r = await fetch(`${UD_BASE}/check-user-credits`, {
      method: 'GET',
      headers: { apikey: UD_API_KEY, accept: 'application/json' },
      cache: 'no-store',
    });
    const data = await r.json().catch(() => ({}));
    return NextResponse.json(data, { status: r.status });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to reach humanizer service', detail: String(err) },
      { status: 502 }
    );
  }
}
