// Client-side DOCX humanizer. Preserves runs (and therefore fonts/sizes/styles)
// by replacing only the text nodes within paragraphs.
//
// Pipeline overview:
//   1. Parse word/document.xml.
//   2. Classify every paragraph as humanizable or pass-through. The following
//      are NEVER touched:
//        • paragraphs inside tables (<w:tbl>)
//        • paragraphs containing pictures / drawings (<w:drawing>)
//        • paragraphs containing math / equations (m:oMath, m:oMathPara)
//        • paragraphs with hyperlinks (TOC links, external links)
//        • paragraphs with field codes (<w:fldSimple>, <w:instrText> — TOC,
//          page refs, etc.)
//        • headings / titles / TOC entries (pStyle starts with "Heading",
//          "Title", "Subtitle", "TOC", "Caption", "Bibliography")
//   3. If the document language is not English, translate humanizable text
//      to English first via OpenRouter, run the humanizer, then translate
//      the humanized result back to the original language.
//   4. Distribute the humanized text back across the same <w:t> runs so
//      fonts, sizes, bold/italic, color, etc. are preserved exactly.
import JSZip from 'jszip';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const M_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';

/**
 * Sentinel inserted between paragraphs when sending a section to the humanizer
 * so we can re-split the humanized output back into the exact same paragraphs
 * (preserving headings, spacing, alignment, indentation, etc.).
 *
 * The pilcrow + repeated rare punctuation is unlikely to be reformatted by
 * any humanizer model. We strip it from the output if any survives.
 */
const PARAGRAPH_SENTINEL = '\n¶¶¶\n';

/**
 * Per-section retry policy. Big documents experience occasional 429/5xx and
 * network timeouts. We retry each failing section up to MAX_SECTION_RETRIES
 * times with exponential backoff. After that, the section is left as the
 * ORIGINAL text (formatting + words) and the run continues so the user still
 * gets a complete document for the rest of the doc.
 */
const MAX_SECTION_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 2500;

/**
 * Hard floor enforced by the humanizer service: payloads under 50 characters
 * are rejected. We don't impose any additional word-count minimum — every
 * text-only section the document analyzer found gets humanized. Sections
 * shorter than 50 chars are kept verbatim (they'd be rejected anyway).
 */
const MIN_HUMANIZE_CHARS = 50;

/**
 * AI-detection threshold (per Undetectable.AI docs):
 *   < 50 → definitely human   (skip humanization)
 *   50–60 → possibly AI       (humanize)
 *   > 60 → definitely AI      (humanize)
 */
const AI_DETECTION_THRESHOLD = 50;

/**
 * Recommend a `targetWordsPerChunk` value purely from paragraph data, without
 * having to chunk first. Used when the caller passes 0/undefined (auto mode)
 * so the document is analyzed and divided automatically based on its size.
 *
 * Sweet spot for undetectable.AI quality is 200–400 words/chunk: large
 * enough for the humanizer to keep cross-sentence context, small enough to
 * survive credit limits and recover quickly from transient failures.
 */
function recommendChunkSize(paragraphs: ParagraphChunk[]): number {
  let humanizableWords = 0;
  for (const p of paragraphs) {
    if (p.humanizable) humanizableWords += countWords(p.text);
  }
  if (humanizableWords < 1500) return 250;
  if (humanizableWords < 8000) return 300;
  if (humanizableWords < 25_000) return 350;
  return 400;
}

export interface HumanizeOptions {
  readability: string;
  purpose: string;
  strength: string;
  model: string;
  // Target words per chunk sent to humanizer. The API requires >= 50 chars.
  targetWordsPerChunk: number;
  /**
   * If true, run AI detection on every humanizable section in its original
   * language before translating/humanizing. Sections that score below
   * `AI_DETECTION_THRESHOLD` (definitely human) are kept verbatim. Saves
   * credits + preserves the user's own voice. Defaults to true.
   */
  skipHumanSections?: boolean;
}

export interface ProgressUpdate {
  phase:
    | 'parsing'
    | 'chunking'
    | 'analyzing'
    | 'detecting-ai'
    | 'detecting-language'
    | 'translating'
    | 'humanizing'
    | 'rebuilding'
    | 'done'
    | 'error';
  message: string;
  current?: number;
  total?: number;
  preview?: { original: string; humanized: string };
  /** Optional sub-progress 0-1 for indeterminate-feeling phases (e.g. zip rebuild). */
  subProgress?: number;
  /** True if this update represents a soft warning (e.g. retrying / skipped) rather than progress. */
  warning?: boolean;
  /** How many sections were skipped after exhausting retries. */
  skippedSections?: number;
  /** Detected source language (ISO 639-1). */
  language?: string;
  /** Pre-flight document analysis. Shown to the user before humanizing starts. */
  analysis?: DocumentAnalysis;
  /** AI detection score (0-100) for the current section, when applicable. */
  aiScore?: number;
}

/** Pre-flight analysis of the uploaded .docx — surfaced to the user as a recommendation. */
export interface DocumentAnalysis {
  totalParagraphs: number;
  totalSections: number;
  humanizableSections: number;
  totalWords: number;
  humanizableWords: number;
  skippedFormulas: number;
  skippedTables: number;
  skippedHeadings: number;
  skippedDrawings: number;
  skippedHyperlinks: number;
  skippedFields: number;
  /** Suggested words-per-chunk for best balance of speed vs. quality. */
  recommendedWordsPerChunk: number;
  /** Average words per section in the current chunking. */
  avgWordsPerSection: number;
  /** Largest single section (in words) — used to flag chunks that may exceed credits. */
  maxWordsPerSection: number;
  /** Free-form one-line recommendation shown to the user. */
  recommendation: string;
}

/**
 * Undetectable.AI bills both input and output tokens. Output ≈ input ± buffer.
 * 2.1× gives us a safety margin so we don't start jobs that 402 mid-run.
 */
export const CREDIT_SAFETY_MULTIPLIER = 2.1;

/**
 * Map raw HTTP / API errors to user-friendly messages.
 * The original message is preserved on `error.cause` for logging.
 */
