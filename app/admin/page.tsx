'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminEmail, isAdminUser, setUserRole, findUserByEmail, type UserProfile } from '@/lib/admin';
import {
  decideRequest,
  getUsage,
  resetUsage,
  setUsageLimit,
  watchPendingRequests,
  type CreditRequest,
  type UsageDoc,
} from '@/lib/humanizer-usage';

const DEFAULT_LIMIT = 20000;

export default function AdminPage() {
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<CreditRequest[]>([]);
  const [selectedEmail, setSelectedEmail] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);
  const [selectedUsage, setSelectedUsage] = useState<UsageDoc | null>(null);
  const [selectedLimit, setSelectedLimit] = useState(DEFAULT_LIMIT);
  const [selectedUnlimited, setSelectedUnlimited] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [requestBusy, setRequestBusy] = useState<string | null>(null);
  const [savingUsage, setSavingUsage] = useState(false);
  const [savingRole, setSavingRole] = useState(false);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setAdminChecked(!loading);
      return;
    }

    let cancelled = false;
    if (isAdminEmail(user)) {
      setIsAdmin(true);
      setAdminChecked(true);
      return;
    }
    isAdminUser(user).then((value) => {
      if (cancelled) return;
      setIsAdmin(value);
      setAdminChecked(true);
    });

    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  useEffect(() => {
    if (!isAdmin) return;
    const unsubscribe = watchPendingRequests((rows) => setPendingRequests(rows));
    return unsubscribe;
  }, [isAdmin]);

  const loadUserByEmail = useCallback(async () => {
    if (!selectedEmail.trim()) return;
    setUserLoading(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const profile = await findUserByEmail(selectedEmail);
      if (!profile) {
        setSelectedProfile(null);
        setSelectedUsage(null);
        setErrorMessage('No user found for that email.');
        return;
      }
      setSelectedProfile(profile);
      const usage = await getUsage(profile.uid);
      setSelectedUsage(usage);
      setSelectedLimit(usage.limit);
      setSelectedUnlimited(usage.unlimited);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to load user.');
      setSelectedProfile(null);
      setSelectedUsage(null);
    } finally {
      setUserLoading(false);
    }
  }, [selectedEmail]);

  const handleDecision = useCallback(
    async (request: CreditRequest, decision: 'approved' | 'denied') => {
      if (!user) return;
      setRequestBusy(request.id);
      setStatusMessage(null);
      setErrorMessage(null);
      try {
        if (decision === 'approved') {
            const limit =
              request.requestedLimit === null
                ? selectedProfile?.uid === request.uid
                  ? selectedUsage?.limit ?? DEFAULT_LIMIT
                  : DEFAULT_LIMIT
                : request.requestedLimit;
            await setUsageLimit(request.uid, limit, request.requestedLimit === null);
        }
        await decideRequest(request.id, decision, user.uid);
        if (selectedProfile?.uid === request.uid) {
          const refreshed = await getUsage(request.uid);
          setSelectedUsage(refreshed);
          setSelectedLimit(refreshed.limit);
          setSelectedUnlimited(refreshed.unlimited);
        }
        setStatusMessage(`Request ${decision}.`);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Unable to update request.');
      } finally {
        setRequestBusy(null);
      }
    },
    [user, selectedUsage, selectedProfile]
  );

  const saveUsage = useCallback(async () => {
    if (!selectedProfile) return;
    setSavingUsage(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await setUsageLimit(selectedProfile.uid, selectedLimit, selectedUnlimited);
      const refreshed = await getUsage(selectedProfile.uid);
      setSelectedUsage(refreshed);
      setStatusMessage('Usage updated successfully.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to save usage.');
    } finally {
      setSavingUsage(false);
    }
  }, [selectedProfile, selectedLimit, selectedUnlimited]);

  const resetUserUsage = useCallback(async () => {
    if (!selectedProfile) return;
    setSavingUsage(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await resetUsage(selectedProfile.uid);
      const refreshed = await getUsage(selectedProfile.uid);
      setSelectedUsage(refreshed);
      setStatusMessage('Usage reset successfully.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to reset usage.');
    } finally {
      setSavingUsage(false);
    }
  }, [selectedProfile]);

  const toggleRole = useCallback(async () => {
    if (!selectedProfile) return;
    setSavingRole(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const nextRole = selectedProfile.role === 'admin' ? 'user' : 'admin';
      await setUserRole(selectedProfile.uid, nextRole);
      setSelectedProfile({ ...selectedProfile, role: nextRole });
      setStatusMessage(`User role updated to ${nextRole}.`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to update role.');
    } finally {
      setSavingRole(false);
    }
  }, [selectedProfile]);

  if (loading || !adminChecked) {
    return (
      <div className="min-h-screen bg-white text-slate-950 flex items-center justify-center">
        <div className="text-sm text-slate-500">Checking admin access…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white text-slate-950 px-6 py-12">
        <div className="max-w-3xl mx-auto rounded-3xl border border-slate-200 bg-slate-50 p-10 text-center">
          <p className="text-sm text-slate-500">You must sign in to access the admin dashboard.</p>
          <Link href="/" className="mt-6 inline-flex rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            Return home
          </Link>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-white text-slate-950 px-6 py-12">
        <div className="max-w-3xl mx-auto rounded-3xl border border-slate-200 bg-slate-50 p-10 text-center">
          <p className="text-sm text-slate-500">Admin access is required to view this page.</p>
          <Link href="/" className="mt-6 inline-flex rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            Return home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500">Admin dashboard</p>
            <h1 className="text-3xl font-semibold text-slate-950">Humanizer control panel</h1>
            <p className="mt-2 text-sm text-slate-600">
              Review credit requests, adjust user budgets, and promote trusted users.
            </p>
          </div>
          <Link href="/humanizer" className="inline-flex items-center rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            Open humanizer
          </Link>
        </div>

        {statusMessage && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {statusMessage}
          </div>
        )}
        {errorMessage && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {errorMessage}
          </div>
        )}

        <section className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Pending requests</h2>
              <p className="text-sm text-slate-600">
                Approve or deny user requests for extra humanizer words.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
              {pendingRequests.length} pending
            </span>
          </div>

          {pendingRequests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-600">
              No pending requests at the moment.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map((request) => (
                <div key={request.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold text-slate-950">{request.email}</p>
                      <p className="text-xs text-slate-500">
                        Requested {request.requestedLimit === null ? 'unlimited' : `${request.requestedLimit.toLocaleString()} words`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleDecision(request, 'approved')}
                        disabled={requestBusy === request.id}
                        className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDecision(request, 'denied')}
                        disabled={requestBusy === request.id}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-slate-100 disabled:opacity-50"
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{request.message}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">User usage editor</h2>
            <p className="text-sm text-slate-600">Search a user by email to adjust their limit, reset usage, or change their role.</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={selectedEmail}
              onChange={(event) => setSelectedEmail(event.target.value)}
              placeholder="user@example.com"
              className="flex-1 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-950 focus:border-slate-950 focus:outline-none"
            />
            <button
              type="button"
              onClick={loadUserByEmail}
              disabled={userLoading || !selectedEmail.trim()}
              className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {userLoading ? 'Loading…' : 'Find user'}
            </button>
          </div>

          {selectedProfile && selectedUsage && (
            <div className="rounded-3xl border border-slate-200 bg-white p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{selectedProfile.email}</p>
                  <p className="text-xs text-slate-500">Role: {selectedProfile.role ?? 'user'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={toggleRole}
                    disabled={savingRole}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-slate-100 disabled:opacity-50"
                  >
                    Set {selectedProfile.role === 'admin' ? 'user' : 'admin'}
                  </button>
                  <button
                    type="button"
                    onClick={resetUserUsage}
                    disabled={savingUsage}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-slate-100 disabled:opacity-50"
                  >
                    Reset used words
                  </button>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wider text-slate-500">Used</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{selectedUsage.used.toLocaleString()}</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <label className="text-xs uppercase tracking-wider text-slate-500">Word limit</label>
                  <input
                    type="number"
                    min={1000}
                    step={1000}
                    value={selectedLimit}
                    onChange={(event) => setSelectedLimit(Number(event.target.value) || DEFAULT_LIMIT)}
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-950 focus:border-slate-950 focus:outline-none"
                  />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <label className="text-xs uppercase tracking-wider text-slate-500">Unlimited</label>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      id="unlimited-toggle"
                      type="checkbox"
                      checked={selectedUnlimited}
                      onChange={(event) => setSelectedUnlimited(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-slate-950"
                    />
                    <label htmlFor="unlimited-toggle" className="text-sm text-slate-700">
                      Grant unlimited access
                    </label>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={saveUsage}
                  disabled={savingUsage}
                  className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {savingUsage ? 'Saving…' : 'Save changes'}
                </button>
                <p className="text-sm text-slate-600">
                  Current user limit: {selectedUsage.limit.toLocaleString()} words, used {selectedUsage.used.toLocaleString()}.
                </p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
