import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { sessionRecovery } from '../services/lifecycle.js';
import { getSupabaseClient } from '../lib/supabase.js';

const AuthContext = createContext(null);
const supabase = getSupabaseClient();

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const generationRef = useRef(0);
  const hydratedUserIdRef = useRef(null);

  const hydrateProfile = useCallback(async (user) => {
    if (!supabase || !user) {
      setProfile(null);
      return null;
    }

    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, role, is_active, phone')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      setError('Unable to load your profile. Please sign in again.');
      setProfile(null);
      return null;
    }

    if (!data || !data.is_active) {
      setError('This account profile is missing or inactive.');
      setProfile(null);
      return null;
    }

    setError(null);
    setProfile(data);
    return data;
  }, []);

  useEffect(() => {
    if (!supabase) {
      setError('Supabase is not configured. Add the publishable key to frontend/.env.local.');
      setLoading(false);
      return undefined;
    }

    let active = true;
    let deferredTimer = null;

    const applySession = async (nextSession) => {
      const user = nextSession?.user ?? null;
      const requestId = ++generationRef.current;
      setSession(nextSession ?? null);

      if (!user) {
        hydratedUserIdRef.current = null;
        setProfile(null);
        setError(null);
        setLoading(false);
        return;
      }

      if (hydratedUserIdRef.current === user.id) {
        setLoading(false);
        return;
      }

      setLoading(true);
      let profileData = null;
      try {
        profileData = await hydrateProfile(user);
      } catch {
        setError('Unable to load your profile. Please sign in again.');
      }

      if (!active || requestId !== generationRef.current) return;
      hydratedUserIdRef.current = profileData ? user.id : null;
      setLoading(false);
    };

    const initialise = async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (!active) return;
        if (sessionError) throw sessionError;
        await applySession(data.session ?? null);
      } catch {
        if (!active) return;
        generationRef.current += 1;
        hydratedUserIdRef.current = null;
        setSession(null);
        setProfile(null);
        setError('Unable to read your session. Sign in again.');
        setLoading(false);
      }
    };

    initialise();

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      clearTimeout(deferredTimer);
      deferredTimer = setTimeout(() => {
        if (!active) return;
        applySession(nextSession ?? null);
      }, 0);
    });

    const unsubscribeInvalid = sessionRecovery.onInvalidSession(({ userId }) => {
      if (!active) return;
      if (userId && hydratedUserIdRef.current && userId !== hydratedUserIdRef.current) return;
      clearTimeout(deferredTimer);
      generationRef.current += 1;
      hydratedUserIdRef.current = null;
      setSession(null);
      setProfile(null);
      setError('Your session has expired. Sign in again.');
      setLoading(false);
      void supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    });

    return () => {
      active = false;
      clearTimeout(deferredTimer);
      generationRef.current += 1;
      listener.subscription.unsubscribe();
      unsubscribeInvalid();
    };
  }, [hydrateProfile]);

  const signIn = useCallback(
    async (email, password) => {
      if (!supabase) throw new Error('Authentication is not configured.');
      setError(null);
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        throw signInError;
      }
      generationRef.current += 1;
      const requestId = generationRef.current;
      setSession(data.session ?? null);
      const profileData = await hydrateProfile(data.user);
      if (profileData && requestId === generationRef.current) {
        hydratedUserIdRef.current = data.user.id;
      }
      return profileData;
    },
    [hydrateProfile],
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
    generationRef.current += 1;
    hydratedUserIdRef.current = null;
    setSession(null);
    setProfile(null);
    setError(null);
  }, []);

  const requestPasswordReset = useCallback(async (email) => {
    if (!supabase) throw new Error('Authentication is not configured.');
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (resetError) throw resetError;
  }, []);

  const updatePassword = useCallback(async (password) => {
    if (!supabase) throw new Error('Authentication is not configured.');
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) throw updateError;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!supabase) return null;
    const { data, error: userError } = await supabase.auth.getUser();
    if (userError) {
      setError(userError.message);
      return null;
    }
    const profileData = await hydrateProfile(data.user);
    if (profileData) hydratedUserIdRef.current = data.user?.id ?? null;
    return profileData;
  }, [hydrateProfile]);

  const value = useMemo(
    () => ({
      supabase,
      session,
      user: session?.user ?? null,
      profile,
      role: profile?.role ?? null,
      loading,
      error,
      signIn,
      signOut,
      requestPasswordReset,
      updatePassword,
      refreshProfile,
    }),
    [session, profile, loading, error, signIn, signOut, requestPasswordReset, updatePassword, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