export function friendlyError(status: number | undefined, raw: string): Error {
  let message = raw;
  switch (status) {
    case 401:
      message = 'Humanizer rejected the API key. Please contact support.';
      break;
    case 402:
      message = "We're out of humanizer credits. Please top up and try again.";
      break;
    case 403:
      message = 'This account is not allowed to use the humanizer service.';
      break;
    case 429:
      message = 'Too many humanizer requests right now. Please wait a moment and retry.';
      break;
    case 500:
    case 502:
    case 503:
      message = 'The humanizer service is temporarily unavailable. Please retry shortly.';
      break;
    default:
      if (raw && raw.toLowerCase().includes('insufficient')) {
        message = "We're out of humanizer credits. Please top up and try again.";
      }
  }
  const err = new Error(message);
  (err as Error & { cause?: string }).cause = raw;
  return err;
}

interface RunRef {
  // The <w:t> element whose text we will replace.
  tNode: Element;
  text: string;
}

interface ParagraphChunk {
  paragraphIndex: number;
  runs: RunRef[];
  text: string; // joined text
  /** False = pass through untouched (table cell, heading, TOC, math, drawing, …). */
  humanizable: boolean;
  /** Human-readable reason — surfaced in the live log. */
  skipReason?: string;
}

interface SectionChunk {
  paragraphs: ParagraphChunk[];
  text: string; // joined section text
  wordCount: number;
}

function countWords(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

const SKIP_STYLE_PREFIXES = [
  'heading',
  'title',
  'subtitle',
  'toc',
  'caption',
  'bibliography',
  'tableof',
];

/** Walk up the ancestor chain looking for a `<w:tbl>` element. */
function isInsideTable(p: Element): boolean {
  let n: Node | null = p.parentNode;
  while (n && n.nodeType === 1) {
    const el = n as Element;
    if (el.namespaceURI === W_NS && el.localName === 'tbl') return true;
    n = el.parentNode;
  }
  return false;
}

/** Read the paragraph style id from <w:pPr><w:pStyle w:val="…"/>. */
function paragraphStyleId(p: Element): string {
  const pPr = p.getElementsByTagNameNS(W_NS, 'pPr')[0];
  if (!pPr) return '';
  const pStyle = pPr.getElementsByTagNameNS(W_NS, 'pStyle')[0];
  if (!pStyle) return '';
  return (pStyle.getAttributeNS(W_NS, 'val') || pStyle.getAttribute('w:val') || '')
    .toString()
    .toLowerCase();
}

function classifyParagraph(p: Element): { humanizable: boolean; reason?: string } {
  if (isInsideTable(p)) return { humanizable: false, reason: 'table' };

  // Drawings / pictures / shapes
  if (p.getElementsByTagNameNS(W_NS, 'drawing').length > 0) {
    return { humanizable: false, reason: 'image/drawing' };
  }
  if (p.getElementsByTagNameNS(W_NS, 'pict').length > 0) {
    return { humanizable: false, reason: 'image/picture' };
  }
  if (p.getElementsByTagNameNS(W_NS, 'object').length > 0) {
    return { humanizable: false, reason: 'embedded-object' };
  }

  // Math / equations (OMML)
  if (
    p.getElementsByTagNameNS(M_NS, 'oMath').length > 0 ||
    p.getElementsByTagNameNS(M_NS, 'oMathPara').length > 0
  ) {
    return { humanizable: false, reason: 'formula/equation' };
  }

  // Hyperlinks (TOC links, external links, footnote refs)
  if (p.getElementsByTagNameNS(W_NS, 'hyperlink').length > 0) {
    return { humanizable: false, reason: 'hyperlink' };
  }

  // Field codes (TOC field, PAGE/REF, etc.)
  if (
    p.getElementsByTagNameNS(W_NS, 'fldSimple').length > 0 ||
    p.getElementsByTagNameNS(W_NS, 'instrText').length > 0
  ) {
    return { humanizable: false, reason: 'field/TOC' };
  }

  // Style-based skips: headings, titles, TOC entries, captions, bibliography
  const styleId = paragraphStyleId(p);
  if (styleId) {
    if (SKIP_STYLE_PREFIXES.some((pref) => styleId.startsWith(pref))) {
      return { humanizable: false, reason: `style:${styleId}` };
    }
  }

  // Text-based formula / equation detection. Word stores many formulas as
  // plain text (especially when copy-pasted from LaTeX, MathType, or
  // exported PDFs), so OMML detection above isn't enough. We look at the
  // raw paragraph text and bail out if it looks like an equation.
  const rawText = (p.textContent || '').trim();
  if (rawText && looksLikeFormula(rawText)) {
    return { humanizable: false, reason: 'formula/text-math' };
  }

  return { humanizable: true };
}

/**
 * Heuristic detector for paragraphs that *look like* a formula even though
 * they're stored as plain text. We deliberately err on the side of skipping
 * because mangling an equation in a thesis is far worse than leaving a
 * formula-like sentence un-humanized.
 *
 * Triggers (any one is enough):
 *   • Inline LaTeX delimiters: $...$, \(...\), \[...\]
 *   • LaTeX commands: \partial, \mu, \displaystyle, \mathcal, \Gamma, \nabla,
 *     \xi, \alpha, \frac, \sum, \int, \sqrt, \begin, \end, \cdot, etc.
 *   • Pseudo-LaTeX in braces: {\displaystyle ...}, {\mathcal ...}
 *   • Equation-numbering tail: text that ends with "(n.n)" or "(n)"
 *   • Math-symbol density: > 12% of non-space characters are math symbols
 *     (∂∇∑∏∫√≈≠≤≥±×÷⊗⊕∈∉∀∃Γξμνφψχωθλσπραβγδε…) or sub/superscripts
 *   • Mostly equation tokens: short text that is dominated by `=`, brackets,
 *     numbers, single-letter identifiers and operators (e.g. "ds²=Exp[...]")
 */
function looksLikeFormula(text: string): boolean {
  // 1. LaTeX delimiters
  if (/\$[^$\n]{2,}\$/.test(text)) return true;
  if (/\\\([^)]*\\\)/.test(text)) return true;
  if (/\\\[[^\]]*\\\]/.test(text)) return true;

  // 2. LaTeX commands (\word) — needs at least 2 distinct commands OR one
  // strong command to avoid false positives on the occasional backslash.
  const latexCmds = text.match(/\\[a-zA-Z]{2,}/g) || [];
  if (latexCmds.length >= 2) return true;
  const strongLatex =
    /\\(displaystyle|mathcal|mathbb|mathrm|frac|sum|int|sqrt|partial|nabla|begin|end|left|right|cdot|times|otimes|oplus|infty|alpha|beta|gamma|delta|theta|lambda|sigma|omega|mu|nu|xi|phi|psi|chi|rho|tau|epsilon|Gamma|Lambda|Sigma|Omega|Phi|Psi|Theta|Delta)\b/.test(
      text
    );
  if (strongLatex) return true;

  // 3. {\displaystyle ...}, {\mathcal ...} pseudo-LaTeX (Wikipedia-style)
  if (/\{\\[a-zA-Z]/.test(text)) return true;

  // 4. Math-symbol density. We look at alphanumeric+symbol characters only
  // (exclude whitespace) and check what fraction are math glyphs.
  const noSpace = text.replace(/\s+/g, '');
  if (noSpace.length >= 8) {
    const mathChars =
      noSpace.match(
        // Math operators, Greek letters, sub/superscripts, set theory, arrows
        /[∂∇∑∏∫√≈≠≤≥±×÷⊗⊕∈∉∀∃∅∞∝∼≡⊂⊃⊆⊇∪∩→←↔⇒⇐⇔αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ₀₁₂₃₄₅₆₇₈₉⁰¹²³⁴⁵⁶⁷⁸⁹]/gu
      ) || [];
    const ratio = mathChars.length / noSpace.length;
    if (ratio >= 0.12) return true;
  }

  // 5. Equation-numbering tail. A short paragraph that is essentially
  // "<expression> (5.9)" or "<expression> (3.1)".
  if (text.length < 400 && /\(\s*\d+(\.\d+)?\s*\)\s*$/.test(text)) {
    // Also require it to *look* like an expression — at least one '=' or
    // a math/Greek/sub-superscript glyph.
    if (
      /=/.test(text) ||
      /[∂∇∑∏∫√αβγδεζηθλμνξπρστφχψωΓΔΛΣΦΨΩ₀₁₂₃⁰¹²³]/u.test(text)
    ) {
      return true;
    }
  }

  // 6. Equation-token-dominated short lines: "ds²=Exp[Φ₁₁+(Φ₁₂+Φ₂₂)X₂](dX₁²−X₁²dX₂²)..."
  // — text under 600 chars where a high fraction of characters are operators,
  // brackets, digits, single-letter identifiers, or sub/superscripts.
  if (text.length < 600 && /=/.test(text)) {
    const opChars =
      noSpace.match(
        /[=+\-*/^()[\]{}|·×÷±∂∇∑∏∫√αβγδεζηθικλμνξπρστυφχψωΓΔΛΣΦΨΩ₀₁₂₃₄₅₆₇₈₉⁰¹²³⁴⁵⁶⁷⁸⁹]/gu
      ) || [];
    const digits = noSpace.match(/[0-9]/g) || [];
    const opRatio = (opChars.length + digits.length) / noSpace.length;
    if (opRatio >= 0.35) return true;
  }

  return false;
}

