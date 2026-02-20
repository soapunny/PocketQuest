// apps/mobile/src/app/screens/LoginScreen.tsx

import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";

import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";

import ScreenLayout from "../components/layout/ScreenLayout";
import ScreenHeader from "../components/layout/ScreenHeader";
import { supabase } from "../lib/supabase";

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config/env";

import { request } from "../api/http";
import { useAuthStore } from "../store/authStore";
import { OAuthProvider } from "@pq/shared/auth";

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [loading, setLoading] = useState<OAuthProvider | null>(null);
  const auth = useAuthStore();

  const handleOAuth = async (provider: OAuthProvider) => {
    if (loading) return;
    setLoading(provider);

    try {
      // In Expo Go, redirect back to the expo-router route `/oauth`.
      // NOTE: `useProxy` was removed/deprecated from `makeRedirectUri` in newer `expo-auth-session`.
      // The redirect host (LAN vs tunnel/exp.direct) will match how Metro is running.
      // For the most stable OAuth in Expo Go, prefer running Metro with `--tunnel`.
      const redirectTo = AuthSession.makeRedirectUri({
        path: "oauth",
      });

      console.log("redirectTo:", redirectTo);

      console.log(
        "SUPABASE_URL:",
        SUPABASE_URL,
        "SUPABASE_ANON_KEY:",
        SUPABASE_ANON_KEY,
      );

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: true,

          // Always force account re-selection
          queryParams: {
            prompt: "select_account",
          },
        },
      });

      if (error) {
        console.error("signInWithOAuth error:", error);
        return;
      }

      const authUrl = data?.url;
      if (!authUrl) {
        console.error("Missing auth URL from Supabase");
        return;
      }

      // Use an auth session so the redirect is captured (prevents falling back to Site URL/localhost).
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);
      console.log("oauth result:", result);
      console.log("authUrl:", authUrl);

      if (result.type === "success" && result.url) {
        // Tokens are returned in the URL fragment (#access_token=...)
        const parsed = new URL(result.url.replace("#", "?"));

        const access_token = parsed.searchParams.get("access_token");
        const refresh_token = parsed.searchParams.get("refresh_token");

        if (!access_token || !refresh_token) {
          console.error("OAuth success but tokens missing in callback URL");
          return;
        }

        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });

        if (error) {
          console.error("setSession error:", error);
          return;
        }
        // New policy (Option 1):
        // - Do NOT exchange for a server JWT
        // - Send Supabase access_token to our backend via Authorization header
        // - Backend verifies the token with Supabase and syncs internal user

        try {
          // Call backend to sync/create internal user based on verified Supabase identity.
          // No JSON body needed.
          await request("/api/auth/sign-in", {
            method: "POST",
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${access_token}`,
            },
          });

          // If you still need to persist something locally, store Supabase session only.
          // (Server JWT is no longer used)
          console.log(
            "[auth] Supabase token sent to backend for verification/sync",
          );
        } catch (e) {
          console.error("/api/auth/sign-in failed:", e);
          return;
        }
      } else {
        console.warn("OAuth cancelled/failed:", result);
      }
    } catch (e) {
      console.error("OAuth start failed:", e);
    } finally {
      setLoading(null);
    }
  };

  return (
    <ScreenLayout
      header={<ScreenHeader title="Welcome" subtitle="Sign in to continue" />}
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Sign In</Text>
        <Text style={styles.subTitle}>
          Choose a sign-in method to get started
        </Text>

        <Pressable
          onPress={() => handleOAuth("google")}
          style={[styles.button, styles.google, loading && styles.disabled]}
          disabled={!!loading}
        >
          <Text style={styles.buttonText}>
            {loading === "google" ? "Signing in…" : "Continue with Google"}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => handleOAuth("kakao")}
          style={[styles.button, styles.kakao, loading && styles.disabled]}
          disabled={!!loading}
        >
          <Text style={[styles.buttonText, styles.kakaoText]}>
            {loading === "kakao" ? "Signing in…" : "Continue with Kakao"}
          </Text>
        </Pressable>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: "700" },
  subTitle: { fontSize: 13, opacity: 0.7, marginBottom: 8 },
  button: {
    height: 54,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  google: { backgroundColor: "#4285F4" },
  kakao: { backgroundColor: "#FEE500" },
  buttonText: { color: "#fff", fontWeight: "700" },
  kakaoText: { color: "#000" },
  disabled: { opacity: 0.6 },
});
