// apps/mobile/src/app/store/authStore.ts

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type AuthStore = {
  // Supabase session (OAuth + refresh, etc.)
  session: Session | null;

  // Supabase access token
  supabaseAccessToken: string | null;

  isAuthenticated: boolean;
  isLoading: boolean;

  signInWithPassword: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthStore | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data }: { data: { session: Session | null } }) => {
        if (!isMounted) return;
        setSession(data.session ?? null);
        setIsLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        setIsLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event: string, s: Session | null) => {
        if (!isMounted) return;
        setSession(s ?? null);
        setIsLoading(false);
      },
    );

    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const store = useMemo<AuthStore>(() => {
    const supabaseAccessToken = session?.access_token ?? null;

    return {
      session,
      supabaseAccessToken,
      isAuthenticated: !!supabaseAccessToken,
      isLoading,
      signInWithPassword: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      },
      signOut: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
    };
  }, [session, isLoading]);

  return React.createElement(Ctx.Provider, { value: store }, children);
}

export function useAuthStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuthStore must be used within AuthProvider");
  return v;
}