/**
 * Pre-flight analysis: count paragraphs by skip reason, total words, and
 * suggest a `targetWordsPerChunk` value. Larger chunks → fewer API calls and
 * better cross-paragraph coherence; smaller chunks → safer for credit usage
 * and recover faster on transient failures. We pick a sweet spot based on
 * total document size.
 */
function analyzeDocument(
  paragraphs: ParagraphChunk[],
  sections: SectionChunk[],
  currentTarget: number
): DocumentAnalysis {
  let totalWords = 0;
  let humanizableWords = 0;
  let skippedFormulas = 0;
  let skippedTables = 0;
  let skippedHeadings = 0;
  let skippedDrawings = 0;
  let skippedHyperlinks = 0;
  let skippedFields = 0;

  for (const p of paragraphs) {
    const w = countWords(p.text);
    totalWords += w;
    if (p.humanizable) {
      humanizableWords += w;
      continue;
    }
    const r = p.skipReason || '';
    if (r.startsWith('formula')) skippedFormulas += 1;
    else if (r === 'table') skippedTables += 1;
    else if (r.startsWith('style:') || r.startsWith('heading')) skippedHeadings += 1;
    else if (r.includes('image') || r.includes('drawing') || r.includes('object'))
      skippedDrawings += 1;
    else if (r === 'hyperlink') skippedHyperlinks += 1;
    else if (r.includes('field') || r.includes('TOC')) skippedFields += 1;
  }

  const meaningful = sections.filter(
    (s) => s.wordCount > 0 && s.text.trim().length >= 50
  );
  const avgWordsPerSection =
    meaningful.length > 0
      ? Math.round(
          meaningful.reduce((sum, s) => sum + s.wordCount, 0) / meaningful.length
        )
      : 0;
  const maxWordsPerSection = meaningful.reduce(
    (m, s) => (s.wordCount > m ? s.wordCount : m),
    0
  );

  // Recommendation curve. The undetectable.AI sweet spot for quality is
  // 200–350 words/chunk: large enough for context, small enough that the
  // model preserves meaning. We push toward bigger chunks for huge docs to
  // keep total API calls reasonable.
  let recommended: number;
  if (humanizableWords < 1500) recommended = 250;
  else if (humanizableWords < 8000) recommended = 300;
  else if (humanizableWords < 25_000) recommended = 350;
  else recommended = 400;

  const skippedTotal =
    skippedFormulas +
    skippedTables +
    skippedHeadings +
    skippedDrawings +
    skippedHyperlinks +
    skippedFields;

  const recommendation =
    `Document has ~${totalWords.toLocaleString()} words, ` +
    `${humanizableWords.toLocaleString()} humanizable across ${meaningful.length} sections. ` +
    `Skipped (preserved verbatim): ${skippedTotal} paragraph(s) — ` +
    `${skippedFormulas} formula, ${skippedTables} table, ${skippedHeadings} heading, ` +
    `${skippedDrawings} image, ${skippedHyperlinks} link, ${skippedFields} field. ` +
    (recommended === currentTarget
      ? `Current chunk size (${currentTarget} words) is optimal.`
      : `Recommended chunk size: ${recommended} words/section (currently ${currentTarget}).`);

  return {
    totalParagraphs: paragraphs.length,
    totalSections: sections.length,
    humanizableSections: meaningful.length,
    totalWords,
    humanizableWords,
    skippedFormulas,
    skippedTables,
    skippedHeadings,
    skippedDrawings,
    skippedHyperlinks,
    skippedFields,
    recommendedWordsPerChunk: recommended,
    avgWordsPerSection,
    maxWordsPerSection,
    recommendation,
  };
}

