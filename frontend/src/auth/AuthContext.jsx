import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../lib/supabase.js';

const AuthContext = createContext(null);
const supabase = getSupabaseClient();

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

    const initialise = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setSession(data.session ?? null);
      await hydrateProfile(data.session?.user ?? null);
      if (active) setLoading(false);
    };

    initialise();

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession ?? null);

      if (event === 'SIGNED_OUT') {
        setProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      // Defer Supabase calls out of the auth callback to avoid deadlocks.
      Promise.resolve().then(async () => {
        await hydrateProfile(nextSession?.user ?? null);
        if (active) setLoading(false);
      });
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [hydrateProfile]);

  const signIn = useCallback(async (email, password) => {
    if (!supabase) throw new Error('Authentication is not configured.');
    setError(null);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      throw signInError;
    }
    setSession(data.session ?? null);
    return hydrateProfile(data.user);
  }, [hydrateProfile]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
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
    const { data } = await supabase.auth.getUser();
    return hydrateProfile(data.user);
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
