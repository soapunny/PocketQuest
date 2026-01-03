import { useLayoutEffect, useMemo } from "react";
import { View, Text, StyleSheet, Image, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";

import { useAuth } from "../lib/authStore";
import { usePlan } from "../lib/planStore";
import { useTransactions } from "../lib/transactionsStore";
import { computeAllTimePlanProgressPercent } from "../lib/planProgress";
import ScreenHeader from "../components/layout/ScreenHeader";
import ScreenLayout from "../components/layout/ScreenLayout";
import ScreenCard from "../components/layout/ScreenCard";
import { CardSpacing } from "../components/Typography";
import type { Currency } from "../lib/currency";
import { formatMoney, convertMinor } from "../lib/currency";

function absMinor(n: any) {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.abs(v);
}

function txToHomeMinor(tx: any, homeCurrency: Currency): number {
  const currency: Currency = tx?.currency === "KRW" ? "KRW" : "USD";

  // Prefer new field; fallback to legacy amountMinor
  const rawAmount =
    typeof tx?.amountMinor === "number"
      ? tx.amountMinor
      : typeof tx?.amountMinor === "number"
      ? tx.amountMinor
      : 0;

  if (!Number.isFinite(rawAmount) || rawAmount === 0) return 0;

  const sign = rawAmount < 0 ? -1 : 1;
  const amountAbs = absMinor(rawAmount);

  if (currency === homeCurrency) return sign * amountAbs;

  const fx = typeof tx?.fxUsdKrw === "number" ? tx.fxUsdKrw : NaN;
  // If FX is missing, treat as 0 so we don't lie in totals.
  if (!Number.isFinite(fx) || fx <= 0) return 0;

  const convertedAbs = absMinor(
    convertMinor(amountAbs, currency, homeCurrency, fx)
  );
  return sign * convertedAbs;
}

function txToHomeAbsMinor(tx: any, homeCurrency: Currency): number {
  return absMinor(txToHomeMinor(tx, homeCurrency));
}

export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const { user, updateUser } = useAuth();
  const { plan, language, homeCurrency } = usePlan();
  const isKo = language === "ko";
  const tr = (en: string, ko: string) => (isKo ? ko : en);
  const { transactions } = useTransactions();

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

  const profileName = user?.name || "User";
  const profileEmail = user?.email || "";
  const profileImageUri = user?.profileImageUri || null;

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
