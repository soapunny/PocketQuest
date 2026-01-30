import React, { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";

import ScreenHeader from "../components/layout/ScreenHeader";
import ScreenLayout from "../components/layout/ScreenLayout";

import type { Currency } from "../../../../../packages/shared/src/money/types";

import { usePlan, type PeriodType, type UILanguage } from "../store/planStore";

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

const LANGUAGE_OPTIONS: Array<{ label: string; value: UILanguage }> = [
  { label: "English", value: "en" },
  { label: "한국어", value: "ko" },
];

export default function SettingsScreen() {
  const {
    plan,
    setPeriodType,
    switchPeriodType,
    homeCurrency,
    displayCurrency,
    setHomeCurrency,
    setDisplayCurrency,
    switchPlanCurrency,
    advancedCurrencyMode,
    setAdvancedCurrencyMode,
    language,
    setLanguage,
  } = usePlan();

  const current = (plan.periodType ?? "MONTHLY") as PeriodType;
  const isAdvanced = !!advancedCurrencyMode;

  const combinedCurrency = useMemo<Currency>(() => {
    const planCurrency = (plan as any)?.currency as Currency | undefined;
    return (planCurrency ??
      displayCurrency ??
      homeCurrency ??
      "USD") as Currency;
  }, [plan, displayCurrency, homeCurrency]);

  const lang = (language ?? "en") as UILanguage;
  const isKo = lang === "ko";

  return (
    <ScreenLayout
      header={
        <ScreenHeader
          title={isKo ? "설정" : "Settings"}
          subtitle={isKo ? "PocketQuest 사용자 설정" : "Customize PocketQuest"}
        />
      }
    >
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{isKo ? "언어" : "Language"}</Text>
        <Text style={styles.help}>
          {isKo
            ? "앱에서 사용할 언어를 선택하세요."
            : "Choose the language used in the app."}
        </Text>

        <View style={styles.segment}>
          {LANGUAGE_OPTIONS.map((opt) => {
            const selected = opt.value === lang;
            return (
              <Pressable
                key={opt.value}
                onPress={() => setLanguage(opt.value)}
                style={[
                  styles.segmentBtn,
                  selected && styles.segmentBtnSelected,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    selected && styles.segmentTextSelected,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.help}>
          {isKo
            ? "* 일부 화면은 아직 번역 중입니다."
            : "* Some screens are still being translated."}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {isKo ? "계획 기간" : "Planning period"}
        </Text>
        <Text style={styles.help}>
          {isKo
            ? "목표와 진행률이 묶이는 기간을 선택하세요."
            : "Choose how goals and progress are grouped."}
        </Text>

        <View style={styles.segment}>
          {OPTIONS.map((opt) => {
            const selected = opt.value === current;
            return (
              <Pressable
                key={opt.value}
                onPress={async () => {
                  const ok = await switchPeriodType(opt.value);
                  if (!ok) {
                    // fallback: update local state so UI still responds in dev
                    setPeriodType(opt.value);
                  }
                }}
                style={[
                  styles.segmentBtn,
                  selected && styles.segmentBtnSelected,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    selected && styles.segmentTextSelected,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.selectedLine}>
          {isKo ? "현재:" : "Current:"}{" "}
          <Text style={{ fontWeight: "900" }}>
            {OPTIONS.find((o) => o.value === current)?.label}
          </Text>
        </Text>
        <Text style={styles.help}>
          {OPTIONS.find((o) => o.value === current)?.help}
        </Text>

        {/* Server-driven: no client-side anchor/boundary calculations */}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{isKo ? "통화" : "Currency"}</Text>
        <Text style={styles.help}>
          {isKo
            ? "단일 통화(간단) 또는 고급 모드로 기준 통화와 표시 통화를 분리할 수 있어요."
            : "Choose one currency (simple) or enable advanced mode to separate base totals and display."}
        </Text>

        <Text style={[styles.help, { marginTop: 10, fontWeight: "900" }]}>
          {isKo ? "고급" : "Advanced"}
        </Text>
        <Text style={styles.help}>
          {isKo
            ? "기본은 하나의 통화로 단순하게 쓰고, 필요할 때만 고급 모드를 켜세요."
            : "Keep it simple with one currency, or enable advanced mode to separate base totals from display/entry currency."}
        </Text>

        <View style={styles.segment}>
          {[
            { label: isKo ? "끔" : "Off", value: false },
            { label: isKo ? "켬" : "On", value: true },
          ].map((opt) => {
            const selected = opt.value === isAdvanced;
            return (
              <Pressable
                key={String(opt.label)}
                onPress={() => setAdvancedCurrencyMode(opt.value)}
                style={[
                  styles.segmentBtn,
                  selected && styles.segmentBtnSelected,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    selected && styles.segmentTextSelected,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {isAdvanced ? (
          <>
            <Text style={[styles.help, { marginTop: 10, fontWeight: "900" }]}>
              {isKo ? "기준 통화(Home)" : "Home currency"}
            </Text>
            <Text style={styles.help}>
              {isKo
                ? "총합/진행률 계산 기준 통화입니다. 기존 거래는 원래 통화를 유지하며, 다른 통화 거래는 저장된 환율 스냅샷(FX)을 사용합니다(가능한 경우)."
                : "Used as the base for totals and progress. Existing transactions keep their original currency. If a transaction is in a different currency, it uses the saved FX snapshot (if available)."}
            </Text>
            <View style={styles.segment}>
              {CURRENCY_OPTIONS.map((opt) => {
                const selected = opt.value === homeCurrency;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setHomeCurrency(opt.value)}
                    style={[
                      styles.segmentBtn,
                      selected && styles.segmentBtnSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        selected && styles.segmentTextSelected,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.help, { marginTop: 6, fontWeight: "900" }]}>
              {isKo ? "표시 통화(Display)" : "Display currency"}
            </Text>
            <Text style={styles.help}>
              {isKo
                ? "화면에 표시되는 통화입니다. 새 거래는 이 통화로 추가됩니다."
                : "How amounts are shown in the UI. New transactions are added in this currency."}
            </Text>
            <View style={styles.segment}>
              {CURRENCY_OPTIONS.map((opt) => {
                const selected = opt.value === displayCurrency;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setDisplayCurrency(opt.value)}
                    style={[
                      styles.segmentBtn,
                      selected && styles.segmentBtnSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        selected && styles.segmentTextSelected,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>{isKo ? "팁" : "Tip"}</Text>
              <Text style={styles.help}>
                {isKo ? (
                  <>
                    <Text style={{ fontWeight: "900" }}>Home</Text>은
                    총합/진행률 기준,
                    <Text style={{ fontWeight: "900" }}> Display</Text>는 일상
                    입력/표시용으로 쓰면 좋아요.
                  </>
                ) : (
                  <>
                    Keep{" "}
                    <Text style={{ fontWeight: "900" }}>Home currency</Text> as
                    the currency you want for totals and progress. Use{" "}
                    <Text style={{ fontWeight: "900" }}>Display currency</Text>{" "}
                    for day-to-day entry and reading.
                  </>
                )}
              </Text>
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.help, { marginTop: 6, fontWeight: "900" }]}>
              {isKo ? "통화" : "Currency"}
            </Text>
            <Text style={styles.help}>
              {isKo
                ? "총합/목표/새 거래 입력에 모두 사용됩니다."
                : "Used for totals, goals, and new transactions."}
            </Text>

            <View style={styles.segment}>
              {CURRENCY_OPTIONS.map((opt) => {
                const selected = opt.value === combinedCurrency;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={async () => {
                      // 1) UI는 즉시 바꾸기 (선택 표시 + 단위 바로 바뀜)
                      setHomeCurrency(opt.value);
                      setDisplayCurrency(opt.value);

                      // 2) 서버에 저장 (DB currency 업데이트)
                      const ok = await switchPlanCurrency(opt.value);

                      if (!ok) {
                        // 실패해도 일단 UI는 유지 (원하면 여기서 revert도 가능)
                        console.warn(
                          "[SettingsScreen] switchPlanCurrency failed; kept local currency",
                        );
                      }
                    }}
                    style={[
                      styles.segmentBtn,
                      selected && styles.segmentBtnSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        selected && styles.segmentTextSelected,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>{isKo ? "안내" : "Note"}</Text>
              <Text style={styles.help}>
                {isKo
                  ? "기존 거래는 원래 통화를 유지합니다. 통화를 바꾸면, 총합은 저장된 환율 스냅샷(FX)을 사용할 수 있어요."
                  : "Existing transactions keep their original currency. If you switch currency later, totals will use FX snapshots when available."}
              </Text>
            </View>
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{isKo ? "다음" : "Coming next"}</Text>
        <Text style={styles.help}>
          {isKo
            ? "테마, 알림, 더 많은 화면 번역을 추가할 예정입니다."
            : "Theme, notifications, and more translations will live here."}
        </Text>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#eee",
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111",
    marginBottom: 6,
  },
  help: {
    color: "#666",
    lineHeight: 18,
  },
  segment: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 14,
    overflow: "hidden",
    marginTop: 12,
    marginBottom: 10,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
  },
  segmentBtnSelected: {
    backgroundColor: "black",
  },
  segmentText: {
    fontWeight: "900",
    color: "#111",
  },
  segmentTextSelected: {
    color: "white",
  },
  selectedLine: {
    marginTop: 2,
    color: "#111",
  },
  infoBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#eee",
    backgroundColor: "#fafafa",
  },
  infoTitle: {
    fontWeight: "900",
    color: "#111",
    marginBottom: 4,
  },
});
