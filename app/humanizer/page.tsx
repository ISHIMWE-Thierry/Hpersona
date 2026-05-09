'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, CheckCircle2, XCircle, AlertCircle, Download, Trash2, FileText } from 'lucide-react';
import {
  humanizeDocxFile,
  analyzeDocxFile,
  CREDIT_SAFETY_MULTIPLIER,
  type ProgressUpdate,
  type HumanizeOptions,
  type DocxAnalysis,
} from '@/lib/docx-humanizer';
import { useAuth } from '@/contexts/AuthContext';
import {
  createCreditRequest,
  consumeUsage,
  DEFAULT_USAGE_LIMIT,
  getUsage,
  isProActive,
  PRO_PRICE_RUB,
  type UsageDoc,
} from '@/lib/humanizer-usage';
import {
  saveHumanizedDocument,
  listHumanizedDocuments,
  getHumanizedBlob,
  deleteHumanizedDocument,
  type HumanizedHistoryMeta,
} from '@/lib/humanizer-history';

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
  const [usage, setUsage] = useState<UsageDoc | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<DocxAnalysis | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const progressSectionRef = useRef<HTMLDivElement | null>(null);
  const liveLogRef = useRef<HTMLDivElement | null>(null);
  const [history, setHistory] = useState<HumanizedHistoryMeta[]>([]);

  const [readability, setReadability] = useState('University');
  const [purpose, setPurpose] = useState('Article');
  const [strength, setStrength] = useState('More Human');
  const [model, setModel] = useState('v2');
  const [chunkWords, setChunkWords] = useState(300);

  const { user } = useAuth();

  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestMessage, setRequestMessage] = useState('');
  const [requestLimit, setRequestLimit] = useState(DEFAULT_USAGE_LIMIT);
  const [requestUnlimited, setRequestUnlimited] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  const [proCheckoutBusy, setProCheckoutBusy] = useState(false);
  const [proCheckoutError, setProCheckoutError] = useState<string | null>(null);
  const [proPaymentSuccess, setProPaymentSuccess] = useState(false);

  const remainingWords = usage?.unlimited ? Infinity : Math.max(0, (usage?.limit ?? DEFAULT_USAGE_LIMIT) - (usage?.used ?? 0));
  const proActive = isProActive(usage);
  const insufficientLocalUsage =
    !!analysis && !!usage && !usage.unlimited && !proActive && analysis.billableWords > remainingWords;
  const insufficientCredits =
    !!analysis && typeof credits === 'number' && analysis.billableWords > credits;
  const isBusy = phase !== 'idle' && phase !== 'done' && phase !== 'error';

  const missingUsage = !!user && usage === null;
  // Block Start while a Reset is required (i.e. after a finished or errored
  // run) — the user must explicitly Reset before kicking off another job.
  const startDisabled =
    !file ||
    isBusy ||
    phase === 'done' ||
    phase === 'error' ||
    insufficientCredits ||
    insufficientLocalUsage ||
    !user ||
    missingUsage;

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

  const refreshUsage = useCallback(async () => {
    if (!user) {
      setUsage(null);
      return;
    }
    try {
      const doc = await getUsage(user.uid);
      setUsage(doc);
      setUsageError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load usage.';
      setUsageError(message);
      setUsage(null);
    }
  }, [user]);

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
    if (analysis) {
      checkCredits();
      refreshUsage();
    }
  }, [analysis, checkCredits, refreshUsage]);

  useEffect(() => {
    if (user) {
      checkCredits();
    }
  }, [checkCredits, user]);

  useEffect(() => {
    refreshUsage();
  }, [refreshUsage]);

  // Load this user's locally-saved humanized documents so they never lose them.
  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    listHumanizedDocuments(user.uid).then((items) => {
      if (!cancelled) setHistory(items);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Auto-scroll the live log to the latest entry as it streams.
  useEffect(() => {
    const el = liveLogRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [logs]);

  // Returning from YooKassa: poll the status endpoint until the webhook
  // marks the order active, then refresh usage so the Pro state shows up.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') !== 'success') return;
    let orderId: string | null = null;
    try {
      orderId = sessionStorage.getItem('hpersona:pendingProOrder');
    } catch {
      orderId = null;
    }
    if (!orderId) return;

    let cancelled = false;
    let attempts = 0;
    const poll = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const r = await fetch(`/api/ai-services/payment/status?orderId=${encodeURIComponent(orderId!)}`);
        const d = await r.json();
        if (d?.ok && d.data?.status === 'active') {
          setProPaymentSuccess(true);
          try {
            sessionStorage.removeItem('hpersona:pendingProOrder');
          } catch {
            /* ignore */
          }
          // Strip ?payment=success from the URL.
          window.history.replaceState({}, '', window.location.pathname);
          refreshUsage();
          return;
        }
      } catch {
        /* keep polling */
      }
      if (attempts < 20) setTimeout(poll, 2000);
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [refreshUsage]);

  const start = async () => {
    if (!user) {
      setError('Please sign in to use the humanizer and track your word budget.');
      setPhase('error');
      return;
    }
    if (!file) return;
    setError(null);
    setDownloadUrl(null);
    setLogs([]);
    setCurrent(0);
    setTotal(0);
    setRebuildPct(0);
    setPhase('parsing');
    abortRef.current = new AbortController();

    // Smoothly bring the live progress into view so the user actually sees
    // what is happening as the run kicks off.
    setTimeout(() => {
      progressSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);

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

      if (!usage) {
        setError('Unable to read your usage. Please reload and try again.');
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

      if (!usage.unlimited && !proActive && report.billableWords > remainingWords) {
        setError(
          `This job needs ${report.billableWords.toLocaleString()} words but you only have ${remainingWords.toLocaleString()} words available.`
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
      if (user && report.billableWords > 0 && !proActive) {
        consumeUsage(user.uid, report.billableWords).catch((err) => {
          console.error('[humanizer] failed to consume usage', err);
        });
      }
      // Persist to local history so the user can re-download from any
      // previous run without losing their work.
      if (user) {
        try {
          const meta = await saveHumanizedDocument({
            uid: user.uid,
            filename,
            originalName: file.name,
            sizeBytes: blob.size,
            billableWords: report.billableWords,
            blob,
          });
          setHistory((prev) => [meta, ...prev]);
        } catch (e) {
          console.warn('[humanizer] could not persist to local history', e);
        }
      }
      checkCredits();
      refreshUsage();
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

  const redownloadHistoryItem = async (id: string, filename: string) => {
    const res = await getHumanizedBlob(id);
    if (!res) return;
    const url = URL.createObjectURL(res.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || res.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const removeHistoryItem = async (id: string) => {
    await deleteHumanizedDocument(id);
    setHistory((prev) => prev.filter((h) => h.id !== id));
  };

  const startProCheckout = async () => {
    if (!user) {
      setProCheckoutError('Please sign in to upgrade to Pro.');
      return;
    }
    setProCheckoutBusy(true);
    setProCheckoutError(null);
    try {
      const r = await fetch('/api/ai-services/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: user.uid,
          email: user.email || '',
          plan: 'monthly_pro',
        }),
      });
      const d = await r.json();
      if (!r.ok || !d?.ok) {
        throw new Error(d?.error || `Payment service responded ${r.status}`);
      }
      const { confirmationUrl, orderId } = d.data || {};
      if (!confirmationUrl) throw new Error('Missing confirmation URL.');
      try {
        sessionStorage.setItem('hpersona:pendingProOrder', orderId);
      } catch {
        /* ignore */
      }
      window.location.href = confirmationUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setProCheckoutError(msg);
      setProCheckoutBusy(false);
    }
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
              Back
            </Link>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-500">
                Tool
              </p>
              <h1 className="text-lg font-semibold flex items-center gap-2">
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
        {/* Pro upgrade banner — shown until the user has an active Pro
            subscription. Pro = unlimited humanization for 30 days, 100₽. */}
        {user && !proActive && (
          <section className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-emerald-700 font-semibold">
                  Hpersona Pro
                </p>
                <h2 className="mt-1 text-lg sm:text-xl font-semibold text-slate-950">
                  Unlimited humanization · {PRO_PRICE_RUB}₽ / month
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Skip the 20,000-word cap. Pay with card, SBP, YooMoney or Mir
                  via YooKassa. Activates instantly for 30 days.
                </p>
              </div>
              <div className="flex flex-col items-stretch sm:items-end gap-2">
                <button
                  type="button"
                  onClick={startProCheckout}
                  disabled={proCheckoutBusy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 disabled:opacity-60"
                >
                  {proCheckoutBusy ? <Loader2 size={16} className="animate-spin" /> : null}
                  {proCheckoutBusy ? 'Redirecting…' : `Upgrade to Pro — ${PRO_PRICE_RUB}₽`}
                </button>
                {proCheckoutError && (
                  <p className="text-xs text-rose-600 max-w-xs">{proCheckoutError}</p>
                )}
              </div>
            </div>
          </section>
        )}

        {user && proActive && usage?.proUntil && (
          <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 flex items-center gap-3">
            <CheckCircle2 className="text-emerald-600 flex-shrink-0" size={22} />
            <div className="text-sm">
              <p className="font-semibold text-emerald-900">Pro active — unlimited humanization</p>
              <p className="text-xs text-emerald-800/80">
                Your subscription renews-by date: {new Date(usage.proUntil).toLocaleDateString()}
              </p>
            </div>
          </section>
        )}

        {proPaymentSuccess && (
          <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
            ✅ Payment received — Pro is now active. Enjoy unlimited humanization for 30 days.
          </section>
        )}

        {/* Steps 1 & 2 are hidden while a job is running or after it completes,
            so the live progress can take over the screen. They reappear after
            Reset or once the user picks a new file. */}
        {!isBusy && phase !== 'done' && (
        <>
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
              <div className="text-center">
                <p className="font-medium text-slate-950">{file.name}</p>
                <p className="text-xs text-slate-500">
                  {(file.size / 1024).toFixed(1)} KB · click to replace
                </p>
              </div>
            ) : (
              <div className="text-center">
                <p className="font-medium text-slate-950">Drop a .docx here or click to browse</p>
                <p className="text-xs text-slate-500">
                  We preserve fonts, sizes, headings and layout.
                </p>
              </div>
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
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-900">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-semibold">Your local word budget</p>
                    <p className="text-xs text-slate-500">
                      {usage
                        ? proActive
                          ? `Pro active — unlimited until ${usage.proUntil ? new Date(usage.proUntil).toLocaleDateString() : '—'}`
                          : usage.unlimited
                            ? 'Unlimited access enabled'
                            : `${usage.used.toLocaleString()} / ${usage.limit.toLocaleString()} words used`
                        : 'Loading your account usage...'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRequestModalOpen(true)}
                    disabled={!user}
                    className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    Request more words
                  </button>
                </div>
                {usage && !usage.unlimited && (
                  <div className="mt-3 h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full bg-slate-950 transition-all"
                      style={{ width: `${Math.min(100, Math.round((usage.used / usage.limit) * 100))}%` }}
                    />
                  </div>
                )}
                {usageError && <p className="mt-3 text-xs text-rose-600">{usageError}</p>}
              </div>
              {requestModalOpen && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-900">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">Request more words</p>
                      <p className="text-xs text-slate-500">
                        Submit a request for an admin to increase your humanizer budget.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRequestModalOpen(false)}
                      className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-200"
                    >
                      Close
                    </button>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="space-y-2 text-xs text-slate-500">
                      Requested word limit
                      <input
                        type="number"
                        min={1000}
                        step={1000}
                        value={requestLimit}
                        disabled={requestBusy}
                        onChange={(e) => setRequestLimit(Math.max(1000, Number(e.target.value) || DEFAULT_USAGE_LIMIT))}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950 focus:border-slate-950"
                      />
                    </label>
                    <label className="space-y-2 text-xs text-slate-500">
                      <span>Unlimited access</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={requestUnlimited}
                          disabled={requestBusy}
                          onChange={(e) => setRequestUnlimited(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-slate-950"
                        />
                        <span className="text-sm text-slate-700">Request unlimited words</span>
                      </div>
                    </label>
                  </div>
                  <label className="mt-4 block text-xs text-slate-500">
                    Message to admin
                    <textarea
                      value={requestMessage}
                      disabled={requestBusy}
                      onChange={(e) => setRequestMessage(e.target.value)}
                      rows={4}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950 focus:border-slate-950"
                    />
                  </label>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={requestBusy || !requestMessage.trim() || !user}
                      onClick={async () => {
                        if (!user) return;
                        setRequestBusy(true);
                        setRequestError(null);
                        setRequestSuccess(null);
                        try {
                          await createCreditRequest({
                            uid: user.uid,
                            email: user.email ?? '',
                            displayName: user.displayName ?? undefined,
                            message: requestMessage.trim() || 'Requesting additional humanizer words.',
                            requestedLimit: requestUnlimited ? null : requestLimit,
                          });
                          setRequestSuccess('Request submitted. An admin will review it shortly.');
                          setRequestMessage('');
                          setRequestUnlimited(false);
                          setRequestLimit(DEFAULT_USAGE_LIMIT);
                        } catch (err) {
                          setRequestError(err instanceof Error ? err.message : 'Failed to submit request.');
                        } finally {
                          setRequestBusy(false);
                        }
                      }}
                      className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      {requestBusy ? 'Submitting…' : 'Submit request'}
                    </button>
                    {requestSuccess && <p className="text-sm text-emerald-700">{requestSuccess}</p>}
                    {requestError && <p className="text-sm text-rose-700">{requestError}</p>}
                  </div>
                </div>
              )}
             </div>
           )}
         </section>
        </>
        )}

        {/* Step 3: Run */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-950">3 · Humanize</h2>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={start}
              disabled={startDisabled}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-950 text-white font-semibold shadow-lg shadow-slate-300/20 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5 transition"
            >
              {isBusy ? <Loader2 className="animate-spin" size={18} /> : null}
              {isBusy ? 'Processing…' : 'Start humanizing'}
            </button>
            {isBusy && (
              <button
                onClick={cancel}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10"
              >
                Cancel
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
            <div ref={progressSectionRef} className="space-y-2 scroll-mt-24">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="inline-flex items-center gap-2">
                  {isBusy && <Loader2 className="animate-spin text-emerald-600" size={14} />}
                  {phase === 'done' && <CheckCircle2 className="text-emerald-600" size={14} />}
                  {phase === 'error' && <XCircle className="text-rose-600" size={14} />}
                  <span>
                    {phase === 'parsing' && 'Reading document…'}
                    {phase === 'chunking' && 'Splitting into sections…'}
                    {phase === 'analyzing' && 'Analyzing document…'}
                    {phase === 'detecting-language' && 'Detecting language…'}
                    {phase === 'translating' && `Translating ${current}/${total}`}
                    {phase === 'humanizing' && `Humanizing ${current}/${total}`}
                    {phase === 'rebuilding' && `Rebuilding .docx… ${rebuildPct}%`}
                    {phase === 'done' && 'Completed'}
                    {phase === 'error' && 'Stopped'}
                  </span>
                </span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    phase === 'error'
                      ? 'bg-rose-500'
                      : phase === 'done'
                        ? 'bg-emerald-500'
                        : 'bg-emerald-500'
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
              <XCircle size={18} className="text-rose-600 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {(credits !== null && insufficientCredits) && (
            <div className="w-full rounded-xl bg-zinc-50 border border-zinc-200 p-3 text-sm text-zinc-700">
              Estimated usage exceeds your current credit balance. Increase credits or reduce the document size before running.
            </div>
          )}
        </section>

        {/* Live log */}
        {(isBusy || logs.length > 0) && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                {isBusy ? (
                  <Loader2 className="animate-spin text-emerald-600" size={18} />
                ) : phase === 'error' ? (
                  <XCircle className="text-rose-600" size={18} />
                ) : (
                  <CheckCircle2 className="text-emerald-600" size={18} />
                )}
                Live progress
              </h2>
              {total > 0 && (
                <span className="text-xs text-slate-500 font-medium">
                  {phase === 'humanizing' ? `${current} / ${total} sections` : `${logs.length} events`}
                </span>
              )}
            </div>
            <div
              ref={liveLogRef}
              className="rounded-2xl bg-slate-50 border border-slate-200 p-5 min-h-[420px] max-h-[600px] overflow-y-auto space-y-3 text-[15px] leading-relaxed shadow-inner"
            >
              {logs.length === 0 && (
                <div className="flex items-center gap-3 text-slate-500">
                  <Loader2 className="animate-spin text-emerald-600" size={18} />
                  <span>Warming up…</span>
                </div>
              )}
              {logs.map((l, i) => {
                const isLast = i === logs.length - 1;
                return (
                  <div key={i} className="flex items-start gap-3">
                    <PhaseIcon phase={l.phase} active={isLast && isBusy} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-slate-900 ${isLast && isBusy ? 'font-medium' : ''}`}>{l.message}</p>
                      {l.preview && (
                        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                          <div className="p-2 rounded-lg bg-white border border-slate-200">
                            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                              Original
                            </p>
                            <p className="text-slate-700 line-clamp-3">{l.preview.original}…</p>
                          </div>
                          <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200">
                            <p className="text-[10px] uppercase tracking-wider text-emerald-700 mb-1">
                              Humanized
                            </p>
                            <p className="text-slate-900 line-clamp-3">{l.preview.humanized}…</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Download */}
        {phase === 'done' && downloadUrl && (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="text-emerald-600" size={28} />
              <div>
                <p className="font-semibold text-slate-950">Your humanized document is ready</p>
                <p className="text-sm text-slate-700/80">
                  Fonts, sizes and structure preserved. Saved to your local history below.
                </p>
              </div>
            </div>
            <a
              href={downloadUrl}
              download={downloadName}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-lg"
            >
              <Download size={16} />
              Download {downloadName}
            </a>
          </section>
        )}

        {/* Recent humanized documents (local history) */}
        {history.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <FileText size={16} />
              Your humanized documents
              <span className="text-xs font-normal text-slate-500">
                · saved on this device
              </span>
            </h2>
            <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white overflow-hidden">
              {history.map((h) => (
                <li key={h.id} className="flex items-center gap-3 px-4 py-3">
                  <FileText size={18} className="text-slate-400 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {h.filename}
                    </p>
                    <p className="text-xs text-slate-500">
                      {new Date(h.createdAt).toLocaleString()} ·{' '}
                      {(h.sizeBytes / 1024).toFixed(0)} KB ·{' '}
                      {h.billableWords.toLocaleString()} words
                    </p>
                  </div>
                  <button
                    onClick={() => redownloadHistoryItem(h.id, h.filename)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 text-white text-xs font-semibold hover:bg-slate-800"
                  >
                    <Download size={14} />
                    Download
                  </button>
                  <button
                    onClick={() => removeHistoryItem(h.id)}
                    aria-label="Delete from history"
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
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
      ? 'text-zinc-600'
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

function PhaseIcon({ phase, active }: { phase: ProgressUpdate['phase']; active?: boolean }) {
  if (phase === 'error') {
    return <XCircle className="mt-0.5 text-rose-500 flex-shrink-0" size={18} />;
  }
  if (phase === 'done') {
    return <CheckCircle2 className="mt-0.5 text-emerald-600 flex-shrink-0" size={18} />;
  }
  if (active) {
    return <Loader2 className="mt-0.5 animate-spin text-emerald-600 flex-shrink-0" size={18} />;
  }
  return <CheckCircle2 className="mt-0.5 text-emerald-500/70 flex-shrink-0" size={16} />;
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
