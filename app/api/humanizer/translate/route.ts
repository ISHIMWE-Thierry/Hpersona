import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Translate / language-detect endpoint used by the humanizer pipeline.
 *
 * Pipeline:
 *   non-EN docx → translate(EN) → undetectable.AI humanize → translate(orig)
 *
 * Body shapes:
 *   { mode: 'detect', text: string }
 *     → { language: 'en' | 'ru' | 'fr' | ... ISO 639-1 }
 *
 *   { mode: 'translate', text, from: 'auto'|<code>, to: <code> }
 *     → { text }
 *
 * Hard rules sent to the model:
 *   • Translate every word — no summarising, no editing.
 *   • Preserve the literal token "¶¶¶" (paragraph sentinel) exactly where it
 *     appears so the client can re-split paragraphs after the round-trip.
 *   • Preserve numbers, dates, formulas, code blocks, names, and citations
 *     verbatim.
 *   • Output ONLY the translation — no commentary, no quotes, no labels.
 */

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://ikambaai.com',
    'X-Title': 'Hpersona Translator',
  },
});

// Two-tier model selection:
//   • standard: Claude Sonnet 4.5 — fast, cheap, excellent for the EN
//     direction of the round-trip and for short / simple sections.
//   • high: Claude Opus 4.1 — slower and pricier, but markedly better for
//     non-Latin target languages (Russian / Arabic / CJK) where Sonnet can
//     leak English fragments. Used for back-translation and for any section
//     flagged as complex by the caller.
// Both are overridable via env.
const TRANSLATION_MODEL_STANDARD =
  process.env.HPERSONA_TRANSLATION_MODEL || 'anthropic/claude-sonnet-4.5';
const TRANSLATION_MODEL_HIGH =
  process.env.HPERSONA_TRANSLATION_MODEL_HIGH || 'anthropic/claude-opus-4.1';

interface Body {
  mode?: 'detect' | 'translate';
  text?: string;
  from?: string;
  to?: string;
  /** 'high' uses the bigger model; defaults to 'standard'. */
  tier?: 'standard' | 'high';
}

const LANG_NAMES: Record<string, string> = {
  en: 'English',
  ru: 'Russian',
  fr: 'French',
  es: 'Spanish',
  de: 'German',
  pt: 'Portuguese',
  it: 'Italian',
  nl: 'Dutch',
  pl: 'Polish',
  uk: 'Ukrainian',
  tr: 'Turkish',
  ar: 'Arabic',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  hi: 'Hindi',
  rw: 'Kinyarwanda',
  sw: 'Swahili',
};

function languageName(code: string): string {
  const lc = code.toLowerCase().slice(0, 2);
  return LANG_NAMES[lc] || code;
}