/**
 * After translating a humanized section back to the original language we
 * sometimes see English fragments leak through (the model occasionally keeps
 * an English clause intact). For non-Latin-script target languages this is
 * detectable: we measure the ratio of Latin letters in the result vs. the
 * original. If the leak is significant we count it; the caller can decide to
 * retry the translation with a stronger prompt.
 */
function latinLeakRatio(text: string): number {
  // Strip whitespace and punctuation. Compare Latin letters to total letters.
  const letters = text.match(/\p{L}/gu) || [];
  if (letters.length === 0) return 0;
  const latin = letters.filter((c) => /[A-Za-z]/.test(c)).length;
  return latin / letters.length;
}

/** Extract paragraphs and their runs from document.xml */
function extractParagraphs(doc: Document): ParagraphChunk[] {
  const paragraphs: ParagraphChunk[] = [];
  const pNodes = Array.from(doc.getElementsByTagNameNS(W_NS, 'p'));
  pNodes.forEach((p, idx) => {
    // Only collect <w:t> elements that are direct text of this paragraph
    // (not inside a hyperlink/field — those paragraphs are skipped wholesale
    // anyway, so this just makes the run list stable).
    const tNodes = Array.from(p.getElementsByTagNameNS(W_NS, 't'));
    const runs: RunRef[] = tNodes.map((t) => ({ tNode: t, text: t.textContent || '' }));
    const text = runs.map((r) => r.text).join('');
    const { humanizable, reason } = classifyParagraph(p);
    paragraphs.push({
      paragraphIndex: idx,
      runs,
      text,
      humanizable,
      skipReason: reason,
    });
  });
  return paragraphs;
}

/** Group consecutive paragraphs until reaching ~targetWords words per section.
 *
 * Paragraphs within a section are joined with `PARAGRAPH_SENTINEL` so the
 * humanized output can be re-split back to the original paragraph structure
 * (preserving headings, alignment, indentation, line spacing, etc.).
 */
function buildSections(paragraphs: ParagraphChunk[], targetWords: number): SectionChunk[] {
  const sections: SectionChunk[] = [];
  let current: ParagraphChunk[] = [];
  let currentWords = 0;
  const flush = () => {
    if (current.length > 0) {
      const text = current.map((c) => c.text).join(PARAGRAPH_SENTINEL);
      sections.push({ paragraphs: current, text, wordCount: currentWords });
      current = [];
      currentWords = 0;
    }
  };
  for (const p of paragraphs) {
    const w = countWords(p.text);
    // Non-humanizable paragraphs (tables, headings, TOC, math, drawings,
    // hyperlinks, field codes…) get their own pass-through section so they
    // are skipped by the humanize loop while their words remain in the doc.
    if (!p.humanizable || w === 0) {
      flush();
      sections.push({ paragraphs: [p], text: p.text, wordCount: 0 });
      continue;
    }
    current.push(p);
    currentWords += w;
    if (currentWords >= targetWords) {
      flush();
    }
  }
  flush();
  return sections;
}

/** Distribute humanized text across paragraphs proportional to original char length. */
function distributeAcrossParagraphs(
  paragraphs: ParagraphChunk[],
  humanized: string
): string[] {
  // 1) Sentinel-based split (most reliable). We injected `\n¶¶¶\n` between
  //    paragraphs in the prompt; if the humanizer kept it, alignment is exact.
  if (humanized.includes(PARAGRAPH_SENTINEL)) {
    const parts = humanized
      .split(PARAGRAPH_SENTINEL)
      .map((s) => s.trim());
    if (parts.length === paragraphs.length) {
      return parts;
    }
    // If the model accidentally dropped/added one, pad/truncate so we don't
    // shift content between unrelated paragraphs.
    if (parts.length > paragraphs.length) {
      const merged = parts.slice(0, paragraphs.length - 1);
      merged.push(parts.slice(paragraphs.length - 1).join(' '));
      return merged;
    }
    while (parts.length < paragraphs.length) parts.push('');
    return parts;
  }

  // 2) Plain blank-line split.
  const splitByNewline = humanized.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (splitByNewline.length === paragraphs.length) {
    return splitByNewline;
  }

  // 3) Fall back to sentence-proportion split.
  const totalChars = paragraphs.reduce((s, p) => s + Math.max(1, p.text.length), 0);
  const sentences = humanized.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [humanized];
  const out: string[] = [];
  let cursor = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const ratio = Math.max(1, paragraphs[i].text.length) / totalChars;
    if (i === paragraphs.length - 1) {
      out.push(sentences.slice(cursor).join('').trim());
    } else {
      const take = Math.max(1, Math.round(sentences.length * ratio));
      out.push(sentences.slice(cursor, cursor + take).join('').trim());
      cursor += take;
    }
  }
  return out;
}

/** Distribute paragraph text across its runs proportionally to original lengths.
 *
 * Each run carries its own `<w:rPr>` (font, size, bold, italic, color, etc.).
 * Runs are visited in order; we always cut on a whitespace boundary so the
 * formatting boundary lands between words instead of inside one. This is
 * critical for preserving the look of headings, emphasized phrases, etc.
 */
