import { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CardSpacing } from "../components/Typography";
import ScreenHeader from "../components/layout/ScreenHeader";
import ScreenCard from "../components/layout/ScreenCard";

import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  SAVINGS_GOALS,
} from "../lib/categories";
import { useTransactions } from "../lib/transactionsStore";
import { usePlan } from "../lib/planStore";
import type { Currency } from "../lib/currency";
import { formatMoney } from "../lib/currency";
import ScreenLayout from "../components/layout/ScreenLayout";

type TxType = "EXPENSE" | "INCOME" | "SAVING";

type PeriodFilter = "ALL" | "THIS_MONTH" | "LAST_MONTH" | "THIS_YEAR";

function money(amountMinor: number, currency: Currency) {
  return formatMoney(amountMinor, currency);
}

function currencyOfTx(tx: any): Currency {
  return tx?.currency === "KRW" ? "KRW" : "USD";
}

function getTxAmountMinor(tx: any): number {
  // Prefer new field; fall back to legacy amountMinor
  if (typeof tx?.amountMinor === "number") return tx.amountMinor;
  if (typeof tx?.amountMinor === "number") return tx.amountMinor;
  return 0;
}

function parseAmountTextToMinor(input: string, currency: Currency): number {
  const raw = String(input ?? "");

  // Allow digits + one dot for USD; digits only for KRW
  const cleaned =
    currency === "USD"
      ? raw.replace(/[^0-9.\-]/g, "")
      : raw.replace(/[^0-9\-]/g, "");

  const trimmed = cleaned.trim();
  if (!trimmed) return 0;

  if (currency === "KRW") {
    // KRW has no minor units in our app
    const n = Number(trimmed);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n);
  }

  // USD
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function formatAmountTextFromMinor(
  amountMinor: number,
  currency: Currency
): string {
  const abs = Math.abs(amountMinor);
  if (currency === "KRW") return String(Math.round(abs));
  return (abs / 100).toFixed(2);
}

function typeUI(t: TxType) {
  if (t === "EXPENSE") {
    return {
      label: "EXPENSE",
      pillBg: "#FFF1F2",
      pillText: "#B42318",
      border: "#FEE4E2",
      accent: "#F04438",
    };
  }

  if (t === "INCOME") {
    return {
      label: "INCOME",
      pillBg: "#ECFDF3",
      pillText: "#067647",
      border: "#D1FADF",
      accent: "#12B76A",
    };
  }

  return {
    label: "SAVING",
    pillBg: "#EFF8FF",
    pillText: "#175CD3",
    border: "#D1E9FF",
    accent: "#2E90FA",
  };
}

