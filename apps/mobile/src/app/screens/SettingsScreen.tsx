// apps/mobile/src/app/screens/SettingsScreen.tsx

import React, { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert } from "react-native";
import ScreenHeader from "../components/layout/ScreenHeader";
import ScreenLayout from "../components/layout/ScreenLayout";
import { SegmentControl } from "../components/SegmentControl";
import { Colors, FontSize, FontWeight, Radius, Spacing } from "../theme";

import type { Currency } from "@pq/shared/money/types";

import { useAuthStore } from "../store/authStore";
import { makeTr } from "../domain/i18n";
import { useDashboardStore } from "../store/dashboardStore";
import { useUserPrefsStore } from "../store/userPrefsStore";
import { userApi } from "../api/userApi";
import { usePlan, type PeriodType } from "../store/planStore";

const OPTIONS: Array<{ label: string; value: PeriodType; help: string }> = [
  { label: "Weekly", value: "WEEKLY", help: "Resets every Monday." },
  {
    label: "Bi-weekly",
    value: "BIWEEKLY",
    help: "2-week blocks (anchor-based).",
  },
  {
    label: "Monthly",
    value: "MONTHLY",
    help: "Calendar month (1st to last day).",
  },
];

const CURRENCY_OPTIONS: Array<{ label: string; value: Currency }> = [
  { label: "USD ($)", value: "USD" },
  { label: "KRW (₩)", value: "KRW" },
];

const LANGUAGE_OPTIONS: Array<{ label: string; value: "en" | "ko" }> = [
  { label: "English", value: "en" },
  { label: "한국어", value: "ko" },
];

