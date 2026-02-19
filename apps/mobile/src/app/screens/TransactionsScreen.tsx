// apps/mobile/src/app/screens/TransactionsScreen.tsx

import { useCallback, useEffect, useMemo, useState, ReactNode } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  Alert,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

// UI components and layout
import { CardSpacing } from "../components/Typography";
import ScreenHeader from "../components/layout/ScreenHeader";
import ScreenCard from "../components/layout/ScreenCard";
import ScreenLayout from "../components/layout/ScreenLayout";

import type {
  TxType,
  Range,
  Transaction,
  UpdateTransactionDTO,
} from "@pq/shared/transactions/types";
import type { Currency } from "@pq/shared/money/types";

import { useAuthStore } from "../store/authStore";
import { useTransactions } from "../store/transactionsStore";
// bootstrap handled in transactions store
import { usePlan } from "../store/planStore";
import { useDashboardStore } from "../store/dashboardStore";

import { categoryLabelText } from "../domain/categories/categoryLabels";
import {
  EXPENSE_CATEGORY_KEYS,
  INCOME_CATEGORY_KEYS,
} from "@pq/shared/transactions/categories";
import {
  formatAmountTextFromMinor,
  parseInputToMinor,
  formatMoney,
  absMinor,
} from "../domain/money";
import { deriveTransactionDirty } from "../domain/forms";
import { typeUI } from "../domain/transactions";