function distributeAcrossRuns(runs: RunRef[], paragraphText: string) {
  if (runs.length === 0) return;
  if (runs.length === 1) {
    setRunText(runs[0].tNode, paragraphText);
    return;
  }
  const totalOrig = runs.reduce((s, r) => s + r.text.length, 0);
  if (totalOrig === 0) {
    setRunText(runs[0].tNode, paragraphText);
    for (let i = 1; i < runs.length; i++) setRunText(runs[i].tNode, '');
    return;
  }

  const total = paragraphText.length;
  let consumed = 0;
  for (let i = 0; i < runs.length; i++) {
    const isLast = i === runs.length - 1;
    let take: number;
    if (isLast) {
      take = total - consumed;
    } else {
      const ratio = runs[i].text.length / totalOrig;
      take = Math.round(total * ratio);
    }

    let end = consumed + take;
    if (!isLast && end < total) {
      // Snap forward or backward to the nearest whitespace boundary so the
      // formatting cut never falls inside a word. Prefer the nearest space.
      const window = Math.max(8, Math.floor(take * 0.25));
      const fwd = paragraphText.indexOf(' ', end);
      const bwd = paragraphText.lastIndexOf(' ', end);
      const fwdDist = fwd === -1 ? Infinity : fwd - end;
      const bwdDist = bwd === -1 || bwd <= consumed ? Infinity : end - bwd;
      if (fwdDist <= bwdDist && fwdDist <= window) {
        end = fwd + 1; // include the space with the current run
      } else if (bwdDist < Infinity && bwdDist <= window) {
        end = bwd + 1;
      }
      // If neither boundary is within the window, fall back to the original
      // proportional cut (better than searching the whole string).
    }

    const slice = paragraphText.substring(consumed, end);
    setRunText(runs[i].tNode, slice);
    consumed = end;
  }
}

function setRunText(tNode: Element, value: string) {
  // Preserve whitespace handling
  if (/^\s|\s$/.test(value)) {
    tNode.setAttribute('xml:space', 'preserve');
  }
  tNode.textContent = value;
}

// ── Translation (OpenRouter) ──────────────────────────────────────────────────
//
// We round-trip non-English documents through English so the humanizer model
// can do its best work, then translate the humanized result back. The literal
// "¶¶¶" sentinel survives both translations because the API prompt instructs
// the model to keep it intact.

async function detectLanguage(sample: string, signal?: AbortSignal): Promise<string> {
  try {
    const res = await fetch('/api/humanizer/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ mode: 'detect', text: sample.slice(0, 1500) }),
    });
    if (!res.ok) return 'en';
    const data = (await res.json().catch(() => ({}))) as { language?: string };
    return (data?.language || 'en').toLowerCase().slice(0, 2);
  } catch {
    return 'en';
  }
}

// ── AI detection (Undetectable.AI xlm_ud_detector) ───────────────────────────
//
// Runs on the section's ORIGINAL-LANGUAGE text (Russian, English, etc.) so
// translation artefacts don't pollute the score. Returns a score 0-100 where
// higher = more likely AI. Returns null on any failure (caller should treat
// "unknown" as "humanize anyway" to be safe).

interface DetectQueryResult {
  status?: 'pending' | 'done' | 'failed';
  result?: number | null;
  error?: string;
  id?: string;
}

async function detectAiScore(
  text: string,
  signal?: AbortSignal
): Promise<number | null> {
  try {
    // Submit
    const submitRes = await fetch('/api/humanizer/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ mode: 'submit', text }),
    });
    if (!submitRes.ok) return null;
    const submit = (await submitRes.json().catch(() => ({}))) as { id?: string };
    const id = submit?.id;
    if (!id) return null;

    // Poll. Average detection takes 2-4s; we cap at ~30s.
    const maxAttempts = 20;
    for (let i = 0; i < maxAttempts; i += 1) {
      if (signal?.aborted) throw new Error('Aborted');
      // Backoff: 1s, 1.5s, 2s, then 2s steady.
      const wait = i < 2 ? 1000 : i < 4 ? 1500 : 2000;
      await new Promise((r) => setTimeout(r, wait));
      const queryRes = await fetch('/api/humanizer/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({ mode: 'query', id }),
      });
      if (!queryRes.ok) continue;
      const data = (await queryRes.json().catch(() => ({}))) as DetectQueryResult;
      if (data?.status === 'done' && typeof data.result === 'number') {
        return data.result;
      }
      if (data?.status === 'failed') return null;
    }
    return null;
  } catch (err) {
    if (err instanceof Error && err.message === 'Aborted') throw err;
    return null;
  }
}

async function translateText(
  text: string,
  from: string,
  to: string,
  signal?: AbortSignal,
  tier: 'standard' | 'high' = 'standard'
): Promise<string> {
  if (from === to) return text;
  // OpenRouter has a per-call context limit. Translate up to ~25k chars; if
  // the section is bigger (very rare with 300-word chunks), split on the
  // sentinel and translate each piece individually so nothing gets dropped.
  const HARD_LIMIT = 25_000;
  if (text.length <= HARD_LIMIT) {
    return translateOnce(text, from, to, signal, tier);
  }
  const parts = text.split(PARAGRAPH_SENTINEL);
  const out: string[] = [];
  for (const part of parts) {
    out.push(await translateOnce(part, from, to, signal, tier));
  }
  return out.join(PARAGRAPH_SENTINEL);
}

async function translateOnce(
  text: string,
  from: string,
  to: string,
  signal?: AbortSignal,
  tier: 'standard' | 'high' = 'standard'
): Promise<string> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (signal?.aborted) throw new Error('Aborted');
    try {
      const res = await fetch('/api/humanizer/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({ mode: 'translate', text, from, to, tier }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        text?: string;
        error?: string;
      };
      if (!res.ok) {
        // Fatal vs transient
        if ([429, 500, 502, 503, 504].includes(res.status)) {
          lastError = new Error(data?.error || `Translate failed (${res.status})`);
          await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, attempt)));
          continue;
        }
        throw new Error(data?.error || `Translate failed (${res.status})`);
      }
      const out = (data?.text || '').toString();
      if (!out.trim()) throw new Error('Translator returned empty text.');
      return out;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.message === 'Aborted') throw lastError;
      if (attempt === 3) break;
      await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, attempt)));
    }
  }
  throw lastError || new Error('Translation failed.');
}