export default function SettingsScreen() {
  const { plan, setPeriodType, switchPeriodType, switchPlanCurrency } =
    usePlan();

  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const auth = useAuthStore();
  const serverToken = (auth as any)?.serverToken as string | null | undefined;

  const {
    language,
    setLanguage,
    advancedCurrencyMode,
    setAdvancedCurrencyMode,
    homeCurrency,
    displayCurrency,
    setHomeCurrency,
    setDisplayCurrency,
    cashflowCarryoverEnabled,
    cashflowCarryoverMode,
    setCashflowCarryoverEnabled,
    setCashflowCarryoverMode,
  } = useUserPrefsStore();

  const current = (plan.periodType ?? "MONTHLY") as PeriodType;
  const isAdvanced = !!advancedCurrencyMode;

  const combinedCurrency = useMemo<Currency>(() => {
    const planCurrency = (plan as any)?.currency as Currency | undefined;
    return (planCurrency ??
      displayCurrency ??
      homeCurrency ??
      "USD") as Currency;
  }, [plan, displayCurrency, homeCurrency]);

  const lang = (language ?? "en") as "en" | "ko";
  const isKo = lang === "ko"; // kept for JSX branching (Tip infoBox has nested <Text> components)
  const tr = makeTr(language);

  const onPressLogout = () => {
    if (isLoggingOut) return;

    Alert.alert(
      tr("Logout", "로그아웃"),
      tr("Are you sure you want to log out?", "정말 로그아웃하시겠습니까?"),
      [
        { text: tr("Cancel", "취소"), style: "cancel" },
        {
          text: tr("Logout", "로그아웃"),
          style: "destructive",
          onPress: async () => {
            if (isLoggingOut) return;

            setIsLoggingOut(true);

            try {
              // 1) 즉시 Dashboard 잔상 제거
              useDashboardStore.getState().resetDashboard();

              // 2) auth 토큰 제거 (RootNavigator가 Login으로 전환됨)
              await auth.signOut();

              // RootNavigator의 auth gate가 로그아웃 직후 Login 트리를 렌더링하므로
              // 여기서 navigation.reset()은 필요 없고, 타이밍에 따라 RESET not handled 에러가 날 수 있음.
            } catch (e) {
              Alert.alert(
                tr("Logout failed", "로그아웃 실패"),
                tr("Please try again.", "다시 시도해 주세요."),
              );
            } finally {
              setIsLoggingOut(false);
            }
          },
        },
      ],
    );
  };

  return (
    <ScreenLayout
      header={
        <ScreenHeader
          title={tr("Settings", "설정")}
          subtitle={tr("Customize PocketQuest", "PocketQuest 사용자 설정")}
        />
      }
    >
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{tr("Language", "언어")}</Text>
        <Text style={styles.help}>
          {tr("Choose the language used in the app.", "앱에서 사용할 언어를 선택하세요.")}
        </Text>

        <SegmentControl
          options={LANGUAGE_OPTIONS}
          value={lang}
          onChange={setLanguage}
        />

        <Text style={styles.help}>
          {tr("* Some screens are still being translated.", "* 일부 화면은 아직 번역 중입니다.")}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {tr("Planning period", "계획 기간")}
        </Text>
        <Text style={styles.help}>
          {tr("Choose how goals and progress are grouped.", "목표와 진행률이 묶이는 기간을 선택하세요.")}
        </Text>

        <SegmentControl
          options={OPTIONS}
          value={current}
          onChange={async (val) => {
            const ok = await switchPeriodType(val);
            if (!ok) setPeriodType(val);
          }}
        />

        <Text style={styles.selectedLine}>
          {tr("Current:", "현재:")}{" "}
          <Text style={{ fontWeight: FontWeight.black }}>
            {OPTIONS.find((o) => o.value === current)?.label}
          </Text>
        </Text>
        <Text style={styles.help}>
          {OPTIONS.find((o) => o.value === current)?.help}
        </Text>

        {/* Server-driven: no client-side anchor/boundary calculations */}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{tr("Currency", "통화")}</Text>
        <Text style={styles.help}>
          {tr(
            "Choose one currency (simple) or enable advanced mode to separate base totals and display.",
            "단일 통화(간단) 또는 고급 모드로 기준 통화와 표시 통화를 분리할 수 있어요.",
          )}
        </Text>

        <Text style={[styles.help, { marginTop: 10, fontWeight: FontWeight.black }]}>
          {tr("Advanced", "고급")}
        </Text>
        <Text style={styles.help}>
          {tr(
            "Keep it simple with one currency, or enable advanced mode to separate base totals from display/entry currency.",
            "기본은 하나의 통화로 단순하게 쓰고, 필요할 때만 고급 모드를 켜세요.",
          )}
        </Text>

        <SegmentControl
          options={[
            { label: tr("Off", "끔"), value: false },
            { label: tr("On", "켬"), value: true },
          ]}
          value={isAdvanced}
          onChange={setAdvancedCurrencyMode}
        />

        {isAdvanced ? (
          <>
            <Text style={[styles.help, { marginTop: 10, fontWeight: FontWeight.black }]}>
              {tr("Home currency", "기준 통화(Home)")}
            </Text>
            <Text style={styles.help}>
              {tr(
                "Used as the base for totals and progress. Existing transactions keep their original currency. If a transaction is in a different currency, it uses the saved FX snapshot (if available).",
                "총합/진행률 계산 기준 통화입니다. 기존 거래는 원래 통화를 유지하며, 다른 통화 거래는 저장된 환율 스냅샷(FX)을 사용합니다(가능한 경우).",
              )}
            </Text>
            <SegmentControl
              options={CURRENCY_OPTIONS}
              value={homeCurrency}
              onChange={setHomeCurrency}
            />

            <Text style={[styles.help, { marginTop: 6, fontWeight: FontWeight.black }]}>
              {tr("Display currency", "표시 통화(Display)")}
            </Text>
            <Text style={styles.help}>
              {tr(
                "How amounts are shown in the UI. New transactions are added in this currency.",
                "화면에 표시되는 통화입니다. 새 거래는 이 통화로 추가됩니다.",
              )}
            </Text>
            <SegmentControl
              options={CURRENCY_OPTIONS}
              value={displayCurrency}
              onChange={setDisplayCurrency}
            />

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>{tr("Tip", "팁")}</Text>
              <Text style={styles.help}>
                {isKo ? (
                  <>
                    <Text style={{ fontWeight: FontWeight.black }}>Home</Text>은
                    총합/진행률 기준,
                    <Text style={{ fontWeight: FontWeight.black }}> Display</Text>는 일상
                    입력/표시용으로 쓰면 좋아요.
                  </>
                ) : (
                  <>
                    Keep{" "}
                    <Text style={{ fontWeight: FontWeight.black }}>Home currency</Text> as
                    the currency you want for totals and progress. Use{" "}
                    <Text style={{ fontWeight: FontWeight.black }}>Display currency</Text>{" "}
                    for day-to-day entry and reading.
                  </>
                )}
              </Text>
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.help, { marginTop: 6, fontWeight: FontWeight.black }]}>
              {tr("Currency", "통화")}
            </Text>
            <Text style={styles.help}>
              {tr("Used for totals, goals, and new transactions.", "총합/목표/새 거래 입력에 모두 사용됩니다.")}
            </Text>

            <SegmentControl
              options={CURRENCY_OPTIONS}
              value={combinedCurrency}
              onChange={async (val) => {
                setHomeCurrency(val);
                setDisplayCurrency(val);
                const ok = await switchPlanCurrency(val);
                if (!ok) {
                  console.warn(
                    "[SettingsScreen] switchPlanCurrency failed; kept local currency",
                  );
                }
              }}
            />

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>{tr("Note", "안내")}</Text>
              <Text style={styles.help}>
                {tr(
                  "Existing transactions keep their original currency. If you switch currency later, totals will use FX snapshots when available.",
                  "기존 거래는 원래 통화를 유지합니다. 통화를 바꾸면, 총합은 저장된 환율 스냅샷(FX)을 사용할 수 있어요.",
                )}
              </Text>
            </View>
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {tr("Cashflow carryover", "캐시플로우 이월")}
        </Text>
        <Text style={styles.help}>
          {tr(
            "When enabled, remaining balance carries over into the next period. (Mode: Rolling)",
            "이월을 켜면 이전 기간의 잔액이 다음 기간 계산에 반영됩니다. (현재: Rolling)",
          )}
        </Text>

        <SegmentControl
          options={[
            { label: tr("Off", "끔"), value: false },
            { label: tr("On", "켬"), value: true },
          ]}
          value={!!cashflowCarryoverEnabled}
          onChange={async (nextEnabled) => {
            const token = String(serverToken ?? "").trim();
            if (!token) {
              Alert.alert(
                tr("Login required", "로그인이 필요합니다"),
                tr("Missing server token.", "서버 토큰이 없습니다."),
              );
              return;
            }
            const prevEnabled = !!cashflowCarryoverEnabled;
            setCashflowCarryoverEnabled(nextEnabled);
            setCashflowCarryoverMode("ROLLING");
            try {
              await userApi.updateMe(token, {
                cashflowCarryoverEnabled: nextEnabled,
                cashflowCarryoverMode: "ROLLING",
              });
            } catch (e) {
              setCashflowCarryoverEnabled(prevEnabled);
              Alert.alert(
                tr("Save failed", "저장 실패"),
                tr("Could not save settings. Please try again.", "설정을 저장할 수 없습니다. 다시 시도해 주세요."),
              );
            }
          }}
        />

        {cashflowCarryoverMode ? (
          <Text style={styles.help}>
            {tr("Mode:", "모드:")}{" "}
            <Text style={{ fontWeight: FontWeight.black }}>
              {String(cashflowCarryoverMode)}
            </Text>
          </Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{tr("Coming next", "다음")}</Text>
        <Text style={styles.help}>
          {tr("Theme, notifications, and more translations will live here.", "테마, 알림, 더 많은 화면 번역을 추가할 예정입니다.")}
        </Text>
      </View>

      <View style={[styles.card, styles.logoutCard]}>
        <Text style={[styles.cardTitle, styles.logoutTitle]}>
          {tr("Logout", "로그아웃")}
        </Text>
        <Text style={styles.help}>
          {tr("You will be signed out on this device.", "이 기기에서 로그아웃합니다.")}
        </Text>

        <Pressable
          onPress={onPressLogout}
          disabled={isLoggingOut}
          style={({ pressed }) => [
            styles.logoutBtn,
            pressed && !isLoggingOut && { opacity: 0.9 },
            isLoggingOut && { opacity: 0.5 },
          ]}
        >
          <Text style={styles.logoutBtnText}>
            {isLoggingOut
              ? tr("Logging out…", "로그아웃 중…")
              : tr("Logout", "로그아웃")}
          </Text>
        </Pressable>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing["2xl"],
    borderWidth: 1,
    borderColor: Colors.gray100,
    marginBottom: Spacing.xl,
    // iOS
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    // Android
    elevation: 2,
  },
  cardTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.black,
    color: Colors.ink,
    marginBottom: Spacing.sm,
  },
  help: {
    color: Colors.gray600,
    lineHeight: 18,
  },
  selectedLine: {
    marginTop: 2,
    color: Colors.ink,
  },
  infoBox: {
    marginTop: Spacing.lg,
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.gray100,
    backgroundColor: Colors.gray50,
  },
  infoTitle: {
    fontWeight: FontWeight.black,
    color: Colors.ink,
    marginBottom: Spacing.xs,
  },
  logoutCard: {
    borderColor: Colors.errorBorder,
  },
  logoutTitle: {
    color: Colors.error,
  },
  logoutBtn: {
    marginTop: Spacing.xl,
    height: 48,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.error,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.white,
  },
  logoutBtnText: {
    fontWeight: FontWeight.black,
    color: Colors.error,
  },
});
