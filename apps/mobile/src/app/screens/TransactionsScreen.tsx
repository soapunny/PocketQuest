import { useCallback, useMemo, useState, ReactNode } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  Alert,
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
  categoryLabelText,
  EXPENSE_CATEGORY_KEYS,
  INCOME_CATEGORY_KEYS,
  SAVING_CATEGORY_KEYS,
} from "../domain/categories";
import { useTransactions } from "../store/transactionsStore";
// bootstrap handled in transactions store
import { usePlan } from "../store/planStore";
import type {
  Currency,
  TxType,
  Range,
  Transaction,
  UpdateTransactionDTO,
} from "../../../../../packages/shared/src/transactions/types";
import { formatMoney } from "../domain/money/format";
import ScreenLayout from "../components/layout/ScreenLayout";

const DEBUG_TX = __DEV__;
const dlog = (...args: any[]) => {
  if (DEBUG_TX) console.log(...args);
};

function money(amountMinor: number, currency: Currency) {
  return formatMoney(amountMinor, currency);
}

function currencyOfTx(tx: Transaction): Currency {
  return tx.currency;
}

//money minor unit
function getTxAmountMinor(tx: Transaction): number {
  // Ensure we treat legacy signed values safely but store/display as non-negative.
  const raw = typeof tx?.amountMinor === "number" ? tx.amountMinor : 0;
  return Math.abs(raw); //abs minor > 0
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

function TransactionEditModal(props: {
  visible: boolean;
  onRequestClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const { visible, onRequestClose, title, children } = props;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
    >
      <Pressable
        onPress={onRequestClose}
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
              {title}
            </Text>
            {children}
          </ScreenCard>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function TransactionsScreen() {
  const txStore = useTransactions();
  const {
    transactions,
    loading: isLoading,
    load: loadTransactions,
    updateTransaction,
    deleteTransaction,
  } = txStore;

  // 🔥 여기서 periodFilter를 먼저 선언
  const [periodFilter, setPeriodFilter] = useState<Range>("ALL");

  // 서버에서 트랜잭션 목록을 가져와 화면 상태에 반영
  // useFocusEffect를 사용해서 화면이 다시 포커스될 때마다,
  // 그리고 기간 필터(periodFilter)가 바뀔 때마다 자동으로 새로고침.
  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      // DEBUG: confirm which period filter is active whenever the screen focuses
      dlog("[TX] focus", {
        periodFilter,
        ts: new Date().toISOString(),
      });

      // Send the chosen period filter to the server (server does period filtering)
      dlog("[TX] request params", { periodFilter });

      (async () => {
        try {
          if (isActive) {
            await loadTransactions(periodFilter);
          }
        } catch (error) {
          console.error(
            "[TransactionsScreen] failed to load transactions from server",
            error
          );
        }
      })();

      // cleanup: 포커스가 풀리면 이후 setState 호출 방지
      return () => {
        isActive = false;
      };
    }, [periodFilter, loadTransactions])
  );

  const { homeCurrency, language } = usePlan();
  const isKo = language === "ko";
  const tr = (en: string, ko: string) => (isKo ? ko : en);

  const [editingId, setEditingId] = useState<string | null>(null);

  const editingTx = useMemo(
    () => transactions.find((t) => t.id === editingId) ?? null,
    [transactions, editingId]
  );

  const [type, setType] = useState<TxType>("EXPENSE");
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORY_KEYS[0]);
  const [amountText, setAmountText] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [editingCurrency, setEditingCurrency] = useState<Currency>("USD");

  const [filterType, setFilterType] = useState<"ALL" | TxType>("ALL");
  const [searchText, setSearchText] = useState<string>("");

  const categoryOptions = useMemo(() => {
    if (type === "EXPENSE") return EXPENSE_CATEGORY_KEYS as readonly string[];
    if (type === "INCOME") return INCOME_CATEGORY_KEYS as readonly string[];
    return SAVING_CATEGORY_KEYS as readonly string[];
  }, [type]);

  function ensureCategoryValid(nextType: TxType, current: string) {
    const opts =
      nextType === "EXPENSE"
        ? (EXPENSE_CATEGORY_KEYS as readonly string[])
        : nextType === "INCOME"
        ? (INCOME_CATEGORY_KEYS as readonly string[])
        : (SAVING_CATEGORY_KEYS as readonly string[]);

    if (opts.includes(current)) return current;

    return nextType === "EXPENSE"
      ? EXPENSE_CATEGORY_KEYS[0]
      : nextType === "INCOME"
      ? INCOME_CATEGORY_KEYS[0]
      : SAVING_CATEGORY_KEYS[0];
  }

  const filteredTransactions = useMemo(() => {
    const q = searchText.trim().toLowerCase();

    // DEBUG: confirm client-side filters used for rendering
    dlog("[TX] client filters", {
      filterType,
      searchText: q,
      inputCount: transactions.length,
    });

    let rejectedByType = 0;
    let rejectedBySearch = 0;

    const out = transactions.filter((tx) => {
      if (filterType !== "ALL" && tx.type !== filterType) {
        rejectedByType += 1;
        return false;
      }

      if (!q) return true;

      const hay = `${tx.type} ${tx.category} ${tx.note ?? ""}`.toLowerCase();
      const ok = hay.includes(q);
      if (!ok) rejectedBySearch += 1;
      return ok;
    });

    dlog("[TX] client filters result", {
      outputCount: out.length,
      rejectedByType,
      rejectedBySearch,
    });

    return out;
  }, [transactions, filterType, searchText]);

  const chipStyle = (active: boolean) => [
    styles.chip,
    active ? styles.chipActive : styles.chipInactive,
  ];

  const chipTextStyle = (active: boolean) => [
    styles.chipText,
    active ? styles.chipTextActive : styles.chipTextInactive,
  ];

  function openEdit(id: string) {
    const tx = transactions.find((t) => t.id === id);
    if (!tx) return;

    const nextType = (tx.type as TxType) ?? "EXPENSE";
    const nextCategoryRaw = tx.category ?? EXPENSE_CATEGORY_KEYS[0];
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
    if (isLoading) return;
    setEditingId(null);
  }

  async function onSave() {
    if (!editingTx?.id) return;
    if (isLoading) return;

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

    // DB 모델에서는 amountMinor를 항상 0 이상으로 저장하고,
    // EXPENSE / INCOME / SAVING은 type으로 구분합니다.
    const nextAmountMinor = absMinor;

    const noteTrimmed = note.trim();
    const patch: UpdateTransactionDTO = {
      type,
      category,
      currency: editingCurrency,
      amountMinor: nextAmountMinor,
      // Use null to explicitly clear the note on the server
      note: noteTrimmed ? noteTrimmed : null,
    };

    try {
      // delegate update to transactions store which handles refresh + bootstrap
      await updateTransaction(editingTx.id, patch);
      closeEdit();
    } catch (e) {
      console.error("[TransactionsScreen] failed to patch transaction", e);
      Alert.alert(
        tr("Update failed", "수정 실패"),
        tr(
          "Could not save changes. Please try again.",
          "저장에 실패했어요. 다시 시도해 주세요."
        )
      );
    } finally {
    }
  }

  async function deleteEditingTransaction() {
    if (!editingTx?.id) return;

    try {
      await deleteTransaction(editingTx.id);
      closeEdit();
    } catch (e) {
      console.error("[TransactionsScreen] failed to delete transaction", e);
      Alert.alert(
        tr("Delete failed", "삭제 실패"),
        tr(
          "Could not delete. Please try again.",
          "삭제에 실패했어요. 다시 시도해 주세요."
        )
      );
    } finally {
    }
  }

  function onDelete() {
    if (!editingTx) return;
    if (isLoading) return;

    Alert.alert(
      tr("Delete transaction?", "거래를 삭제할까요?"),
      tr("This cannot be undone.", "되돌릴 수 없어요."),
      [
        { text: tr("Cancel", "취소"), style: "cancel" },
        {
          text: tr("Delete", "삭제"),
          style: "destructive",
          onPress: () => {
            void deleteEditingTransaction();
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
                const active = filterType === f.key;
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => setFilterType(f.key)}
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
                const active = periodFilter === p.key;
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => setPeriodFilter(p.key)}
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
        keyExtractor={(item: Transaction) => item.id}
        renderItem={({ item }) => {
          const tx = item;
          const cur = currencyOfTx(tx);
          const amtMinor = getTxAmountMinor(tx);
          const txType = (tx.type as TxType) ?? "EXPENSE";
          const pill = typeUI(txType);
          const showFxNote = cur !== homeCurrency;

          // Display-wise, treat EXPENSE as negative, INCOME/SAVING as positive,
          // but keep the stored amountMinor non-negative in the DB.
          const displayMinor = txType === "EXPENSE" ? -amtMinor : amtMinor;

          const dateISO =
            tx.occurredAtLocalISO ?? tx.occurredAtISO ?? tx.occurredAt;

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
                  {categoryLabelText(tx.category, language)}
                </Text>
                <Text style={[styles.txAmount, { color: pill.pillText }]}>
                  {money(displayMinor, cur)}
                </Text>

                {showFxNote ? (
                  <Text style={styles.metaText}>
                    {tr(
                      `Base totals use ${homeCurrency}. This transaction is in ${cur}.`,
                      `기준 합계 통화는 ${homeCurrency}이고, 이 거래는 ${cur}로 기록되어 있어요.`
                    )}
                  </Text>
                ) : null}

                {!!dateISO && (
                  <Text style={styles.metaText}>
                    {new Date(dateISO).toLocaleString()}
                  </Text>
                )}

                {!!tx.note && (
                  <Text style={styles.noteText}>
                    {tr("Note", "메모")}: {tx.note}
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
      <TransactionEditModal
        visible={!!editingId}
        onRequestClose={closeEdit}
        title={tr("Edit transaction", "거래 수정")}
      >
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

        {/* Currency (read-only) */}
        <Text style={CardSpacing.fieldLabel}>{tr("Currency", "통화")}</Text>
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
                <Text style={chipTextStyle(active)}>
                  {categoryLabelText(c, language)}
                </Text>
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
          placeholder={tr("e.g., Costco chicken", "예: 코스트코 닭가슴살")}
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
            disabled={isLoading}
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
            disabled={isLoading}
          >
            <Text style={{ fontWeight: "900", color: "white" }}>
              {tr("Save", "저장")}
            </Text>
          </Pressable>
        </View>

        <Pressable onPress={closeEdit} style={{ paddingVertical: 12 }}>
          <Text
            style={{ textAlign: "center", color: "#666", fontWeight: "800" }}
          >
            {tr("Cancel", "취소")}
          </Text>
        </Pressable>
      </TransactionEditModal>
    </View>
  );
}

const styles = StyleSheet.create({
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
