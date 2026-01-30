import { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

import { useAuthStore } from "../store/authStore";
import { usePlanStore } from "../store/planStore";
import { useUserPrefsStore } from "../store/userPrefsStore";
import { useDashboardStore } from "../store/dashboardStore";

import { useBootStrap } from "../hooks/useBootStrap";

export default function BootstrapScreen() {
  const navigation = useNavigation<any>();
  const auth = useAuthStore();
  const isAuthenticated = (auth as any)?.isAuthenticated;
  const { isInitialized: isPlanHydrated } = usePlanStore();
  const isPrefsHydrated = useUserPrefsStore((s) => s.isHydrated);
  const isDashboardHydrated = useDashboardStore((s) => s.isHydrated);
  const { isBootstrapping, bootstrapError, runBootstrap } = useBootStrap();

  const ranOnceRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (ranOnceRef.current) return;
    ranOnceRef.current = true;
    void runBootstrap();
  }, [isAuthenticated, runBootstrap]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (bootstrapError) return;
    if (!isPrefsHydrated || !isPlanHydrated || !isDashboardHydrated) return;
    navigation.replace("Tabs");
  }, [
    bootstrapError,
    isAuthenticated,
    isDashboardHydrated,
    isPlanHydrated,
    isPrefsHydrated,
    navigation,
  ]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#4285F4" />
      <Text style={styles.title}>Loading…</Text>

      {bootstrapError ? (
        <>
          <Text style={styles.errorText}>{bootstrapError}</Text>
          <Pressable
            onPress={() => {
              ranOnceRef.current = false;
              void runBootstrap();
            }}
            disabled={isBootstrapping}
            style={({ pressed }) => [
              styles.button,
              pressed && { opacity: 0.85 },
              isBootstrapping && { opacity: 0.5 },
            ]}
          >
            <Text style={styles.buttonText}>Retry</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f7f7f7",
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111",
  },
  errorText: {
    marginTop: 8,
    color: "#b42318",
    fontWeight: "700",
    textAlign: "center",
  },
  button: {
    marginTop: 10,
    backgroundColor: "black",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  buttonText: {
    color: "white",
    fontWeight: "800",
  },
});
