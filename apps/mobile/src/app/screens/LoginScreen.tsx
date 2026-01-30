// apps/mobile/src/app/screens/LoginScreen.tsx

import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";

import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import ScreenLayout from "../components/layout/ScreenLayout";
import ScreenHeader from "../components/layout/ScreenHeader";
import { supabase } from "../lib/supabase";

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config/env";

import { request } from "../api/http";
import { useAuthStore } from "../store/authStore";

WebBrowser.maybeCompleteAuthSession();

type Provider = "google" | "kakao";

export default function LoginScreen() {
  const [loading, setLoading] = useState<Provider | null>(null);
  const auth = useAuthStore();

  const handleOAuth = async (provider: Provider) => {
    if (loading) return;
    setLoading(provider);

    try {
      // In Expo Go, redirect back to the expo-router route `/oauth`.
      const redirectTo = Linking.createURL("oauth");
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

        // Exchange Supabase identity for our SERVER JWT (required for /api/bootstrap, /api/plans, ...)
        const { data: userRes, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userRes?.user) {
          console.error("getUser error:", userErr);
          return;
        }

        const u = userRes.user;

        const payload = {
          provider,
          providerId: u.id,
          email: u.email ?? "",
          name:
            (u.user_metadata?.full_name as string) ||
            (u.user_metadata?.name as string) ||
            u.email ||
            "User",
          profileImageUri: (u.user_metadata?.avatar_url as string) ?? null,
        };

        try {
          const res = await request<{ token: string }>("/api/auth/sign-in", {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });

          if (!res?.token) {
            console.error("/api/auth/sign-in did not return token");
            return;
          }

          await auth.setServerToken(res.token);
          console.log("[auth] serverToken length:", res.token.length);
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
