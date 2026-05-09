import { NextRequest, NextResponse } from 'next/server';

const UD_API_KEY = process.env.UNDETECTABLE_API_KEY || '';
const UD_BASE = 'https://humanize.undetectable.ai';

export async function POST(req: NextRequest) {
  if (!UD_API_KEY) {
    return NextResponse.json(
      { error: 'UNDETECTABLE_API_KEY not configured on server.' },
      { status: 500 }
    );
  }

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: 'Missing document id' }, { status: 400 });
  }

  try {
    const r = await fetch(`${UD_BASE}/document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: UD_API_KEY,
      },
      body: JSON.stringify({ id: body.id }),
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
