// Admin role helpers.
//
// Admin is granted by either:
//  1. The user's email being in NEXT_PUBLIC_ADMIN_EMAILS (comma-separated), OR
//  2. A `users/{uid}` Firestore doc with `role: 'admin'`.
//
// (1) is the bootstrap path so the very first admin can sign in without
// pre-existing Firestore data; (2) is how admins promote each other.

import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  role?: 'admin' | 'user';
}

const RAW = process.env.NEXT_PUBLIC_ADMIN_EMAILS || '';
export const ADMIN_EMAILS = RAW
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

/** Synchronous (email-only) admin check. Use for the bootstrap allowlist. */
export function isAdminEmail(user: User | null | undefined): boolean {
  const email = user?.email?.toLowerCase();
  return !!email && ADMIN_EMAILS.includes(email);
}

/** Async — checks both the env allowlist AND the users/{uid}.role flag. */
export async function isAdminUser(user: User | null | undefined): Promise<boolean> {
  if (!user) return false;
  if (isAdminEmail(user)) return true;
  if (!db) return false;
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    return snap.exists() && snap.data()?.role === 'admin';
  } catch {
    return false;
  }
}

/** Make sure a `users/{uid}` profile exists; idempotent. */
export async function ensureUserProfile(user: User): Promise<void> {
  if (!db) return;
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  await setDoc(ref, {
    uid: user.uid,
    email: (user.email || '').toLowerCase(),
    displayName: user.displayName || '',
    role: isAdminEmail(user) ? 'admin' : 'user',
    createdAt: serverTimestamp(),
  });
}

export async function findUserByEmail(email: string): Promise<UserProfile | null> {
  if (!db) return null;
  const normalized = email.trim().toLowerCase();
  const q = query(collection(db, 'users'), where('email', '==', normalized));
  const snapshot = await getDocs(q);
  const userDoc = snapshot.docs[0];
  if (!userDoc) return null;
  const data = userDoc.data();
  return {
    uid: typeof data.uid === 'string' ? data.uid : userDoc.id,
    email: typeof data.email === 'string' ? data.email : normalized,
    displayName: typeof data.displayName === 'string' ? data.displayName : undefined,
    role: data.role === 'admin' ? 'admin' : 'user',
  };
}

export async function setUserRole(uid: string, role: 'admin' | 'user'): Promise<void> {
  if (!db) return;
  await updateDoc(doc(db, 'users', uid), { role });
}