export default function TransactionsScreen() {
  const { transactions, updateTransaction, deleteTransaction } =
    useTransactions();
  const { homeCurrency, language } = usePlan();
  const isKo = language === "ko";
  const tr = (en: string, ko: string) => (isKo ? ko : en);

  const [editingId, setEditingId] = useState<string | null>(null);

  const editingTx = useMemo(
    () => transactions.find((t) => t.id === editingId) ?? null,
    [transactions, editingId]
  );

  const [type, setType] = useState<TxType>("EXPENSE");
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [amountText, setAmountText] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [editingCurrency, setEditingCurrency] = useState<Currency>("USD");

  const [filterType, setFilterType] = useState<"ALL" | TxType>("ALL");
  const [searchText, setSearchText] = useState<string>("");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("ALL");

  const categoryOptions = useMemo(() => {
    if (type === "EXPENSE") return EXPENSE_CATEGORIES as readonly string[];
    if (type === "INCOME") return INCOME_CATEGORIES as readonly string[];
    return SAVINGS_GOALS as readonly string[];
  }, [type]);

  function ensureCategoryValid(nextType: TxType, current: string) {
    const opts =
      nextType === "EXPENSE"
        ? (EXPENSE_CATEGORIES as readonly string[])
        : nextType === "INCOME"
        ? (INCOME_CATEGORIES as readonly string[])
        : (SAVINGS_GOALS as readonly string[]);

    if (opts.includes(current)) return current;

    return nextType === "EXPENSE"
      ? EXPENSE_CATEGORIES[0]
      : nextType === "INCOME"
      ? INCOME_CATEGORIES[0]
      : SAVINGS_GOALS[0];
  }

  function getTxTimeMs(tx: any) {
    const iso = tx?.createdAtISO ?? tx?.occurredAtISO;
    const t = iso ? new Date(iso).getTime() : NaN;
    return Number.isFinite(t) ? t : 0;
  }

  function isInSelectedPeriod(tx: any) {
    if (periodFilter === "ALL") return true;

    const ms = getTxTimeMs(tx);
    if (!ms) return true; // if missing date, don't hide it

    const now = new Date();

    // Local calendar boundaries
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const startOfThisYear = new Date(now.getFullYear(), 0, 1);
    const startOfNextYear = new Date(now.getFullYear() + 1, 0, 1);

    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    let start = startOfThisMonth;
    let end = startOfNextMonth;

    if (periodFilter === "THIS_MONTH") {
      start = startOfThisMonth;
      end = startOfNextMonth;
    } else if (periodFilter === "LAST_MONTH") {
      start = startOfLastMonth;
      end = startOfThisMonth;
    } else if (periodFilter === "THIS_YEAR") {
      start = startOfThisYear;
      end = startOfNextYear;
    }

    const startMs = start.getTime();
    const endMs = end.getTime();

    return ms >= startMs && ms < endMs;
  }

  const filteredTransactions = useMemo(() => {
    const q = searchText.trim().toLowerCase();

    return transactions.filter((tx) => {
      if (filterType !== "ALL" && tx.type !== filterType) return false;
      if (!isInSelectedPeriod(tx)) return false;

      if (!q) return true;

      const hay = `${tx.type} ${tx.category} ${tx.note ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [transactions, filterType, periodFilter, searchText]);

  const chipStyle = (active: boolean) => [
    styles.chip,
    active ? styles.chipActive : styles.chipInactive,
  ];

  const chipTextStyle = (active: boolean) => [
    styles.chipText,
    active ? styles.chipTextActive : styles.chipTextInactive,
  ];

  function openEdit(id: string) {
    const tx: any = transactions.find((t) => t.id === id);
    if (!tx) return;

    const nextType = (tx.type as TxType) ?? "EXPENSE";
    const nextCategoryRaw = tx.category ?? EXPENSE_CATEGORIES[0];
    const nextCategory = ensureCategoryValid(nextType, nextCategoryRaw);

    const cur = currencyOfTx(tx);
    const amtMinor = getTxAmountMinor(tx);

    setEditingId(id);
    setType(nextType);
    setCategory(nextCategory);
    setEditingCurrency(cur);
    setAmountText(formatAmountTextFromMinor(amtMinor, cur));
    setNote(tx.note ?? "");
  }

  function closeEdit() {
    setEditingId(null);
  }

  function onSave() {
    if (!editingTx) return;

    const absMinor = Math.abs(
      parseAmountTextToMinor(amountText, editingCurrency)
    );
    if (!absMinor || absMinor <= 0) {
      Alert.alert(
        tr("Invalid amount", "금액 오류"),
        tr("Please enter a positive amount.", "0보다 큰 금액을 입력해 주세요.")
      );
      return;
    }

    // Keep sign consistent: expense negative, income/saving positive
    const nextAmountMinor = type === "EXPENSE" ? -absMinor : absMinor;

    // Preserve fxUsdKrw if it exists (so historical conversion still works)
    const existing: any = editingTx as any;

    updateTransaction(existing.id, {
      type,
      category,
      currency: editingCurrency,
      amountMinor: nextAmountMinor,
      fxUsdKrw:
        typeof existing.fxUsdKrw === "number" ? existing.fxUsdKrw : undefined,
      note: note.trim() ? note.trim() : undefined,
    });

    closeEdit();
  }

  function onDelete() {
    if (!editingTx) return;

    Alert.alert(
      tr("Delete transaction?", "거래를 삭제할까요?"),
      tr("This cannot be undone.", "되돌릴 수 없어요."),
      [
        { text: tr("Cancel", "취소"), style: "cancel" },
        {
          text: tr("Delete", "삭제"),
          style: "destructive",
          onPress: () => {
            deleteTransaction((editingTx as any).id);
            closeEdit();
          },
        },
      ]
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenLayout
        variant="list"
        header={
          <ScreenHeader
            title={tr("Transactions", "거래 내역")}
            subtitle={tr(
              "Filter, search, and tap a card to edit.",
              "필터/검색 후 카드를 눌러 수정하세요."
            )}
            rightSlot={
              <View style={styles.resultPill}>
                <Text style={styles.resultPillText}>
                  {filteredTransactions.length} {tr("results", "개")}
                </Text>
              </View>
            }
          />
        }
        top={
          <ScreenCard style={styles.filtersCard}>
            <Text style={CardSpacing.sectionTitle}>
              {tr("Filters", "필터")}
            </Text>

            {/* Type */}
            <View style={styles.chipRow}>
              {(
                [
                  { key: "ALL", label: tr("All", "전체") },
                  { key: "EXPENSE", label: tr("Expense", "지출") },
                  { key: "INCOME", label: tr("Income", "수입") },
                  { key: "SAVING", label: tr("Saving", "저축") },
                ] as const
              ).map((f) => {
                const active = filterType === (f.key as any);
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => setFilterType(f.key as any)}
                    style={chipStyle(active)}
                  >
                    <Text style={chipTextStyle(active)}>{f.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Period */}
            <View style={[styles.chipRow, { marginBottom: 12 }]}>
              {(
                [
                  { key: "ALL", label: tr("All", "전체") },
                  { key: "THIS_MONTH", label: tr("This mo", "이번달") },
                  { key: "LAST_MONTH", label: tr("Last mo", "지난달") },
                  { key: "THIS_YEAR", label: tr("Year", "올해") },
                ] as const
              ).map((p) => {
                const active = periodFilter === (p.key as any);
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => setPeriodFilter(p.key as any)}
                    style={chipStyle(active)}
                  >
                    <Text style={chipTextStyle(active)}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Search */}
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder={tr(
                "Search by category or note",
                "카테고리/메모로 검색"
              )}
              autoCorrect={false}
              style={styles.searchInput}
            />
          </ScreenCard>
        }
        data={filteredTransactions}
        keyExtractor={(item: any) => item.id}
        renderItem={({ item }) => {
          const cur = currencyOfTx(item as any);
          const amtMinor = getTxAmountMinor(item as any);
          const pill = typeUI((item as any).type as TxType);
          const showFxNote = cur !== homeCurrency;

          return (
            <Pressable
              onPress={() => openEdit(item.id)}
              style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
            >
              <ScreenCard style={{ borderColor: pill.border }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <View
                    style={{
                      alignSelf: "flex-start",
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 999,
                      backgroundColor: pill.pillBg,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Text
                      style={{
                        color: pill.pillText,
                        fontWeight: "900",
                        fontSize: 12,
                        letterSpacing: 0.3,
                      }}
                    >
                      {pill.label}
                    </Text>

                    <Text
                      style={{
                        color: pill.pillText,
                        fontWeight: "900",
                        fontSize: 12,
                      }}
                    >
                      {cur}
                    </Text>
                  </View>

                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      backgroundColor: pill.accent,
                    }}
                  />
                </View>

                <Text style={[CardSpacing.cardTitle, styles.txCategory]}>
                  {(item as any).category}
                </Text>
                <Text style={[styles.txAmount, { color: pill.pillText }]}>
                  {money(amtMinor, cur)}
                </Text>

                {showFxNote ? (
                  <Text style={styles.metaText}>
                    {tr(
                      `Base totals use ${homeCurrency}. This transaction is in ${cur}.`,
                      `기준 합계 통화는 ${homeCurrency}이고, 이 거래는 ${cur}로 기록되어 있어요.`
                    )}
                  </Text>
                ) : null}

                {!!(item as any).createdAtISO && (
                  <Text style={styles.metaText}>
                    {new Date((item as any).createdAtISO).toLocaleString()}
                  </Text>
                )}

                {!!(item as any).note && (
                  <Text style={styles.noteText}>
                    {tr("Note", "메모")}: {(item as any).note}
                  </Text>
                )}

                <Text style={styles.metaText}>
                  {tr("Tap to edit", "눌러서 수정")}
                </Text>
              </ScreenCard>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {tr(
              "No matching transactions. Try changing filters or search.",
              "조건에 맞는 거래가 없어요. 필터나 검색어를 바꿔보세요."
            )}
          </Text>
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Modal은 ScreenLayout 밖에 그대로 유지 */}
      <Modal
        visible={!!editingId}
        transparent
        animationType="fade"
        onRequestClose={closeEdit}
      >
        <Pressable
          onPress={closeEdit}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.35)",
            padding: 16,
            justifyContent: "center",
          }}
        >
          <Pressable onPress={() => {}} style={styles.modalCard}>
            <ScreenCard>
              <Text style={[CardSpacing.cardTitle, styles.modalTitle]}>
                {tr("Edit transaction", "거래 수정")}
              </Text>

              {/* Type */}
              <Text style={CardSpacing.fieldLabel}>{tr("Type", "유형")}</Text>
              <View style={styles.modalChipRow}>
                {(["EXPENSE", "INCOME", "SAVING"] as TxType[]).map((t) => {
                  const active = type === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => {
                        const nextType = t;
                        const nextCat = ensureCategoryValid(nextType, category);
                        setType(nextType);
                        setCategory(nextCat);
                      }}
                      style={chipStyle(active)}
                    >
                      <Text style={chipTextStyle(active)}>
                        {t === "EXPENSE"
                          ? tr("Expense", "지출")
                          : t === "INCOME"
                          ? tr("Income", "수입")
                          : tr("Saving", "저축")}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Currency (read-only for edit, shown for clarity) */}
              <Text style={CardSpacing.fieldLabel}>
                {tr("Currency", "통화")}
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                <View
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "#ddd",
                    backgroundColor: "#fafafa",
                  }}
                >
                  <Text style={{ color: "#111", fontWeight: "800" }}>
                    {editingCurrency}
                  </Text>
                </View>
                <Text style={{ alignSelf: "center", color: "#666" }}>
                  {tr(
                    "(currency is set when created)",
                    "(통화는 생성 시점에 결정돼요)"
                  )}
                </Text>
              </View>

              {/* Amount */}
              <Text style={CardSpacing.fieldLabel}>{tr("Amount", "금액")}</Text>
              <TextInput
                value={amountText}
                onChangeText={setAmountText}
                placeholder={editingCurrency === "KRW" ? "0" : "0.00"}
                keyboardType={
                  editingCurrency === "KRW" ? "number-pad" : "decimal-pad"
                }
                style={styles.modalInput}
              />

              {/* Category */}
              <Text style={CardSpacing.fieldLabel}>
                {type === "SAVING"
                  ? tr("Savings Goal", "저축 목표")
                  : type === "INCOME"
                  ? tr("Income Category", "수입 카테고리")
                  : tr("Category", "카테고리")}
              </Text>
              <View style={styles.categoryWrap}>
                {categoryOptions.map((c) => {
                  const active = category === c;
                  return (
                    <Pressable
                      key={c}
                      onPress={() => setCategory(c)}
                      style={chipStyle(active)}
                    >
                      <Text style={chipTextStyle(active)}>{c}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Note */}
              <Text style={CardSpacing.fieldLabel}>
                {tr("Note (optional)", "메모(선택)")}
              </Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder={tr(
                  "e.g., Costco chicken",
                  "예: 코스트코 닭가슴살"
                )}
                style={styles.modalInput}
              />

              <View
                style={{
                  flexDirection: "row",
                  gap: 10,
                  justifyContent: "space-between",
                }}
              >
                <Pressable
                  onPress={onDelete}
                  style={{
                    flex: 1,
                    backgroundColor: "#fff5f5",
                    borderRadius: 12,
                    paddingVertical: 12,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: "#f0caca",
                  }}
                >
                  <Text style={{ fontWeight: "900", color: "#c00" }}>
                    {tr("Delete", "삭제")}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={onSave}
                  style={{
                    flex: 1,
                    backgroundColor: "#111",
                    borderRadius: 12,
                    paddingVertical: 12,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontWeight: "900", color: "white" }}>
                    {tr("Save", "저장")}
                  </Text>
                </Pressable>
              </View>

              <Pressable onPress={closeEdit} style={{ paddingVertical: 12 }}>
                <Text
                  style={{
                    textAlign: "center",
                    color: "#666",
                    fontWeight: "800",
                  }}
                >
                  {tr("Cancel", "취소")}
                </Text>
              </Pressable>
            </ScreenCard>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#f7f7f7",
  },
  content: {
    padding: 16,
    paddingBottom: 28,
  },
  resultPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#111",
    marginTop: 2,
  },
  resultPillText: {
    color: "white",
    fontWeight: "900",
    fontSize: 12,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 8,
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
  filtersCard: {
    marginBottom: 14,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "white",
  },
  emptyText: {
    color: "#666",
    marginTop: 6,
    marginBottom: 10,
    textAlign: "center",
  },
  txCategory: {
    marginTop: 8,
  },
  txAmount: {
    marginTop: 6,
    fontSize: 20,
    fontWeight: "900",
  },
  metaText: {
    marginTop: 6,
    color: "#777",
    fontSize: 12,
  },
  noteText: {
    marginTop: 8,
    color: "#555",
  },
  modalCard: {
    maxHeight: "85%",
    width: "100%",
  },
  modalTitle: {
    marginBottom: 12,
  },
  modalChipRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  categoryWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    backgroundColor: "white",
  },
});
