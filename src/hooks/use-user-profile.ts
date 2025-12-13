import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserProfile, UserProfile } from '@/lib/ikamba-remit';
import { isFirebaseConfigured } from '@/lib/firebase';

interface UseUserProfileResult {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

// Lightweight cache TTL (same as ikamba-remit cache) to avoid rapid refetches
const CACHE_TTL = 5 * 60 * 1000;
let cachedProfile: { data: UserProfile | null; timestamp: number } | null = null;

export function useUserProfile(): UseUserProfileResult {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const authFallback: UserProfile | null = useMemo(() => {
    if (!user) return null;
    return {
      id: user.uid,
      email: user.email,
      displayName: user.displayName,
      fullName: user.displayName || undefined,
      firstName: user.displayName?.split(' ')?.[0],
      lastName: user.displayName?.split(' ')?.slice(1).join(' '),
      phoneNumber: user.phoneNumber,
      photoURL: user.photoURL,
      avatarUrl: user.photoURL,
      country: undefined,
      countryCode: undefined,
      role: 'user',
    };
  }, [user]);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    // Serve from tiny cache to keep UI snappy when switching screens
    if (cachedProfile && Date.now() - cachedProfile.timestamp < CACHE_TTL) {
      setProfile(cachedProfile.data);
      setLoading(false);
      return;
    }

    if (!isFirebaseConfigured) {
      setProfile(authFallback);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const profileData = await getUserProfile(user.uid);
      const mergedProfile = profileData
        ? { ...authFallback, ...profileData }
        : authFallback;

      cachedProfile = { data: mergedProfile, timestamp: Date.now() };
      setProfile(mergedProfile);
    } catch (err) {
      console.error('Failed to fetch user profile', err);
      setError(err instanceof Error ? err.message : 'Unable to load profile');
      setProfile(authFallback);
    } finally {
      setLoading(false);
    }
  }, [authFallback, user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return { profile, loading, error, refresh: fetchProfile };
}
