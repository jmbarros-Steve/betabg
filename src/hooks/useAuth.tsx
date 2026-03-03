import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface SignUpResult {
  error: Error | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;
        console.log('[Auth] onAuthStateChange:', event, session?.user?.email);
        setSession(session);
        setUser(session?.user ?? null);
      }
    );

    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;
        
        console.log('[Auth] getSession:', session?.user?.email ?? 'no session');
        setSession(session);
        setUser(session?.user ?? null);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string): Promise<SignUpResult> => {
    // Use edge function to create user with auto-confirmed email
    const { data: fnData, error: fnError } = await supabase.functions.invoke('self-signup', {
      body: { email, password },
    });

    if (fnData?.error) {
      return { error: new Error(fnData.error) };
    }
    if (fnError) {
      // Try to read actual error from response body
      try {
        const body = await (fnError as any).context?.json?.();
        if (body?.error) return { error: new Error(body.error) };
      } catch { /* ignore */ }
      return { error: new Error(fnError.message) };
    }

    // User created (or already exists) — sign in to establish session
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: signInError };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    // If email not confirmed, auto-confirm via edge function and retry
    if (error?.message?.includes('Email not confirmed')) {
      const { error: confirmError } = await supabase.functions.invoke('self-signup', {
        body: { email, password, action: 'confirm' },
      });
      if (!confirmError) {
        const { error: retryError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        return { error: retryError };
      }
    }

    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