async function humanizeText(
  text: string,
  options: HumanizeOptions,
  signal?: AbortSignal
): Promise<string> {
  let submitRes: Response | null = null;
  let submitData: { id?: string; error?: string } = {};
  for (let attempt = 0; attempt < 2; attempt += 1) {
    submitRes = await fetch('/api/humanizer/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        content: text,
        readability: options.readability,
        purpose: options.purpose,
        strength: options.strength,
        model: options.model,
      }),
    });
    submitData = await submitRes.json().catch(() => ({}));
    if (submitRes.ok) break;
    if (submitRes.status !== 429 || attempt === 1) {
      throw friendlyError(
        submitRes.status,
        submitData?.error || `Humanizer submit failed (${submitRes.status})`
      );
    }
    // exponential backoff before retry
    await new Promise((r) => setTimeout(r, 2000));
  }
  const id = submitData?.id;
  if (!id) throw new Error('Humanizer did not return a document id');

  // poll
  const start = Date.now();
  const TIMEOUT_MS = 5 * 60 * 1000;
  let consecutivePollErrors = 0;
  while (Date.now() - start < TIMEOUT_MS) {
    if (signal?.aborted) throw new Error('Aborted');
    await new Promise((r) => setTimeout(r, 5000));
    let docRes: Response;
    try {
      docRes = await fetch('/api/humanizer/document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({ id }),
      });
    } catch (err) {
      // Network blip — try again rather than killing the whole document.
      consecutivePollErrors += 1;
      if (consecutivePollErrors >= 6) {
        throw new Error(
          `Network error while polling humanizer: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
      continue;
    }
    const docData = await docRes.json().catch(() => ({}));
    if (!docRes.ok) {
      // Treat 502/503/504 as transient.
      if ([502, 503, 504].includes(docRes.status)) {
        consecutivePollErrors += 1;
        if (consecutivePollErrors >= 6) {
          throw friendlyError(
            docRes.status,
            docData?.error || `Document fetch failed (${docRes.status})`
          );
        }
        continue;
      }
      throw friendlyError(
        docRes.status,
        docData?.error || `Document fetch failed (${docRes.status})`
      );
    }
    consecutivePollErrors = 0;
    if (docData?.output && typeof docData.output === 'string' && docData.output.length > 0) {
      return docData.output as string;
    }
  }
  throw new Error('Timed out waiting for humanizer.');
}

export interface RunOptions {
  /**
   * Called before every section. Return `false` (or throw) to abort.
   * `nextEstimate` is the estimated credits the upcoming section will consume
   * (input + output, with the safety multiplier already applied).
   */
  beforeSection?: (info: {
    sectionIndex: number;
    totalSections: number;
    nextEstimate: number;
    consumedSoFar: number;
  }) => Promise<boolean> | boolean;
}

export async function humanizeDocxFile(
  file: File,
  options: HumanizeOptions,
  onProgress: (u: ProgressUpdate) => void,
  signal?: AbortSignal,
  runOptions: RunOptions = {}
): Promise<{ blob: Blob; filename: string }> {
  onProgress({ phase: 'parsing', message: 'Reading document…' });
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) throw new Error('Invalid .docx (missing word/document.xml)');
  const xmlString = await docXmlFile.async('string');
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Failed to parse document.xml');
  }

  onProgress({ phase: 'chunking', message: 'Analysing document & splitting into sections…' });
  const paragraphs = extractParagraphs(doc);
  // Auto-recommend chunk size from the document if caller passed 0/undefined.
  const requestedChunkSize = options.targetWordsPerChunk;
  const effectiveChunkSize =
    requestedChunkSize && requestedChunkSize > 0
      ? requestedChunkSize
      : recommendChunkSize(paragraphs);
  const sections = buildSections(paragraphs, effectiveChunkSize);
  // Every text-only section gets humanized. Only the 50-char API floor is
  // enforced (the humanizer rejects shorter payloads). Headings, tables,
  // pictures, formulas etc. are already flagged non-humanizable upstream
  // and pass through verbatim with zero word count.
  const meaningful = sections.filter(
    (s) => s.wordCount > 0 && s.text.trim().length >= MIN_HUMANIZE_CHARS
  );
  const tinySkipped = sections.filter(
    (s) => s.wordCount > 0 && s.text.trim().length < MIN_HUMANIZE_CHARS
  ).length;
  onProgress({
    phase: 'chunking',
    message:
      `Found ${paragraphs.length} paragraphs in ${sections.length} sections ` +
      `(target ≈${effectiveChunkSize} words/section, ${meaningful.length} to humanize` +
      (tinySkipped > 0 ? `, ${tinySkipped} too short` : '') +
      `).`,
    total: meaningful.length,
    current: 0,
  });

  // ── Pre-flight document analysis ─────────────────────────────────────────
  // Tell the user what we found, what we'll skip, and recommend an optimal
  // chunk size. This makes the run predictable and lets advanced users
  // re-tune `targetWordsPerChunk` for the next run.
  const analysis = analyzeDocument(paragraphs, sections, options.targetWordsPerChunk);
  onProgress({
    phase: 'analyzing',
    message: analysis.recommendation,
    total: meaningful.length,
    current: 0,
    analysis,
  });

  // ── Detect document language ─────────────────────────────────────────────
  // The humanizer model is tuned for English. For non-English documents we
  // round-trip: translate section → English → humanize → translate back.
  // Headings, tables, math, hyperlinks and other "delicate" paragraphs are
  // already flagged as non-humanizable above, so they are passed through
  // untouched (no translation either) and keep their original wording.
  let docLang = 'en';
  if (meaningful.length > 0) {
    onProgress({ phase: 'detecting-language', message: 'Detecting document language…' });
    const sample = meaningful
      .slice(0, 3)
      .map((s) => s.text.replace(/¶¶¶/g, ' '))
      .join(' ')
      .slice(0, 1500);
    docLang = await detectLanguage(sample, signal);
    onProgress({
      phase: 'detecting-language',
      message:
        docLang === 'en'
          ? 'Document is in English — humanizing directly.'
          : `Document language: ${docLang.toUpperCase()} — will translate ↔ English around humanization.`,
      language: docLang,
    });
  }

  let processed = 0;
  let consumedEstimate = 0;
  let skippedSections = 0;
  let humanWrittenSkips = 0;
  const skipHumanSections = options.skipHumanSections !== false; // default true
  for (const section of sections) {
    if (signal?.aborted) throw new Error('Aborted');
    if (section.wordCount === 0 || section.text.trim().length < MIN_HUMANIZE_CHARS) {
      // Empty / non-humanizable pass-through OR shorter than the API's 50-char
      // floor. Keep original — no API call, no credits consumed.
      continue;
    }
    processed += 1;
    const nextEstimate = Math.ceil(section.wordCount * CREDIT_SAFETY_MULTIPLIER);
    if (runOptions.beforeSection) {
      const cont = await runOptions.beforeSection({
        sectionIndex: processed,
        totalSections: meaningful.length,
        nextEstimate,
        consumedSoFar: consumedEstimate,
      });
      if (!cont) {
        throw new Error(
          "Stopped before consuming more credits than available. The document was not modified beyond what's already been humanized."
        );
      }
    }

    // ── AI detection pre-pass ────────────────────────────────────────────
    // Run on the ORIGINAL-LANGUAGE text (before any translation) so the
    // detector sees the user's actual writing, not a translation artefact.
    // If the score is below the threshold the section is "definitely human"
    // — we skip humanization and keep the original prose intact.
    if (skipHumanSections) {
      onProgress({
        phase: 'detecting-ai',
        message: `Checking section ${processed}/${meaningful.length} for AI…`,
        current: processed,
        total: meaningful.length,
      });
      const score = await detectAiScore(section.text, signal);
      if (score !== null && score < AI_DETECTION_THRESHOLD) {
        humanWrittenSkips += 1;
        onProgress({
          phase: 'detecting-ai',
          message:
            `Section ${processed}/${meaningful.length} scored ${score.toFixed(0)}/100 ` +
            `— already human-written, kept as original.`,
          current: processed,
          total: meaningful.length,
          aiScore: score,
        });
        continue; // skip humanization entirely
      }
      if (score !== null) {
        onProgress({
          phase: 'detecting-ai',
          message:
            `Section ${processed}/${meaningful.length} scored ${score.toFixed(0)}/100 — humanizing.`,
          current: processed,
          total: meaningful.length,
          aiScore: score,
        });
      }
    }

    onProgress({
      phase: 'humanizing',
      message: `Humanizing section ${processed} of ${meaningful.length}…`,
      current: processed,
      total: meaningful.length,
    });

    // Retry loop: transient 429 / 5xx / network failures should not abort
    // a 200-section document. After MAX_SECTION_RETRIES we leave the
    // section untouched and continue so the rest of the doc still gets
    // humanized + the user keeps their formatting/structure.
    let humanized: string | null = null;
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= MAX_SECTION_RETRIES; attempt += 1) {
      if (signal?.aborted) throw new Error('Aborted');
      try {
        let toHumanize = section.text;
        if (docLang !== 'en') {
          onProgress({
            phase: 'translating',
            message: `Translating section ${processed}/${meaningful.length} to English…`,
            current: processed,
            total: meaningful.length,
            language: docLang,
          });
          toHumanize = await translateText(section.text, docLang, 'en', signal);
        }
        // The humanizer service rejects content shorter than 50 chars. After
        // translation a short Russian/etc. section may collapse below that
        // threshold — in that case skip humanizing and keep the original
        // text untouched (no point in retrying or losing the section).
        if (toHumanize.trim().length < 50) {
          humanized = section.text;
          onProgress({
            phase: 'humanizing',
            message: `Section ${processed}/${meaningful.length} too short to humanize — kept as original.`,
            current: processed,
            total: meaningful.length,
          });
          break;
        }
        const humanizedEn = await humanizeText(toHumanize, options, signal);
        if (docLang !== 'en') {
          onProgress({
            phase: 'translating',
            message: `Translating humanized section ${processed}/${meaningful.length} back to ${docLang.toUpperCase()}…`,
            current: processed,
            total: meaningful.length,
            language: docLang,
          });
          let backTranslated = await translateText(
            humanizedEn,
            'en',
            docLang,
            signal,
            // Non-Latin targets get the bigger model up-front: Sonnet leaks
            // English into Russian/Arabic/CJK output more than Opus does.
            /^(ru|uk|bg|sr|mk|be|el|ar|he|fa|ur|zh|ja|ko|hi|th|ka|hy)$/.test(docLang)
              ? 'high'
              : 'standard'
          );

          // Language-leak guard. If we expected non-Latin output (Russian,
          // Greek, Arabic, Chinese, Japanese, Korean, Hindi…) but the result
          // contains a high ratio of Latin letters, the model leaked English.
          // Retry once via translateText (which itself escalates) and then
          // fall back to the original section text rather than ship a
          // half-English thesis paragraph.
          const nonLatinTargets = new Set([
            'ru', 'uk', 'bg', 'sr', 'mk', 'be',
            'el', 'ar', 'he', 'fa', 'ur',
            'zh', 'ja', 'ko', 'hi', 'th', 'ka', 'hy',
          ]);
          if (nonLatinTargets.has(docLang)) {
            const originalLeak = latinLeakRatio(section.text);
            const resultLeak = latinLeakRatio(backTranslated);
            // Allow a margin: original may legitimately have some Latin
            // (formulas, citations, names). Only flag if the result is
            // significantly more Latin-heavy than the source.
            if (resultLeak > originalLeak + 0.15 && resultLeak > 0.25) {
              onProgress({
                phase: 'translating',
                message: `Section ${processed}/${meaningful.length}: detected English leak (${Math.round(resultLeak * 100)}%), retrying back-translation…`,
                current: processed,
                total: meaningful.length,
                language: docLang,
                warning: true,
              });
              try {
                const retry = await translateText(humanizedEn, 'en', docLang, signal, 'high');
                if (latinLeakRatio(retry) <= originalLeak + 0.15) {
                  backTranslated = retry;
                } else {
                  // Still leaking — keep the original text for this section
                  // (formatting preserved, words unchanged).
                  onProgress({
                    phase: 'translating',
                    message: `Section ${processed}/${meaningful.length}: back-translation still leaking English — kept original text.`,
                    current: processed,
                    total: meaningful.length,
                    language: docLang,
                    warning: true,
                  });
                  backTranslated = section.text;
                }
              } catch {
                backTranslated = section.text;
              }
            }
          }
          humanized = backTranslated;
        } else {
          humanized = humanizedEn;
        }
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (lastError.message === 'Aborted') throw lastError;
        // Content-too-short is not retryable — keep original and move on.
        if (/at least 50 characters|content must be at least/i.test(lastError.message)) {
          humanized = section.text;
          onProgress({
            phase: 'humanizing',
            message: `Section ${processed}/${meaningful.length} too short to humanize — kept as original.`,
            current: processed,
            total: meaningful.length,
          });
          break;
        }
        if (attempt === MAX_SECTION_RETRIES) break;
        // Hard-fail on credit / auth issues — no amount of retrying fixes them.
        const cause = (lastError as Error & { cause?: string }).cause || '';
        const fatal =
          /insufficient|not allowed|api key|forbidden|401|403|402/i.test(
            (lastError.message || '') + ' ' + cause
          );
        if (fatal) break;
        const backoff = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        onProgress({
          phase: 'humanizing',
          message: `Section ${processed} failed (${lastError.message}). Retrying in ${Math.round(
            backoff / 1000
          )}s… (attempt ${attempt + 2}/${MAX_SECTION_RETRIES + 1})`,
          current: processed,
          total: meaningful.length,
          warning: true,
        });
        await new Promise((r) => setTimeout(r, backoff));
      }
    }

    if (humanized === null) {
      // Exhausted retries — surface a warning and skip this section so the
      // rest of the document still completes. Original text stays in place.
      skippedSections += 1;
      const cause = lastError && (lastError as Error & { cause?: string }).cause;
      const fatal =
        cause &&
        /insufficient|not allowed|api key|forbidden|401|403|402/i.test(
          (lastError?.message || '') + ' ' + cause
        );
      if (fatal && lastError) {
        // No point continuing if we'll just re-fail every remaining section.
        throw lastError;
      }
      onProgress({
        phase: 'humanizing',
        message: `Section ${processed} skipped after ${MAX_SECTION_RETRIES + 1} attempts: ${
          lastError?.message || 'unknown error'
        }. Continuing with the rest of the document.`,
        current: processed,
        total: meaningful.length,
        warning: true,
        skippedSections,
      });
      continue;
    }

    consumedEstimate += nextEstimate;
    // Strip any straggler sentinels from the model output before distributing.
    const cleaned = humanized.replace(/¶¶¶/g, '').replace(/\n{3,}/g, '\n\n');
    const perParagraph = distributeAcrossParagraphs(section.paragraphs, humanized);
    section.paragraphs.forEach((p, i) => {
      const txt = perParagraph[i] ?? '';
      distributeAcrossRuns(p.runs, txt);
    });
    onProgress({
      phase: 'humanizing',
      message: `Section ${processed}/${meaningful.length} done.`,
      current: processed,
      total: meaningful.length,
      skippedSections,
      preview: {
        original: section.text.replace(/¶¶¶/g, '').slice(0, 240),
        humanized: cleaned.slice(0, 240),
      },
    });
  }

  onProgress({ phase: 'rebuilding', message: 'Rebuilding document…', subProgress: 0 });
  const serializer = new XMLSerializer();
  const newXml = serializer.serializeToString(doc);
  zip.file('word/document.xml', newXml);
  const outBlob = await zip.generateAsync(
    {
      type: 'blob',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    (meta) => {
      onProgress({
        phase: 'rebuilding',
        message: `Rebuilding document… ${Math.round(meta.percent)}%`,
        subProgress: Math.min(1, meta.percent / 100),
      });
    }
  );

  const baseName = file.name.replace(/\.docx$/i, '');
  const outName = `${baseName}-humanized.docx`;
  const parts: string[] = ['Ready to download.'];
  if (humanWrittenSkips > 0) {
    parts.push(
      `${humanWrittenSkips} section(s) were already human-written and were preserved as-is.`
    );
  }
  if (skippedSections > 0) {
    parts.push(
      `${skippedSections} section(s) couldn't be humanized after retries and were left as the original text.`
    );
  }
  onProgress({
    phase: 'done',
    message: parts.join(' '),
    skippedSections,
  });
  return { blob: outBlob, filename: outName };
}