export async function POST(req: NextRequest) {
  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: 'OpenRouter not configured (OPENROUTER_API_KEY missing).' },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const text = (body.text || '').toString();
  if (!text.trim()) {
    return NextResponse.json({ error: 'Missing text.' }, { status: 400 });
  }
  // Hard cap to keep one round-trip under the OpenRouter context window.
  if (text.length > 30_000) {
    return NextResponse.json(
      { error: 'Text too long for a single translate call (>30k chars).' },
      { status: 413 }
    );
  }

  try {
    // Detect mode is short and cheap — always use the standard model.
    if (body.mode === 'detect') {
      const sample = text.slice(0, 1500);
      const resp = await openai.chat.completions.create({
        model: TRANSLATION_MODEL_STANDARD,
        temperature: 0,
        max_tokens: 8,
        messages: [
          {
            role: 'system',
            content:
              'You are a language identifier. Reply with only the ISO 639-1 two-letter code (lowercase) of the dominant language in the user message. No punctuation, no quotes, no extra text.',
          },
          { role: 'user', content: sample },
        ],
      });
      const raw = resp.choices?.[0]?.message?.content?.trim().toLowerCase() || 'en';
      const code = (raw.match(/[a-z]{2}/) || ['en'])[0];
      return NextResponse.json({ language: code });
    }

    // mode === 'translate' (default)
    const to = (body.to || 'en').toLowerCase().slice(0, 5);
    const fromRaw = (body.from || 'auto').toLowerCase().slice(0, 5);
    if (to === fromRaw && fromRaw !== 'auto') {
      // No-op translation request.
      return NextResponse.json({ text });
    }

    const fromLabel =
      fromRaw === 'auto' ? 'the source language (auto-detect)' : languageName(fromRaw);
    const toLabel = languageName(to);

    // Script enforcement for non-Latin targets. The most common failure
    // mode of EN→non-Latin translation is the model echoing the English
    // source unchanged or partially. Spell out the required script and
    // forbid Latin output explicitly so the model can't shortcut.
    const SCRIPTS: Record<string, string> = {
      ru: 'Cyrillic',
      uk: 'Cyrillic',
      bg: 'Cyrillic',
      sr: 'Cyrillic',
      mk: 'Cyrillic',
      be: 'Cyrillic',
      el: 'Greek',
      ar: 'Arabic',
      he: 'Hebrew',
      fa: 'Arabic (Perso-Arabic)',
      ur: 'Arabic (Perso-Arabic)',
      zh: 'Chinese (Han)',
      ja: 'Japanese (Hiragana / Katakana / Kanji)',
      ko: 'Korean (Hangul)',
      hi: 'Devanagari',
      th: 'Thai',
      ka: 'Georgian',
      hy: 'Armenian',
    };
    const targetScript = SCRIPTS[to];

    const system = [
      `You are a professional academic / technical document translator from ${fromLabel} to ${toLabel}.`,
      'Translate the user text faithfully, literally and in fluent, grammatically correct prose.',
      'Match the register of the source (academic, legal, technical, casual) exactly.',
      'Do NOT summarize, paraphrase, edit, omit, reorder, merge, split, or add anything.',
      ...(targetScript
        ? [
            `MANDATORY SCRIPT: the entire translation MUST be written in the ${targetScript} script (${toLabel}).`,
            `Do NOT leave any source-language sentences, clauses, or phrases untranslated. Every running-text word must appear in ${toLabel}.`,
            'The ONLY tokens allowed to remain in their original Latin form are: proper nouns that have no canonical local form, ISO codes, programming identifiers, URLs, file paths, math/physics variables, formulas, and numerical citations (e.g. "[12]").',
            `If the source text already happens to be in ${toLabel}, return it verbatim. If it is in another language, translate every word into ${toLabel}. Never echo the source unchanged when the languages differ.`,
          ]
        : []),
      'CRITICAL FORMATTING RULES — these are mandatory and non-negotiable:',
      '• Preserve the literal token "¶¶¶" EXACTLY where it appears (paragraph boundary marker). Same count, same positions. Never delete, move, or merge "¶¶¶".',
      '• Preserve all numbers, dates, percentages, units, equations, variables, citations, references, URLs, file paths, and proper nouns verbatim — character for character.',
      '• Preserve LaTeX / math expressions ($...$, \\(...\\), \\[...\\]), code, formulas, chemical formulas, and physics notation verbatim.',
      '• Preserve list markers, bullet points, numbering schemes (1., 1.1, a), i.), section numbers, and inline punctuation 1:1.',
      '• Preserve sentence count and paragraph order 1:1. One source sentence → one target sentence.',
      '• Use natural, idiomatic target-language grammar. No machine-translation artefacts. No awkward word order.',
      '• Output ONLY the translation. No quotes, no labels, no preface, no commentary, no notes, no explanations.',
    ].join('\n');

    const resp = await openai.chat.completions.create({
      model: body.tier === 'high' ? TRANSLATION_MODEL_HIGH : TRANSLATION_MODEL_STANDARD,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: text },
      ],
    });

    const out = resp.choices?.[0]?.message?.content || '';
    if (!out.trim()) {
      return NextResponse.json(
        { error: 'Translation came back empty.' },
        { status: 502 }
      );
    }
    return NextResponse.json({ text: out });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // OpenRouter (and Anthropic via OpenRouter) returns rich error bodies
    // on the `error` object — surface them so we can see WHY the upstream
    // 403/402/429 happened (out of credits? key disabled? model access?).
    type OpenRouterErr = {
      status?: number;
      code?: number | string;
      error?: { message?: string; code?: number | string; type?: string; metadata?: unknown };
      response?: { data?: unknown; status?: number };
      message?: string;
    };
    const e = err as OpenRouterErr;
    const upstreamStatus =
      e?.status ?? e?.response?.status ?? Number(e?.error?.code) ?? null;
    const upstreamMsg = e?.error?.message ?? e?.message ?? msg;
    const upstreamMeta = e?.error?.metadata ?? e?.response?.data ?? null;
    console.error('[translate] upstream error', {
      status: upstreamStatus,
      message: upstreamMsg,
      meta: upstreamMeta,
    });
    const statusMatch = msg.match(/\b(401|402|403|429|5\d\d)\b/);
    const status =
      (typeof upstreamStatus === 'number' && upstreamStatus) ||
      (statusMatch ? Number(statusMatch[1]) : 500);
    // Hint the client whether retrying makes sense. Auth/quota/permission
    // errors WILL repeat on retry → mark fatal so the docx-humanizer can
    // abort the run instead of looping per section.
    const fatal = status === 401 || status === 402 || status === 403;
    return NextResponse.json(
      {
        error: upstreamMsg,
        status,
        fatal,
        meta: upstreamMeta,
      },
      { status }
    );
  }
}
