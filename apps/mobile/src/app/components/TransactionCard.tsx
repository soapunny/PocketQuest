// apps/mobile/src/app/components/TransactionCard.tsx

import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Transaction, TxType } from "@pq/shared/transactions/types";
import type { Currency } from "@pq/shared/money/types";

import ScreenCard from "./layout/ScreenCard";
import { CardSpacing } from "./Typography";
import { Colors, FontSize, FontWeight, Radius, Spacing } from "../theme";
import { categoryLabelText } from "../domain/categories/categoryLabels";
import { absMinor, formatMoney } from "../domain/money";
import { typeUI } from "../domain/transactions";

type Props = {
  tx: Transaction;
  homeCurrency: Currency;
  language: string | null | undefined;
  savingsGoals: Array<{ id: string; name: string }>;
  tr: (en: string, ko: string) => string;
  onPress: () => void;
};

function savingsGoalLabel(
  id: string | null | undefined,
  goals: Array<{ id: string; name: string }>,
  tr: (en: string, ko: string) => string,
): string {
  const raw = String(id ?? "").trim();
  if (!raw) return tr("Unassigned", "미지정");
  const hit = goals.find((g) => String(g.id) === raw);
  return hit?.name ? String(hit.name) : tr("Unassigned", "미지정");
}

export function TransactionCard({ tx, homeCurrency, language, savingsGoals, tr, onPress }: Props) {
  const cur = tx.currency;
  const amtMinor = absMinor(tx.amountMinor ?? 0);
  const txType = (tx.type as TxType) ?? "EXPENSE";
  const pill = typeUI(txType);
  const showFxNote = cur !== homeCurrency;
  const displayMinor = txType === "EXPENSE" ? -amtMinor : amtMinor;
  const dateISO = (tx as any).occurredAtLocalISO ?? (tx as any).occurredAtISO ?? (tx as any).occurredAt;
  const dateLocale = language === "ko" ? "ko-KR" : "en-US";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
    >
      <ScreenCard style={{ borderColor: pill.border }}>
        <View style={styles.headerRow}>
          <View style={[styles.typePill, { backgroundColor: pill.pillBg }]}>
            <Text style={[styles.typePillText, { color: pill.pillText }]}>{pill.label}</Text>
            <Text style={[styles.typePillText, { color: pill.pillText }]}>{cur}</Text>
          </View>
          <View style={[styles.dot, { backgroundColor: pill.accent }]} />
        </View>

        <Text style={[CardSpacing.cardTitle, styles.category]}>
          {txType === "SAVING"
            ? savingsGoalLabel((tx as any)?.savingsGoalId, savingsGoals, tr)
            : categoryLabelText(tx.category, language)}
        </Text>

        <Text style={[styles.amount, { color: pill.pillText }]}>
          {formatMoney(displayMinor, cur)}
        </Text>

        {showFxNote && (
          <Text style={styles.meta}>
            {tr(
              `Base totals use ${homeCurrency}. This transaction is in ${cur}.`,
              `기준 합계 통화는 ${homeCurrency}이고, 이 거래는 ${cur}로 기록되어 있어요.`,
            )}
          </Text>
        )}

        {!!dateISO && (
          <Text style={styles.meta}>{new Date(dateISO).toLocaleString(dateLocale)}</Text>
        )}

        {!!tx.note && (
          <Text style={styles.note}>
            {tr("Note", "메모")}: {tx.note}
          </Text>
        )}

      </ScreenCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  typePill: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  typePillText: {
    fontWeight: FontWeight.black,
    fontSize: FontSize.sm,
    letterSpacing: 0.3,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: Radius.pill,
  },
  category: { marginTop: Spacing.md },
  amount: {
    marginTop: Spacing.sm,
    fontSize: FontSize["3xl"],
    fontWeight: FontWeight.black,
  },
  meta: {
    marginTop: Spacing.sm,
    color: Colors.gray500,
    fontSize: FontSize.sm,
  },
  note: {
    marginTop: Spacing.md,
    color: Colors.gray700,
  },
});
