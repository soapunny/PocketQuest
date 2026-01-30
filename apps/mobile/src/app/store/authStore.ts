// apps/mobile/src/app/store/authStore.ts

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";

type AuthStore = {
  // Supabase session (OAuth + refresh, etc.)
  session: Session | null;

  // Supabase access token (NOT used for our API auth)
  supabaseAccessToken: string | null;

  // Our server JWT issued by /api/auth/sign-in (used for /api/bootstrap, /api/plans, ...)
  serverToken: string | null;

  // Back-compat: `token` means SERVER JWT for our API layer.
  token: string | null;

  isAuthenticated: boolean;
  isLoading: boolean;

  // Store the server JWT after successful /api/auth/sign-in
  setServerToken: (token: string | null) => Promise<void>;

  signInWithPassword: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthStore | null>(null);

const SERVER_TOKEN_KEY = "pq_server_jwt";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [serverToken, setServerTokenState] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    // Load persisted server JWT (used for our API auth)
    AsyncStorage.getItem(SERVER_TOKEN_KEY)
      .then((t) => {
        if (!isMounted) return;
        setServerTokenState(t ?? null);
      })
      .catch(() => {
        // ignore
      });

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
        if (!s) {
          setServerTokenState(null);
          AsyncStorage.removeItem(SERVER_TOKEN_KEY).catch(() => {});
        }
      },
    );

    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const store = useMemo<AuthStore>(() => {
    const supabaseAccessToken = session?.access_token ?? null;
    const token = serverToken ?? null;
    return {
      session,
      supabaseAccessToken,
      serverToken,
      token,
      isAuthenticated: !!token,
      isLoading,
      setServerToken: async (next) => {
        setServerTokenState(next);
        if (!next) {
          await AsyncStorage.removeItem(SERVER_TOKEN_KEY).catch(() => {});
          return;
        }
        await AsyncStorage.setItem(SERVER_TOKEN_KEY, next).catch(() => {});
      },
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
        setServerTokenState(null);
        await AsyncStorage.removeItem(SERVER_TOKEN_KEY).catch(() => {});
      },
    };
  }, [session, serverToken, isLoading]);

  return React.createElement(Ctx.Provider, { value: store }, children);
}

export function useAuthStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuthStore must be used within AuthProvider");
  return v;
}