export interface DocxAnalysis {
  totalWords: number;
  /** Words actually sent to the humanizer as input. */
  estimatedInputWords: number;
  /** Estimated credits charged (input + output, with safety buffer). */
  billableWords: number;
  paragraphs: number;
  sections: number;
  billableSections: number;
  /** Auto-recommended chunk size based on document length. */
  recommendedWordsPerChunk: number;
  /** Effective chunk size used for the section split (caller's value or auto). */
  effectiveWordsPerChunk: number;
  /** Pure-text paragraphs (no tables, pictures, formulas, headings, math, links). */
  pureTextParagraphs: number;
  /** Words contained in those pure-text paragraphs. */
  pureTextWords: number;
  /** Paragraphs that will be passed through verbatim (non-humanizable). */
  preservedParagraphs: number;
}

/**
 * Inspect a .docx and report how many words would actually be sent to the
 * humanizer (i.e. what would be billed against your Undetectable.AI credits).
 * Sections under 50 chars are skipped by the humanizer flow and not counted.
 *
 * Pass `targetWordsPerChunk = 0` (or omit) for auto-recommended chunking.
 */
export async function analyzeDocxFile(
  file: File,
  targetWordsPerChunk: number = 0
): Promise<DocxAnalysis> {
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) throw new Error('Invalid .docx (missing word/document.xml)');
  const xmlString = await docXmlFile.async('string');
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Failed to parse document.xml');
  }
  const paragraphs = extractParagraphs(doc);
  const recommendedWordsPerChunk = recommendChunkSize(paragraphs);
  const effectiveWordsPerChunk =
    targetWordsPerChunk && targetWordsPerChunk > 0
      ? targetWordsPerChunk
      : recommendedWordsPerChunk;
  const sections = buildSections(paragraphs, effectiveWordsPerChunk);
  let totalWords = 0;
  let estimatedInputWords = 0;
  let billableSections = 0;
  let pureTextParagraphs = 0;
  let pureTextWords = 0;
  let preservedParagraphs = 0;
  for (const p of paragraphs) {
    const w = countWords(p.text);
    totalWords += w;
    if (p.humanizable) {
      pureTextParagraphs += 1;
      pureTextWords += w;
    } else if (p.text.trim().length > 0) {
      preservedParagraphs += 1;
    }
  }
  for (const s of sections) {
    if (s.wordCount > 0 && s.text.trim().length >= MIN_HUMANIZE_CHARS) {
      estimatedInputWords += s.wordCount;
      billableSections += 1;
    }
  }
  return {
    totalWords,
    estimatedInputWords,
    billableWords: Math.ceil(estimatedInputWords * CREDIT_SAFETY_MULTIPLIER),
    paragraphs: paragraphs.length,
    sections: sections.length,
    billableSections,
    recommendedWordsPerChunk,
    effectiveWordsPerChunk,
    pureTextParagraphs,
    pureTextWords,
    preservedParagraphs,
  };
}
