'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Upload,
  FileText,
  Sparkles,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  XCircle,
  StopCircle,
} from 'lucide-react';
import {
  humanizeDocxFile,
  analyzeDocxFile,
  CREDIT_SAFETY_MULTIPLIER,
  type ProgressUpdate,
  type HumanizeOptions,
  type DocxAnalysis,
} from '@/lib/docx-humanizer';

type Phase = ProgressUpdate['phase'] | 'idle';

interface LogEntry {
  ts: number;
  message: string;
  phase: ProgressUpdate['phase'];
  preview?: { original: string; humanized: string };
}

const READABILITY = ['High School', 'University', 'Doctorate', 'Journalist', 'Marketing'];
const PURPOSE = [
  'General Writing',
  'Essay',
  'Article',
  'Marketing Material',
  'Story',
  'Cover Letter',
  'Report',
  'Business Material',
  'Legal Material',
];
const STRENGTH = ['Quality', 'Balanced', 'More Human'];
const MODELS = [
  { value: 'v11', label: 'v11 — Best for English' },
  { value: 'v11sr', label: 'v11sr — Slowest, strongest' },
  { value: 'v2', label: 'v2 — Multilingual' },
];

export default function HumanizerPage() {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [analyzing, setAnalyzing] = useState(false);
  const [rebuildPct, setRebuildPct] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>('humanized.docx');
  const [credits, setCredits] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<DocxAnalysis | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [readability, setReadability] = useState('University');
  const [purpose, setPurpose] = useState('Essay');
  const [strength, setStrength] = useState('More Human');
  const [model, setModel] = useState('v11');
  const [chunkWords, setChunkWords] = useState(300);

  const insufficientCredits =
    !!analysis && typeof credits === 'number' && analysis.billableWords > credits;
  const isBusy = phase !== 'idle' && phase !== 'done' && phase !== 'error';

  const checkCredits = useCallback(async (): Promise<number | null> => {
    try {
      const r = await fetch('/api/humanizer/credits');
      const d = await r.json();
      if (!r.ok) return null;
      const value = typeof d.credits === 'number' ? d.credits : null;
      setCredits(value);
      return value;
    } catch {
      return null;
    }
  }, []);

  const onSelectFile = useCallback((f: File | null) => {
    if (!f) return;
    if (!/\.docx$/i.test(f.name)) {
      setError('Please upload a .docx file (Word document).');
      return;
    }
    setError(null);
    setDownloadUrl(null);
    setLogs([]);
    setFile(f);
    setAnalysis(null);
    setPhase('idle');
  }, []);

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    if (isBusy) return;
    const f = e.dataTransfer.files?.[0];
    if (f) onSelectFile(f);
  };

  // Auto-analyze on file/chunkWords change. Uses its own `analyzing` flag so
  // it never collides with the run-time `phase` machine.
  useEffect(() => {
    if (!file || isBusy) return;
    let cancelled = false;
    setAnalyzing(true);
    analyzeDocxFile(file, chunkWords)
      .then((report) => {
        if (cancelled) return;
        setAnalysis(report);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Unable to analyze document: ${msg}`);
        setAnalysis(null);
      })
      .finally(() => {
        if (!cancelled) setAnalyzing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file, chunkWords, isBusy]);

  // Auto-refresh credits when analysis arrives so the banner is never stale.
  useEffect(() => {
    if (analysis) checkCredits();
  }, [analysis, checkCredits]);

  const start = async () => {
    if (!file) return;
    setError(null);
    setDownloadUrl(null);
    setLogs([]);
    setCurrent(0);
    setTotal(0);
    setRebuildPct(0);
    setPhase('parsing');
    abortRef.current = new AbortController();

    const opts: HumanizeOptions = {
      readability,
      purpose,
      strength,
      model,
      targetWordsPerChunk: chunkWords,
    };

    try {
      let report = analysis;
      if (!report) {
        report = await analyzeDocxFile(file, chunkWords);
        setAnalysis(report);
      }

      const availableCredits = await checkCredits();
      if (availableCredits === null) {
        setError('Unable to check credits. Please try again.');
        setPhase('error');
        return;
      }

      if (report.billableWords > availableCredits) {
        setError(
          `Insufficient credits. Estimated usage ≈ ${report.billableWords.toLocaleString()} (input ${report.estimatedInputWords.toLocaleString()} × ${CREDIT_SAFETY_MULTIPLIER}); available ${availableCredits.toLocaleString()}.`
        );
        setPhase('error');
        return;
      }

      const onProgress = (u: ProgressUpdate) => {
        setPhase(u.phase);
        if (typeof u.current === 'number') setCurrent(u.current);
        if (typeof u.total === 'number') setTotal(u.total);
        if (typeof u.subProgress === 'number') {
          setRebuildPct(Math.round(u.subProgress * 100));
        }
        setLogs((prev) => [
          ...prev,
          { ts: Date.now(), message: u.message, phase: u.phase, preview: u.preview },
        ]);
      };

      // Mid-run safety: refresh credits every 5 sections so we stop early
      // if another tab or actor consumes our balance.
      let creditCheckCounter = 0;
      let liveCredits = availableCredits;

      const { blob, filename } = await humanizeDocxFile(
        file,
        opts,
        onProgress,
        abortRef.current.signal,
        {
          beforeSection: async ({ nextEstimate, consumedSoFar, sectionIndex }) => {
            creditCheckCounter += 1;
            // Refresh credits periodically.
            if (creditCheckCounter % 5 === 0) {
              const fresh = await checkCredits();
              if (fresh !== null) liveCredits = fresh;
            }
            const remaining = liveCredits - consumedSoFar;
            if (nextEstimate > remaining) {
              setError(
                `Stopped before section ${sectionIndex}: only ${remaining.toLocaleString()} credits remain, next section needs ≈${nextEstimate.toLocaleString()}.`
              );
              return false;
            }
            return true;
          },
        }
      );
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setDownloadName(filename);
      setPhase('done');
      checkCredits();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setPhase('error');
      // log technical detail to console only
      if (err instanceof Error)
        console.error('[humanizer]', (err as Error & { cause?: unknown }).cause ?? err);
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setPhase('error');
    setError('Cancelled by user.');
  };

  const reset = () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setFile(null);
    setLogs([]);
    setError(null);
    setDownloadUrl(null);
    setCurrent(0);
    setTotal(0);
    setRebuildPct(0);
    setAnalysis(null);
    setPhase('idle');
  };

  const progressPct = useMemo(() => {
    if (phase === 'done') return 100;
    if (phase === 'rebuilding') {
      // Map zip rebuild into the last 10% of the bar.
      const sectionsDone = total > 0 ? 90 : 90;
      return Math.min(99, sectionsDone + Math.round(rebuildPct / 10));
    }
    if (total === 0) return phase === 'idle' ? 0 : 5;
    return Math.min(89, Math.round((current / total) * 90));
  }, [current, total, phase, rebuildPct]);

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-lg bg-slate-950 text-white hover:bg-slate-800 transition"
              aria-label="Back"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-500">
                Tool
              </p>
              <h1 className="text-lg font-semibold flex items-center gap-2">
                <Sparkles size={18} className="text-slate-950" />
                AI Humanizer for Word Documents
              </h1>
            </div>
          </div>
          <button
            onClick={() => checkCredits()}
            aria-label={
              credits === null
                ? 'Check Undetectable credits'
                : `Refresh credits — ${credits.toLocaleString()} available`
            }
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-950 text-white border border-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 transition"
          >
            {credits === null ? 'Check credits' : `${credits.toLocaleString()} credits`}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Step 1: Upload */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-950">
            1 · Upload your Word document
          </h2>
          <label
            htmlFor="docx-input"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            aria-disabled={isBusy}
            className={`relative flex flex-col items-center justify-center gap-3 px-6 py-12 rounded-2xl border-2 border-dashed transition ${
              isBusy ? 'pointer-events-none opacity-60' : 'cursor-pointer'
            } ${
              file
                ? 'border-slate-900/50 bg-slate-100'
                : 'border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-slate-400'
            }`}
          >
            <input
              id="docx-input"
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => onSelectFile(e.target.files?.[0] ?? null)}
              disabled={isBusy}
            />
            {file ? (
              <>
                <FileText size={36} className="text-slate-900" />
                <div className="text-center">
                  <p className="font-medium text-slate-950">{file.name}</p>
                  <p className="text-xs text-slate-500">
                    {(file.size / 1024).toFixed(1)} KB · click to replace
                  </p>
                </div>
              </>
            ) : (
              <>
                <Upload size={36} className="text-slate-500" />
                <div className="text-center">
                  <p className="font-medium text-slate-950">Drop a .docx here or click to browse</p>
                  <p className="text-xs text-slate-500">
                    We preserve fonts, sizes, headings and layout.
                  </p>
                </div>
              </>
            )}
          </label>
        </section>

        {/* Step 2: Settings */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">
            2 · Humanizer settings
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <Select label="Readability" value={readability} onChange={setReadability} options={READABILITY} disabled={isBusy} />
            <Select label="Purpose" value={purpose} onChange={setPurpose} options={PURPOSE} disabled={isBusy} />
            <Select label="Strength" value={strength} onChange={setStrength} options={STRENGTH} disabled={isBusy} />
            <Select
              label="Model"
              value={model}
              onChange={setModel}
              options={MODELS.map((m) => m.value)}
              labels={Object.fromEntries(MODELS.map((m) => [m.value, m.label]))}
              disabled={isBusy}
            />
            <div>
              <label className="text-[11px] uppercase tracking-wider text-slate-500">
                Words per section
              </label>
              <input
                type="number"
                min={50}
                max={1000}
                step={50}
                value={chunkWords}
                disabled={isBusy}
                onChange={(e) => setChunkWords(Math.max(50, Number(e.target.value) || 300))}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 focus:outline-none focus:border-slate-900 disabled:opacity-50"
              />
            </div>
          </div>

          {analyzing && !analysis && (
            <div className="text-xs text-slate-600 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Analyzing document…
            </div>
          )}

          {analysis && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-900">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold">Document estimate</p>
                {typeof credits === 'number' && (
                  <p className="text-xs text-slate-600">
                    {credits.toLocaleString()} credits available
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatusCard label="Total words" value={analysis.totalWords.toLocaleString()} />
                <StatusCard
                  label="Words to humanize"
                  value={analysis.estimatedInputWords.toLocaleString()}
                />
                <StatusCard
                  label={`Est. credits (×${CREDIT_SAFETY_MULTIPLIER})`}
                  value={analysis.billableWords.toLocaleString()}
                  emphasis={insufficientCredits ? 'danger' : 'primary'}
                />
                <StatusCard
                  label="Sections"
                  value={`${analysis.billableSections} / ${analysis.sections}`}
                />
              </div>
              <div className="mt-3 text-xs text-slate-600">
                Undetectable.AI bills both input and output. We multiply the input words by{' '}
                {CREDIT_SAFETY_MULTIPLIER}× as a safety margin so jobs don&apos;t fail mid-run.
                Sections under 50 characters are skipped.
              </div>
            </div>
          )}
        </section>

        {/* Step 3: Run */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-950">3 · Humanize</h2>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={start}
              disabled={!file || isBusy || insufficientCredits}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-950 text-white font-semibold shadow-lg shadow-slate-300/20 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5 transition"
            >
              {isBusy ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
              {isBusy ? 'Processing…' : 'Start humanizing'}
            </button>
            {isBusy && (
              <button
                onClick={cancel}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10"
              >
                <StopCircle size={16} /> Cancel
              </button>
            )}
            {(phase === 'done' || phase === 'error') && (
              <button
                onClick={reset}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10"
              >
                Reset
              </button>
            )}
          </div>

          {/* Progress */}
          {(isBusy || phase === 'done' || phase === 'error') && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  {phase === 'parsing' && 'Reading document…'}
                  {phase === 'chunking' && 'Splitting into sections…'}
                  {phase === 'humanizing' && `Humanizing ${current}/${total}`}
                  {phase === 'rebuilding' && `Rebuilding .docx… ${rebuildPct}%`}
                  {phase === 'done' && 'Completed'}
                  {phase === 'error' && 'Stopped'}
                </span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    phase === 'error'
                      ? 'bg-rose-500'
                      : 'bg-slate-950'
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm">
              <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {(credits !== null && insufficientCredits) && (
            <div className="w-full rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
              Estimated usage exceeds your current credit balance. Increase credits or reduce the document size before running.
            </div>
          )}
        </section>

        {/* Live log */}
        {logs.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">Live progress</h2>
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 max-h-80 overflow-y-auto space-y-2 text-sm">
              {logs.map((l, i) => (
                <div key={i} className="flex items-start gap-2">
                  <PhaseIcon phase={l.phase} />
                  <div className="flex-1">
                    <p className="text-slate-900">{l.message}</p>
                    {l.preview && (
                      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                        <div className="p-2 rounded-lg bg-white border border-slate-200">
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                            Original
                          </p>
                          <p className="text-slate-700 line-clamp-3">{l.preview.original}…</p>
                        </div>
                        <div className="p-2 rounded-lg bg-slate-100 border border-slate-200">
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                            Humanized
                          </p>
                          <p className="text-slate-900 line-clamp-3">{l.preview.humanized}…</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Download */}
        {phase === 'done' && downloadUrl && (
          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={28} className="text-slate-950" />
              <div>
                <p className="font-semibold text-slate-950">Your humanized document is ready</p>
                <p className="text-sm text-slate-700/80">
                  Fonts, sizes and structure preserved.
                </p>
              </div>
            </div>
            <a
              href={downloadUrl}
              download={downloadName}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-white font-semibold shadow-lg"
            >
              <Download size={18} /> Download {downloadName}
            </a>
          </section>
        )}
      </main>
    </div>
  );
}

function StatusCard({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: 'primary' | 'danger';
}) {
  const valueClass =
    emphasis === 'danger'
      ? 'text-rose-600'
      : emphasis === 'primary'
        ? 'text-slate-950'
        : 'text-slate-950';
  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-3">
      <p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-2 text-lg font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}

function PhaseIcon({ phase }: { phase: ProgressUpdate['phase'] }) {
  if (phase === 'error') return <XCircle size={16} className="text-rose-500 mt-0.5" />;
  if (phase === 'done') return <CheckCircle2 size={16} className="text-slate-950 mt-0.5" />;
  return <Loader2 size={16} className="text-slate-600 animate-spin mt-0.5" />;
}

function Select({
  label,
  value,
  onChange,
  options,
  labels,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labels?: Record<string, string>;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wider text-slate-400">{label}</label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 focus:outline-none focus:border-slate-900 disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-slate-900">
            {labels?.[o] ?? o}
          </option>
        ))}
      </select>
    </div>
  );
}
