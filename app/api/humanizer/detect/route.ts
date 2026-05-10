import { NextRequest, NextResponse } from 'next/server';

/**
 * AI-detection endpoint backed by Undetectable.AI's xlm_ud_detector
 * (multilingual). Used by the docx-humanizer pipeline as a pre-pass: if a
 * section's original-language text scores < 50 ("definitely human") we skip
 * humanization entirely and keep the user's own writing.
 *
 * Two modes:
 *   POST { mode: 'submit', text }  → { id }
 *   POST { mode: 'query',  id }    → { status: 'pending'|'done'|'failed', result?: number }
 *
 * Server-side polling is intentionally avoided — the docx-humanizer issues
 * its own short polls so the UI stays responsive and we don't block a
 * serverless function for 30+ seconds.
 *
 * Threshold convention (per Undetectable.AI docs):
 *   result < 50  → definitely human
 *   50–60        → possibly AI
 *   > 60         → definitely AI
 */

export const runtime = 'nodejs';
export const maxDuration = 30;

const UD_API_KEY = process.env.UNDETECTABLE_API_KEY || '';
const UD_BASE = 'https://ai-detect.undetectable.ai';

interface Body {
  mode?: 'submit' | 'query';
  text?: string;
  id?: string;
  model?: string;
}

export async function POST(req: NextRequest) {
  if (!UD_API_KEY) {
    return NextResponse.json(
      { error: 'UNDETECTABLE_API_KEY not configured on server.' },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  try {
    if (body.mode === 'query') {
      if (!body.id) {
        return NextResponse.json({ error: 'Missing id.' }, { status: 400 });
      }
      const r = await fetch(`${UD_BASE}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ id: body.id }),
      });
      const data = await r.json().catch(() => ({}));
      return NextResponse.json(data, { status: r.status });
    }

    // mode === 'submit' (default)
    const text = (body.text || '').toString();
    if (!text.trim()) {
      return NextResponse.json({ error: 'Missing text.' }, { status: 400 });
    }
    // Detector caps input at 30,000 words.
    const wordCount = text.trim().split(/\s+/).length;
    if (wordCount > 30_000) {
      return NextResponse.json(
        { error: 'Text too long for a single detection call (>30k words).' },
        { status: 413 }
      );
    }

    const r = await fetch(`${UD_BASE}/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        text,
        key: UD_API_KEY,
        // xlm_ud_detector is the multilingual model — works on Russian,
        // Arabic, CJK, etc. as well as English.
        model: body.model || 'xlm_ud_detector',
        retry_count: 0,
      }),
    });
    const data = await r.json().catch(() => ({}));
    return NextResponse.json(data, { status: r.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
