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

  let body: {
    content?: string;
    readability?: string;
    purpose?: string;
    strength?: string;
    model?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.content || body.content.trim().length < 50) {
    return NextResponse.json(
      { error: 'Content must be at least 50 characters.' },
      { status: 400 }
    );
  }

  const payload = {
    content: body.content,
    readability: body.readability || 'University',
    purpose: body.purpose || 'General Writing',
    strength: body.strength || 'More Human',
    model: body.model || 'v11',
  };

  try {
    const r = await fetch(`${UD_BASE}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: UD_API_KEY,
      },
      body: JSON.stringify(payload),
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
