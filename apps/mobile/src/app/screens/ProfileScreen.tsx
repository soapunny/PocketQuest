// apps/mobile/src/app/screens/ProfileScreen.tsx

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Image, Pressable } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";

import ScreenHeader from "../components/layout/ScreenHeader";
import ScreenLayout from "../components/layout/ScreenLayout";
import ScreenCard from "../components/layout/ScreenCard";
import { CardSpacing } from "../components/Typography";

import { useAuthStore } from "../store/authStore";
import { usePlan } from "../store/planStore";
import { useTransactions } from "../store/transactionsStore";

import {
  computeAllTimePlanProgressPercent,
  txToHomeAbsMinor,
} from "../domain/plan/progress";
import { formatMoney, convertMinor, absMinor } from "../domain/money";

export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const { session } = useAuthStore();
  const supaUser = session?.user ?? null;
  const { plan, language, homeCurrency } = usePlan();
  const isKo = language === "ko";
  const tr = (en: string, ko: string) => (isKo ? ko : en);
  const { transactions } = useTransactions();

  const [storedProfileImageUri, setStoredProfileImageUri] = useState<
    string | null
  >(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const v = await AsyncStorage.getItem("pq_profile_image_uri");
        if (!isMounted) return;
        setStoredProfileImageUri(v ? String(v) : null);
      } catch {
        // ignore
      }
    };

    // Load on mount
    load();

    // Reload whenever screen regains focus (after closing modal)
    const unsub = navigation.addListener("focus", () => {
      load();
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, [navigation]);

  // 전체 기간 동안 총 계획 달성률
  const allTimeProgressPercent = useMemo(() => {
    return computeAllTimePlanProgressPercent(plan, transactions);
  }, [plan, transactions]);

  // 전체 기간 동안 총 저축액
  const allTimeTotalSaved = useMemo(() => {
    let sum = 0;
    for (const tx of transactions) {
      if ((tx as any).type === "SAVING") {
        sum += txToHomeAbsMinor(tx, homeCurrency);
      }
    }
    return sum;
  }, [transactions, homeCurrency]);

  const profileEmail = supaUser?.email ?? "";
  const profileName =
    String(
      (supaUser?.user_metadata as any)?.full_name ??
        (supaUser?.user_metadata as any)?.name ??
        (profileEmail ? profileEmail.split("@")[0] : "")
    ) || "User";
  const profileImageUri =
    storedProfileImageUri ||
    (supaUser?.user_metadata as any)?.avatar_url ||
    (supaUser?.user_metadata as any)?.picture ||
    null;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate("Settings")}
          style={{ paddingHorizontal: 12 }}
        >
          <Text style={{ fontSize: 18 }}>⚙️</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  return (
    <ScreenLayout
      header={
        <ScreenHeader
          title={tr("Profile", "프로필")}
          subtitle={tr("Your profile and statistics", "프로필 및 통계")}
        />
      }
    >
      {/* 개인정보 섹션 */}
      <ScreenCard>
        <View style={styles.profileHeader}>
          <Pressable
            onPress={() =>
              navigation.navigate("ProfileImageModal", {
                profileImageUri,
                profileName,
              })
            }
            style={styles.profileImageContainer}
          >
            {profileImageUri ? (
              <Image
                source={{ uri: profileImageUri }}
                style={styles.profileImage}
              />
            ) : (
              <View style={styles.profileImagePlaceholder}>
                <Text style={styles.profileImagePlaceholderText}>
                  {profileName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </Pressable>
          <View style={styles.profileInfo}>
            <Text style={CardSpacing.cardTitle}>{profileName}</Text>
            <Text style={styles.profileEmail}>{profileEmail}</Text>
          </View>
        </View>
      </ScreenCard>

      {/* 전체 기간 통계 */}
      <Text style={CardSpacing.section}>
        {tr("All Time Statistics", "전체 기간 통계")}
      </Text>

      <ScreenCard style={styles.statCard}>
        <Text style={CardSpacing.cardTitle}>
          {tr("Plan Achievement Rate", "계획 달성률")}
        </Text>
        <Text style={styles.statValue}>{allTimeProgressPercent}%</Text>
        <Text style={CardSpacing.description}>
          {tr(
            "Overall plan completion rate across all periods",
            "모든 기간에 걸친 전체 계획 완료율"
          )}
        </Text>
      </ScreenCard>

      <ScreenCard>
        <Text style={CardSpacing.cardTitle}>
          {tr("Total Savings", "총 저축액")}
        </Text>
        <Text style={styles.statValue}>
          {formatMoney(allTimeTotalSaved, homeCurrency)}
        </Text>
        <Text style={CardSpacing.description}>
          {tr(
            "Total amount saved across all periods",
            "모든 기간에 걸쳐 저축한 총 금액"
          )}
        </Text>
      </ScreenCard>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  profileImageContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: "hidden",
  },
  profileImage: {
    width: 80,
    height: 80,
  },
  profileImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#ddd",
    alignItems: "center",
    justifyContent: "center",
  },
  profileImagePlaceholderText: {
    fontSize: 32,
    fontWeight: "700",
    color: "#666",
  },
  profileInfo: {
    flex: 1,
  },
  profileEmail: {
    marginTop: 4,
    color: "#666",
    fontSize: 14,
  },
  statValue: {
    marginTop: 8,
    fontSize: 24,
    fontWeight: "900",
    color: "#111",
  },
  statCard: {
    marginBottom: 12,
  },
});