function TransactionEditModal(props: {
  visible: boolean;
  onRequestClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const { visible, onRequestClose, title, children } = props;

  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => {
      setKeyboardVisible(true);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardVisible(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const onBackdropPress = () => {
    if (keyboardVisible) {
      Keyboard.dismiss();
      return;
    }
    onRequestClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
    >
      <Pressable
        onPress={onBackdropPress}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.35)",
          padding: 16,
          justifyContent: "center",
        }}
      >
        <Pressable onPress={() => Keyboard.dismiss()} style={styles.modalCard}>
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
  const { refreshDashboard } = useDashboardStore();
  const auth = useAuthStore();
  const supabaseAccessToken = auth.supabaseAccessToken ?? "";
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

      (async () => {
        try {
          if (isActive) {
            await loadTransactions(periodFilter);
          }
        } catch (error) {
          console.error(
            "[TransactionsScreen] failed to load transactions from server",
            error,
          );
        }
      })();

      // cleanup: 포커스가 풀리면 이후 setState 호출 방지
      return () => {
        isActive = false;
      };
    }, [periodFilter, loadTransactions]),
  );

  const planStore = usePlan() as any;
  const homeCurrency: Currency = planStore?.homeCurrency ?? "USD";
  const language: string | null | undefined = planStore?.language;
  const savingsGoals: Array<{ id: string; name: string }> =
    planStore?.plan?.savingsGoals ?? planStore?.savingsGoals ?? [];
  const [savingsGoalId, setSavingsGoalId] = useState<string>("");

  const savingsGoalOptions = useMemo(
    () => ["", ...savingsGoals.map((g) => String(g.id))],
    [savingsGoals],
  );

  const isKo = language === "ko";
  const tr = (en: string, ko: string) => (isKo ? ko : en);

  function savingsGoalLabel(id: string | null | undefined): string {
    const raw = String(id ?? "").trim();
    if (!raw) return tr("Unassigned", "미지정");

    const hit = savingsGoals.find((g) => String(g.id) === raw);
    return hit?.name ? String(hit.name) : tr("Unassigned", "미지정");
  }

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBaseline, setEditingBaseline] = useState<null | {
    type: TxType;
    category: string;
    savingsGoalId: string;
    amountMinorAbs: number;
    noteTrim: string;
    currency: Currency;
  }>(null);

  const editingTx = useMemo(
    () => transactions.find((t) => t.id === editingId) ?? null,
    [transactions, editingId],
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
    return savingsGoalOptions as readonly string[];
  }, [type, savingsGoalOptions]);

  function ensureCategoryValid(nextType: TxType, current: string) {
    const opts =
      nextType === "EXPENSE"
        ? (EXPENSE_CATEGORY_KEYS as readonly string[])
        : nextType === "INCOME"
          ? (INCOME_CATEGORY_KEYS as readonly string[])
          : (savingsGoalOptions as readonly string[]);

    if (opts.length === 0) return "";
    if (opts.includes(current)) return current;

    return nextType === "EXPENSE"
      ? EXPENSE_CATEGORY_KEYS[0]
      : nextType === "INCOME"
        ? INCOME_CATEGORY_KEYS[0]
        : String(opts[0]);
  }

  const filteredTransactions = useMemo(() => {
    const q = searchText.trim().toLowerCase();

    const out = transactions.filter((tx) => {
      if (filterType !== "ALL" && tx.type !== filterType) {
        return false;
      }

      if (!q) return true;

      const goalName =
        tx.type === "SAVING" ? String((tx as any)?.savingsGoalName ?? "") : "";
      const hay = `${tx.type} ${tx.category} ${goalName} ${
        tx.note ?? ""
      }`.toLowerCase();
      const ok = hay.includes(q);
      return ok;
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

    // For SAVING transactions, the selector is savingsGoalId (category is always "savings").
    const rawForSelector =
      nextType === "SAVING"
        ? String((tx as any)?.savingsGoalId ?? "")
        : String(tx.category ?? EXPENSE_CATEGORY_KEYS[0]);

    const nextCategory = ensureCategoryValid(nextType, rawForSelector);

    const cur = tx.currency;
    const amtMinor = absMinor(tx.amountMinor ?? 0);

    setEditingId(id);
    setType(nextType);

    if (nextType === "SAVING") {
      // nextCategory is a validated savingsGoalId option
      setSavingsGoalId(nextCategory);
    } else {
      setCategory(nextCategory);
      setSavingsGoalId("");
    }
    setEditingCurrency(cur);
    setAmountText(formatAmountTextFromMinor(amtMinor, cur));
    setNote(tx.note ?? "");

    const baseCategory =
      nextType === "SAVING" ? "savings" : String(tx.category ?? "");
    const baseSavingsGoalId =
      nextType === "SAVING" ? String((tx as any)?.savingsGoalId ?? "") : "";
    const baseNoteTrim = String(tx.note ?? "").trim();

    setEditingBaseline({
      type: nextType,
      category: baseCategory,
      savingsGoalId: baseSavingsGoalId,
      amountMinorAbs: amtMinor,
      noteTrim: baseNoteTrim,
      currency: cur,
    });
  }

  function closeEdit() {
    if (isLoading) return;
    setEditingBaseline(null);
    setEditingId(null);
  }

  function requestCloseEdit() {
    if (isLoading) return;
    if (!editingId) return;

    // If there are unsaved changes, confirm discard.
    if (isEditDirty) {
      Alert.alert(
        tr("Discard changes?", "변경사항을 버릴까요?"),
        tr(
          "You have unsaved changes. If you close now, they will be lost.",
          "저장하지 않은 변경사항이 있어요. 지금 닫으면 사라집니다.",
        ),
        [
          { text: tr("Keep editing", "계속 편집"), style: "cancel" },
          {
            text: tr("Discard", "버리기"),
            style: "destructive",
            onPress: () => closeEdit(),
          },
        ],
      );
      return;
    }

    closeEdit();
  }

  // Dirty and validity tracking for edit modal
  const currentForDirty = editingBaseline;
  const { dirty: isEditDirty, nextAmountMinorAbs: nextEditAmountMinorAbs } =
    currentForDirty
      ? deriveTransactionDirty({
          draftType: type,
          currentType: currentForDirty.type,
          // For SAVING, the server category is always "savings"; compare that literal.
          draftCategory: type === "SAVING" ? "savings" : category,
          currentCategory: currentForDirty.category,
          draftSavingsGoalId: type === "SAVING" ? savingsGoalId : "",
          currentSavingsGoalId: currentForDirty.savingsGoalId,
          draftAmountText: amountText,
          currentAmountMinor: currentForDirty.amountMinorAbs,
          currency: editingCurrency,
          draftNote: note.trim(),
          currentNote: currentForDirty.noteTrim,
        })
      : { dirty: false, nextAmountMinorAbs: 0 };

  // ✅ Unassigned selection policy (edit modal)
  // - If the original tx was SAVING and already unassigned (baseline goalId blank),
  //   allow keeping/selecting Unassigned.
  // - Otherwise (originally assigned or originally not SAVING), do NOT allow selecting Unassigned.
  const baselineAllowsUnassigned =
    !!editingBaseline &&
    editingBaseline.type === "SAVING" &&
    !String(editingBaseline.savingsGoalId ?? "").trim();

  const canSelectUnassignedNow =
    type === "SAVING" ? baselineAllowsUnassigned : false;

  const showTypeChangeHint =
    !!editingBaseline && String(editingBaseline.type) !== String(type);

  const firstAssignableGoalId = useMemo(() => {
    // pick first non-empty goal id
    const hit = (savingsGoalOptions ?? []).find((x) => String(x).trim());
    return hit ? String(hit) : "";
  }, [savingsGoalOptions]);
  const isValidAmount = nextEditAmountMinorAbs > 0;

  // ✅ Saving goal validity:
  // - If canSelectUnassignedNow: empty is allowed (baseline already unassigned)
  // - Else: must pick a real goal id (non-empty)
  const isValidSavingGoal =
    type !== "SAVING"
      ? true
      : canSelectUnassignedNow
        ? true
        : !!String(savingsGoalId ?? "").trim();
  const canSave =
    !!editingId &&
    !isLoading &&
    isEditDirty &&
    isValidAmount &&
    isValidSavingGoal;

  async function onSave() {
    if (!editingTx?.id) return;
    if (isLoading) return;
    if (!isEditDirty) return;

    const absMinor = nextEditAmountMinorAbs;
    if (!absMinor || absMinor <= 0) {
      Alert.alert(
        tr("Invalid amount", "금액 오류"),
        tr("Please enter a positive amount.", "0보다 큰 금액을 입력해 주세요."),
      );
      return;
    }

    // DB 모델에서는 amountMinor를 항상 0 이상으로 저장하고,
    // EXPENSE / INCOME / SAVING은 type으로 구분합니다.
    const nextAmountMinor = absMinor;

    // ✅ Guard: prevent assigning to Unassigned unless baseline allows it.
    if (type === "SAVING") {
      const nextGoal = String(savingsGoalId ?? "").trim();
      if (!nextGoal && !canSelectUnassignedNow) {
        Alert.alert(
          tr("Selection not allowed", "선택할 수 없어요"),
          tr(
            "You cannot change an assigned savings transaction to Unassigned.",
            "저축 목표가 지정된 거래를 '미지정'으로 변경할 수 없어요.",
          ),
        );
        return;
      }
    }

    const noteTrimmed = note.trim();
    const patch: UpdateTransactionDTO = {
      type,
      // For SAVING, category is a stable literal; the goal is selected separately.
      category: type === "SAVING" ? "savings" : category,
      currency: editingCurrency,
      amountMinor: nextAmountMinor,
      // Use null to explicitly clear the note on the server
      note: noteTrimmed ? noteTrimmed : null,
      ...(type === "SAVING"
        ? ({ savingsGoalId: savingsGoalId || null } as any)
        : ({ savingsGoalId: null } as any)),
    };

    try {
      // delegate update to transactions store which handles refresh + bootstrap
      await updateTransaction(editingTx.id, patch);

      // Refresh dashboard so edits reflect immediately.
      await refreshDashboard(supabaseAccessToken);

      closeEdit();
    } catch (e) {
      console.error("[TransactionsScreen] failed to patch transaction", e);
      Alert.alert(
        tr("Update failed", "수정 실패"),
        tr(
          "Could not save changes. Please try again.",
          "저장에 실패했어요. 다시 시도해 주세요.",
        ),
      );
    } finally {
    }
  }

  async function deleteEditingTransaction() {
    if (!editingTx?.id) return;

    try {
      await deleteTransaction(editingTx.id);

      // Refresh dashboard so deletions reflect immediately.
      await refreshDashboard(supabaseAccessToken);

      closeEdit();
    } catch (e) {
      console.error("[TransactionsScreen] failed to delete transaction", e);
      Alert.alert(
        tr("Delete failed", "삭제 실패"),
        tr(
          "Could not delete. Please try again.",
          "삭제에 실패했어요. 다시 시도해 주세요.",
        ),
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
      ],
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
              "필터/검색 후 카드를 눌러 수정하세요.",
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
                "카테고리/메모로 검색",
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
          const cur = tx.currency;
          const amtMinor = absMinor(tx.amountMinor ?? 0);
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
                  {txType === "SAVING"
                    ? savingsGoalLabel((tx as any)?.savingsGoalId)
                    : categoryLabelText(tx.category, language)}
                </Text>
                <Text style={[styles.txAmount, { color: pill.pillText }]}>
                  {formatMoney(displayMinor, cur)}
                </Text>

                {showFxNote ? (
                  <Text style={styles.metaText}>
                    {tr(
                      `Base totals use ${homeCurrency}. This transaction is in ${cur}.`,
                      `기준 합계 통화는 ${homeCurrency}이고, 이 거래는 ${cur}로 기록되어 있어요.`,
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
              "조건에 맞는 거래가 없어요. 필터나 검색어를 바꿔보세요.",
            )}
          </Text>
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Modal은 ScreenLayout 밖에 그대로 유지 */}
      <TransactionEditModal
        visible={!!editingId}
        onRequestClose={requestCloseEdit}
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
                  const base = nextType === "SAVING" ? savingsGoalId : category;
                  const nextCat = ensureCategoryValid(nextType, base);
                  setType(nextType);

                  if (nextType === "SAVING") {
                    // If Unassigned is not allowed, never land on "".
                    const nextGoalId = String(nextCat ?? "");
                    const forced =
                      !String(nextGoalId).trim() && !baselineAllowsUnassigned
                        ? firstAssignableGoalId
                        : nextGoalId;

                    setSavingsGoalId(forced);
                  } else {
                    setCategory(nextCat);
                    setSavingsGoalId("");
                  }
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
        {showTypeChangeHint ? (
          <Text style={styles.typeHintText}>
            ⚠️{" "}
            {tr(
              "Changing type will move this transaction between Budget and Savings.",
              "유형을 변경하면 이 거래가 예산/저축 합계에 다르게 반영돼요.",
            )}
          </Text>
        ) : null}

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
              "(통화는 생성 시점에 결정돼요)",
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
          {categoryOptions.length === 0 ? (
            <Text style={{ color: "#777" }}>
              {tr(
                "No savings goals yet. Create one in Plan > Savings.",
                "저축 목표가 아직 없어요. Plan > Savings에서 만들어 주세요.",
              )}
            </Text>
          ) : (
            categoryOptions.map((c) => {
              const selected = type === "SAVING" ? savingsGoalId : category;
              const active = selected === c;

              const isUnassignedOption =
                type === "SAVING" && !String(c ?? "").trim();
              const disabled = isUnassignedOption && !canSelectUnassignedNow; // ✅ 핵심: baseline이 unassigned였던 경우만 허용

              return (
                <Pressable
                  key={c}
                  disabled={disabled}
                  onPress={() => {
                    if (disabled) return;

                    if (type === "SAVING") {
                      // If not allowed, don't allow setting empty anyway.
                      const next = String(c ?? "");
                      if (!next.trim() && !canSelectUnassignedNow) return;
                      setSavingsGoalId(next);
                    } else {
                      setCategory(c);
                    }
                  }}
                  style={[
                    ...chipStyle(active),
                    disabled ? { opacity: 0.35 } : null,
                  ]}
                >
                  <Text style={chipTextStyle(active)}>
                    {type === "SAVING"
                      ? savingsGoalLabel(c)
                      : categoryLabelText(c, language)}
                  </Text>
                </Pressable>
              );
            })
          )}
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
              opacity: isLoading ? 0.45 : 1,
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
              opacity: canSave ? 1 : 0.45,
            }}
            disabled={!canSave}
          >
            <Text style={{ fontWeight: "900", color: "white" }}>
              {tr("Save", "저장")}
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={requestCloseEdit}
          style={{
            marginTop: 10,
            width: "100%",
            backgroundColor: "white",
            borderRadius: 12,
            paddingVertical: 12,
            alignItems: "center",
            borderWidth: 1,
            borderColor: "#ddd",
          }}
          disabled={isLoading}
        >
          <Text style={{ fontWeight: "900", color: "#111" }}>
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
  typeHintText: {
    marginTop: 6,
    fontSize: 12,
    color: "#D97706", // amber-600
    opacity: 0.95,
    marginBottom: 6,
    fontWeight: "700",
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
