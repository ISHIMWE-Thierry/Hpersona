// Firestore-backed humanizer usage ledger and credit-extension requests.
//
// Collections:
//   humanizerUsage/{uid}      { used, limit, unlimited, updatedAt }
//   humanizerRequests/{id}    { uid, email, message, requestedLimit, status, createdAt, decidedBy?, decidedAt? }
//   users/{uid}               { uid, email, displayName, role, createdAt }
//
// All writes are guarded by Firestore security rules. The client increments
// `used` by section-word counts during humanization; admins can adjust
// `limit` / `unlimited` / `used` for any user.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';

export const DEFAULT_USAGE_LIMIT = 20_000; // words humanized per user
export const PRO_PRICE_RUB = 1000;
export const PRO_DURATION_DAYS = 30;

export interface UsageDoc {
  uid: string;
  used: number;
  limit: number;
  unlimited: boolean;
  /** Pro subscription expiry (ms epoch). Treated as unlimited while > now. */
  proUntil?: number;
  updatedAt?: unknown;
}

/** True if the user currently has an active Pro subscription. */
export function isProActive(usage: UsageDoc | null | undefined): boolean {
  if (!usage) return false;
  if (usage.unlimited) return true;
  return typeof usage.proUntil === 'number' && usage.proUntil > Date.now();
}

export interface CreditRequest {
  id: string;
  uid: string;
  email: string;
  displayName?: string;
  message: string;
  requestedLimit: number | null; // null = ask for unlimited
  status: 'pending' | 'approved' | 'denied';
  createdAt?: { toDate?: () => Date } | null;
  decidedBy?: string;
  decidedAt?: { toDate?: () => Date } | null;
}

export async function getUsage(uid: string): Promise<UsageDoc> {
  if (!db) throw new Error('Firestore not initialized');
  const ref = doc(db, 'humanizerUsage', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const initial: UsageDoc = {
      uid,
      used: 0,
      limit: DEFAULT_USAGE_LIMIT,
      unlimited: false,
    };
    await setDoc(ref, { ...initial, updatedAt: serverTimestamp() });
    return initial;
  }
  const d = snap.data();
  return {
    uid,
    used: typeof d.used === 'number' ? d.used : 0,
    limit: typeof d.limit === 'number' ? d.limit : DEFAULT_USAGE_LIMIT,
    unlimited: !!d.unlimited,
    proUntil: typeof d.proUntil === 'number' ? d.proUntil : undefined,
  };
}

/** Atomically add `delta` words to the running total. */
export async function consumeUsage(uid: string, delta: number): Promise<void> {
  if (!db) return;
  if (delta <= 0) return;
  const ref = doc(db, 'humanizerUsage', uid);
  await updateDoc(ref, {
    used: increment(delta),
    updatedAt: serverTimestamp(),
  }).catch(async () => {
    // Doc didn't exist yet — bootstrap it then increment.
    await setDoc(ref, {
      uid,
      used: delta,
      limit: DEFAULT_USAGE_LIMIT,
      unlimited: false,
      updatedAt: serverTimestamp(),
    });
  });
}

/** Admin-only: change a user's cap. */
export async function setUsageLimit(
  uid: string,
  limit: number,
  unlimited = false
): Promise<void> {
  if (!db) return;
  const ref = doc(db, 'humanizerUsage', uid);
  await setDoc(
    ref,
    { uid, limit, unlimited, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/** Admin-only: zero out the consumed counter. */
export async function resetUsage(uid: string): Promise<void> {
  if (!db) return;
  const ref = doc(db, 'humanizerUsage', uid);
  await setDoc(
    ref,
    { uid, used: 0, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/** User → admin: ask for more capacity. */
export async function createCreditRequest(
  payload: Omit<CreditRequest, 'id' | 'status' | 'createdAt'>
): Promise<string> {
  if (!db) throw new Error('Firestore not initialized');
  const ref = doc(collection(db, 'humanizerRequests'));
  await setDoc(ref, {
    ...payload,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function listCreditRequests(
  status?: 'pending' | 'approved' | 'denied'
): Promise<CreditRequest[]> {
  if (!db) return [];
  const base = collection(db, 'humanizerRequests');
  const q = status
    ? query(base, where('status', '==', status), orderBy('createdAt', 'desc'))
    : query(base, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CreditRequest, 'id'>) }));
}

export function watchPendingRequests(
  callback: (rows: CreditRequest[]) => void
): Unsubscribe {
  if (!db) return () => {};
  const q = query(
    collection(db, 'humanizerRequests'),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CreditRequest, 'id'>) }))
    );
  });
}

export async function decideRequest(
  id: string,
  decision: 'approved' | 'denied',
  adminUid: string
): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, 'humanizerRequests', id), {
    status: decision,
    decidedBy: adminUid,
    decidedAt: serverTimestamp(),
  });
}
