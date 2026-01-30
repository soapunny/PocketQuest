import { useEffect } from "react";
import { View, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { supabase } from "./lib/supabase";

export default function OAuthCallbackScreen() {
  console.log("OAUTH ROUTE MOUNTED");
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string;
    error?: string;
    error_code?: string;
    error_description?: string;
  }>();

  useEffect(() => {
    (async () => {
      try {
        if (params?.error || params?.error_description) {
          console.error("OAuth callback error:", {
            error: params?.error,
            error_code: params?.error_code,
            error_description: params?.error_description,
          });
          return;
        }

        const code = params?.code;
        if (!code || typeof code !== "string") {
          console.error("OAuth callback missing code param:", params);
          return;
        }

        console.log("oauth code:", code);

        // ✅ auth code만 넘겨야 함 (PKCE verifier는 storage에서 읽음)
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) console.error("exchangeCodeForSession error:", error);
      } catch (e) {
        console.error("OAuth callback failed:", e);
      } finally {
        router.replace("/");
      }
    })();
  }, [params, router]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Signing you in…</Text>
    </View>
  );
}
