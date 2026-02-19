// apps/mobile/src/app/oauth.tsx

import { useEffect, useRef } from "react";
import { View, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { supabase } from "./lib/supabase";

export default function OAuthCallbackScreen() {
  const router = useRouter();
  const handledCodeRef = useRef<string | null>(null);
  const params = useLocalSearchParams<{
    code?: string;
    error?: string;
    error_code?: string;
    error_description?: string;
  }>();
  const code = typeof params?.code === "string" ? params.code : null;

  useEffect(() => {
    (async () => {
      try {
        if (params?.error || params?.error_description) {
          console.error("OAuth callback error:", {
            error: params?.error,
            error_code: params?.error_code,
            error_description: params?.error_description,
          });
          router.replace("/login");
          return;
        }

        if (!code) {
          console.error("OAuth callback missing code param:", params);
          router.replace("/login");
          return;
        }

        if (handledCodeRef.current === code) {
          // Prevent duplicate exchanges on re-render / StrictMode
          return;
        }
        handledCodeRef.current = code;

        console.log("oauth code:", code);

        // ✅ Only pass auth code (PKCE verifier is read from storage)
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error("exchangeCodeForSession error:", error);
          router.replace("/login");
          return;
        }

        // Confirm session exists before entering app
        const { data } = await supabase.auth.getSession();
        const hasSession = !!data?.session?.access_token;
        if (!hasSession) {
          console.error("OAuth exchange succeeded but session is missing");
          router.replace("/login");
          return;
        }

        router.replace("/");
      } catch (e) {
        console.error("OAuth callback failed:", e);
        router.replace("/login");
      }
    })();
  }, [
    code,
    params?.error,
    params?.error_code,
    params?.error_description,
    router,
  ]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Signing you in…</Text>
    </View>
  );
}
