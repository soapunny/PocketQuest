import { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Alert,
  Pressable,
  Platform,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

import type { TxType } from "../store/transactionsStore";
import { transactionsApi } from "../api/transactionsApi";
import { useBootStrap } from "../hooks/useBootStrap";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  SAVINGS_GOALS,
} from "../domain/transactions/categories";
import { usePlan } from "../store/planStore";
import type { Currency } from "../domain/money/currency";
import CurrencyInput from "react-native-currency-input";
import { CardSpacing } from "../components/Typography";

import ScreenLayout from "../components/layout/ScreenLayout";
import ScreenHeader from "../components/layout/ScreenHeader";
import ScreenCard from "../components/layout/ScreenCard";

export default function AddTransactionModal() {
  const navigation = useNavigation();
  const { runBootstrap } = useBootStrap();

  const { homeCurrency, displayCurrency, language } = usePlan();
  const isKo = language === "ko";
  const tr = (en: string, ko: string) => (isKo ? ko : en);

  const chipStyle = (active: boolean) => [
    styles.chip,
    active ? styles.chipActive : styles.chipInactive,
  ];

  const chipTextStyle = (active: boolean) => [
    styles.chipText,
    active ? styles.chipTextActive : styles.chipTextInactive,
  ];

  const [type, setType] = useState<TxType>("EXPENSE");
  const [amountValue, setAmountValue] = useState<number | null>(null);

  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [note, setNote] = useState<string>("");

  const [fxUsdKrwText, setFxUsdKrwText] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  const currency: Currency = (displayCurrency ??
    homeCurrency ??
    "USD") as Currency;

  const categoryOptions = useMemo(() => {
    if (type === "EXPENSE") return EXPENSE_CATEGORIES;
    if (type === "INCOME") return INCOME_CATEGORIES;
    return SAVINGS_GOALS; // SAVING
  }, [type]);

  useEffect(() => {
    // When the type changes, ensure the currently selected category is valid.
    const options = categoryOptions as readonly string[];
    if (options.includes(category)) return;

    // Default per type (keeps things predictable)
    if (type === "EXPENSE") setCategory(EXPENSE_CATEGORIES[0]);
    else if (type === "INCOME") setCategory(INCOME_CATEGORIES[0]);
    else setCategory(SAVINGS_GOALS[0]); // SAVING
  }, [type, categoryOptions, category]);

  useEffect(() => {
    // If the user changes currency in Settings, clear the FX snapshot input.
    setFxUsdKrwText("");
    // Also clear amount to avoid accidental misinterpretation of previously typed value.
    setAmountValue(null);
  }, [currency]);

  const precision = currency === "USD" ? 2 : 0;

  const fxNeeded = !!homeCurrency && currency !== homeCurrency;
  const fxUsdKrw = Number((fxUsdKrwText || "").replace(/[^0-9.]/g, ""));
  const fxValid = !fxNeeded || (Number.isFinite(fxUsdKrw) && fxUsdKrw > 0);

  const canSave = (amountValue ?? 0) > 0 && fxValid;

  const onSave = async () => {
    if (!canSave) return;
    if (isSaving) return;

    // 항상 양수(또는 0 이상)로 minor 단위를 저장하고,
    // EXPENSE/INCOME/SAVING 구분은 type으로 처리합니다.
    const absMinor = Math.round(
      (amountValue ?? 0) * (currency === "USD" ? 100 : 1),
    );
    const amountMinor = absMinor;

    const noteTrimmed = note.trim();

    try {
      setIsSaving(true);
      await transactionsApi.create("", {
        type,
        amountMinor,
        currency,
        fxUsdKrw: fxNeeded ? fxUsdKrw : undefined,
        category,
        occurredAtISO: new Date().toISOString(),
        note: noteTrimmed ? noteTrimmed : null,
      });

      // MVP: after mutation, refresh bootstrap so Dashboard stays bootstrap-only.
      await runBootstrap();

      navigation.goBack();
    } catch (error) {
      console.error(
        "[AddTransactionModal] failed to create transaction",
        error,
      );
      Alert.alert(
        tr("Save failed", "저장 실패"),
        tr(
          "Could not save this transaction. Please try again.",
          "거래를 저장하지 못했어요. 다시 시도해 주세요.",
        ),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScreenLayout
      keyboardAvoiding
      header={
        <ScreenHeader
          title={tr("Add Transaction", "거래 추가")}
          subtitle={tr(
            "Quick entry • Currency comes from Settings",
            "빠른 입력 • 통화는 설정에서 가져와요",
          )}
          compact
        />
      }
    >
      {/* Details card (Dashboard-like structure) */}
      <ScreenCard style={styles.card}>
        {/* Type */}
        <View style={styles.fieldGroup}>
          <Text style={CardSpacing.fieldLabel}>{tr("Type", "유형")}</Text>
          <View style={styles.typeRow}>
            {(["EXPENSE", "INCOME", "SAVING"] as TxType[]).map((t) => (
              <Pressable
                key={t}
                onPress={() => setType(t)}
                style={[
                  styles.typeChip,
                  type === t ? styles.typeChipActive : styles.typeChipInactive,
                ]}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    type === t
                      ? styles.typeChipTextActive
                      : styles.typeChipTextInactive,
                  ]}
                >
                  {t === "EXPENSE"
                    ? tr("Expense", "지출")
                    : t === "INCOME"
                      ? tr("Income", "수입")
                      : tr("Saving", "저축")}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Amount */}
        <View style={styles.fieldGroup}>
          <Text style={CardSpacing.fieldLabel}>{tr("Amount", "금액")}</Text>
          <CurrencyInput
            value={amountValue}
            onChangeValue={setAmountValue}
            delimiter=","
            separator="."
            precision={precision}
            minValue={0}
            keyboardType={Platform.select({
              ios: "decimal-pad",
              android: "numeric",
            })}
            placeholder={currency === "USD" ? "$0.00" : "₩0"}
            style={styles.amountInput}
          />
          <Text style={[CardSpacing.fieldHelp, styles.helper]}>
            {tr(
              "Enter an amount (numbers only). Currency is set from Settings.",
              "금액을 입력하세요(숫자만). 통화는 설정에서 정해져요.",
            )}
          </Text>
        </View>

        {/* FX snapshot (only when needed) */}
        {fxNeeded && (
          <View style={styles.fieldGroup}>
            <Text style={CardSpacing.fieldLabel}>
              {tr("Exchange rate (snapshot)", "환율(스냅샷)")}
            </Text>
            <Text style={[CardSpacing.fieldHelp, styles.helper]}>
              {tr(
                `Used for totals in ${homeCurrency}. Enter: 1 USD = ___ KRW`,
                `기준 합계 통화(${homeCurrency})로 계산할 때 사용돼요. 입력: 1 USD = ___ KRW`,
              )}
            </Text>
            <TextInput
              value={fxUsdKrwText}
              onChangeText={setFxUsdKrwText}
              keyboardType={Platform.select({
                ios: "decimal-pad",
                android: "numeric",
              })}
              placeholder={tr("e.g., 1350", "예: 1350")}
              style={[
                styles.input,
                { borderColor: fxValid ? "#ddd" : "#b42318" },
              ]}
            />
            {!fxValid && (
              <Text style={styles.errorText}>
                {tr(
                  "Please enter a valid exchange rate.",
                  "올바른 환율을 입력해 주세요.",
                )}
              </Text>
            )}
          </View>
        )}

        {/* Category */}
        <View style={styles.fieldGroup}>
          <Text style={CardSpacing.fieldLabel}>
            {type === "SAVING"
              ? tr("Savings Goal", "저축 목표")
              : type === "INCOME"
                ? tr("Income Category", "수입 카테고리")
                : tr("Category", "카테고리")}
          </Text>
          <View style={styles.chipRow}>
            {categoryOptions.map((c) => (
              <Pressable
                key={c}
                onPress={() => setCategory(c)}
                style={chipStyle(category === c)}
              >
                <Text style={chipTextStyle(category === c)}>{c}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Note */}
        <View style={styles.fieldGroupLast}>
          <Text style={CardSpacing.fieldLabel}>
            {tr("Note (optional)", "메모(선택)")}
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={tr("memo...", "메모...")}
            style={styles.input}
          />
        </View>
      </ScreenCard>

      {/* Actions */}
      <View style={styles.actionsSection}>
        <View style={styles.actionsRow}>
          <Pressable
            onPress={() => navigation.goBack()}
            disabled={isSaving}
            style={[styles.secondaryButton, isSaving && { opacity: 0.6 }]}
          >
            <Text style={styles.secondaryButtonText}>
              {tr("Cancel", "취소")}
            </Text>
          </Pressable>

          <Pressable
            onPress={onSave}
            disabled={!canSave || isSaving}
            style={[
              styles.primaryButton,
              (!canSave || isSaving) && styles.primaryButtonDisabled,
            ]}
          >
            <Text style={styles.primaryButtonText}>{tr("Save", "저장")}</Text>
          </Pressable>
        </View>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 10,
  },
  fieldGroup: {
    marginBottom: 12,
  },
  fieldGroupLast: {
    marginBottom: 0,
  },
  helper: {
    marginTop: 4,
  },
  actionsSection: {
    marginTop: 8,
    paddingBottom: 6,
  },
  typeRow: {
    flexDirection: "row",
    gap: 8,
  },
  typeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  typeChipActive: {
    backgroundColor: "black",
  },
  typeChipInactive: {
    backgroundColor: "#eee",
  },
  typeChipText: {
    fontWeight: "700",
  },
  typeChipTextActive: {
    color: "white",
  },
  typeChipTextInactive: {
    color: "black",
  },
  amountInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "white",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    backgroundColor: "white",
  },
  errorText: {
    color: "#b42318",
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipActive: {
    borderColor: "#111",
    backgroundColor: "#111",
  },
  chipInactive: {
    borderColor: "#ddd",
    backgroundColor: "white",
  },
  chipText: {
    fontWeight: "800",
  },
  chipTextActive: {
    color: "white",
  },
  chipTextInactive: {
    color: "#111",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  secondaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eee",
  },
  secondaryButtonText: {
    fontWeight: "700",
    color: "#111",
  },
  primaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "black",
  },
  primaryButtonDisabled: {
    backgroundColor: "#999",
  },
  primaryButtonText: {
    color: "white",
    fontWeight: "800",
  },
});
