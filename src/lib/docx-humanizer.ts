// Client-side DOCX humanizer. Preserves runs (and therefore fonts/sizes/styles)
// by replacing only the text nodes within paragraphs.
import JSZip from 'jszip';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export interface HumanizeOptions {
  readability: string;
  purpose: string;
  strength: string;
  model: string;
  // Target words per chunk sent to humanizer. The API requires >= 50 chars.
  targetWordsPerChunk: number;
}

export interface ProgressUpdate {
  phase: 'parsing' | 'chunking' | 'humanizing' | 'rebuilding' | 'done' | 'error';
  message: string;
  current?: number;
  total?: number;
  preview?: { original: string; humanized: string };
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

/** Extract paragraphs and their runs from document.xml */
function extractParagraphs(doc: Document): ParagraphChunk[] {
  const paragraphs: ParagraphChunk[] = [];
  const pNodes = Array.from(doc.getElementsByTagNameNS(W_NS, 'p'));
  pNodes.forEach((p, idx) => {
    const tNodes = Array.from(p.getElementsByTagNameNS(W_NS, 't'));
    const runs: RunRef[] = tNodes.map((t) => ({ tNode: t, text: t.textContent || '' }));
    const text = runs.map((r) => r.text).join('');
    paragraphs.push({ paragraphIndex: idx, runs, text });
  });
  return paragraphs;
}

/** Group consecutive paragraphs until reaching ~targetWords words per section. */
function buildSections(paragraphs: ParagraphChunk[], targetWords: number): SectionChunk[] {
  const sections: SectionChunk[] = [];
  let current: ParagraphChunk[] = [];
  let currentWords = 0;
  for (const p of paragraphs) {
    const w = countWords(p.text);
    // skip empty paragraphs but keep them in their own micro-section so they aren't sent to API
    if (w === 0) {
      if (current.length > 0) {
        const text = current.map((c) => c.text).join('\n');
        sections.push({ paragraphs: current, text, wordCount: currentWords });
        current = [];
        currentWords = 0;
      }
      sections.push({ paragraphs: [p], text: p.text, wordCount: 0 });
      continue;
    }
    current.push(p);
    currentWords += w;
    if (currentWords >= targetWords) {
      const text = current.map((c) => c.text).join('\n');
      sections.push({ paragraphs: current, text, wordCount: currentWords });
      current = [];
      currentWords = 0;
    }
  }
  if (current.length > 0) {
    const text = current.map((c) => c.text).join('\n');
    sections.push({ paragraphs: current, text, wordCount: currentWords });
  }
  return sections;
}

/** Distribute humanized text across paragraphs proportional to original char length. */
function distributeAcrossParagraphs(
  paragraphs: ParagraphChunk[],
  humanized: string
): string[] {
  // Prefer paragraph splits in the humanized text if they exist.
  const splitByNewline = humanized.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (splitByNewline.length === paragraphs.length) {
    return splitByNewline;
  }
  // Otherwise split by sentence proportion.
  const totalChars = paragraphs.reduce((s, p) => s + Math.max(1, p.text.length), 0);
  // Split humanized into sentences.
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

/** Distribute paragraph text across its runs proportionally to original lengths. */
function distributeAcrossRuns(runs: RunRef[], paragraphText: string) {
  if (runs.length === 0) return;
  if (runs.length === 1) {
    setRunText(runs[0].tNode, paragraphText);
    return;
  }
  const totalOrig = runs.reduce((s, r) => s + r.text.length, 0);
  if (totalOrig === 0) {
    // nothing to anchor — put it all in first run
    setRunText(runs[0].tNode, paragraphText);
    for (let i = 1; i < runs.length; i++) setRunText(runs[i].tNode, '');
    return;
  }
  const total = paragraphText.length;
  let consumed = 0;
  for (let i = 0; i < runs.length; i++) {
    const ratio = runs[i].text.length / totalOrig;
    let take: number;
    if (i === runs.length - 1) {
      take = total - consumed;
    } else {
      take = Math.round(total * ratio);
    }
    let slice = paragraphText.substr(consumed, take);
    // try to break on a space boundary unless last run
    if (i < runs.length - 1 && slice.length > 0 && consumed + take < total) {
      const nextChar = paragraphText.charAt(consumed + take);
      if (nextChar && !/\s/.test(nextChar) && !/\s$/.test(slice)) {
        const lastSpace = slice.lastIndexOf(' ');
        if (lastSpace > Math.floor(slice.length * 0.5)) {
          slice = slice.substring(0, lastSpace + 1);
          take = slice.length;
        }
      }
    }
    setRunText(runs[i].tNode, slice);
    consumed += take;
  }
}

function setRunText(tNode: Element, value: string) {
  // Preserve whitespace handling
  if (/^\s|\s$/.test(value)) {
    tNode.setAttribute('xml:space', 'preserve');
  }
  tNode.textContent = value;
}

async function humanizeText(
  text: string,
  options: HumanizeOptions,
  signal?: AbortSignal
): Promise<string> {
  // submit
  const submitRes = await fetch('/api/humanizer/submit', {
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
  const submitData = await submitRes.json();
  if (!submitRes.ok) {
    throw new Error(submitData?.error || `Humanizer submit failed (${submitRes.status})`);
  }
  const id: string = submitData.id;
  if (!id) throw new Error('Humanizer did not return a document id');

  // poll
  const start = Date.now();
  const TIMEOUT_MS = 5 * 60 * 1000;
  while (Date.now() - start < TIMEOUT_MS) {
    if (signal?.aborted) throw new Error('Aborted');
    await new Promise((r) => setTimeout(r, 5000));
    const docRes = await fetch('/api/humanizer/document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ id }),
    });
    const docData = await docRes.json();
    if (!docRes.ok) {
      throw new Error(docData?.error || `Document fetch failed (${docRes.status})`);
    }
    if (docData?.output && typeof docData.output === 'string' && docData.output.length > 0) {
      return docData.output as string;
    }
  }
  throw new Error('Timed out waiting for humanizer');
}

export async function humanizeDocxFile(
  file: File,
  options: HumanizeOptions,
  onProgress: (u: ProgressUpdate) => void,
  signal?: AbortSignal
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

  onProgress({ phase: 'chunking', message: 'Splitting into sections…' });
  const paragraphs = extractParagraphs(doc);
  const sections = buildSections(paragraphs, options.targetWordsPerChunk);
  const meaningful = sections.filter((s) => s.wordCount > 0 && s.text.trim().length >= 50);
  onProgress({
    phase: 'chunking',
    message: `Found ${paragraphs.length} paragraphs in ${sections.length} sections (${meaningful.length} to humanize).`,
    total: meaningful.length,
    current: 0,
  });

  let processed = 0;
  for (const section of sections) {
    if (signal?.aborted) throw new Error('Aborted');
    if (section.wordCount === 0 || section.text.trim().length < 50) {
      // too short to humanize; leave as-is
      continue;
    }
    processed += 1;
    onProgress({
      phase: 'humanizing',
      message: `Humanizing section ${processed} of ${meaningful.length}…`,
      current: processed,
      total: meaningful.length,
    });
    let humanized: string;
    try {
      humanized = await humanizeText(section.text, options, signal);
    } catch (err) {
      throw new Error(
        `Section ${processed} failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
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
      preview: {
        original: section.text.slice(0, 240),
        humanized: humanized.slice(0, 240),
      },
    });
  }

  onProgress({ phase: 'rebuilding', message: 'Rebuilding document…' });
  const serializer = new XMLSerializer();
  const newXml = serializer.serializeToString(doc);
  zip.file('word/document.xml', newXml);
  const outBlob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  const baseName = file.name.replace(/\.docx$/i, '');
  const outName = `${baseName}-humanized.docx`;
  onProgress({ phase: 'done', message: 'Ready to download.' });
  return { blob: outBlob, filename: outName };
}
