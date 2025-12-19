import { useMemo, useState, useEffect } from "react";
import { View, Text, Pressable, TextInput, Platform } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { TxType, useTransactions } from "../lib/transactionsStore";
import { EXPENSE_CATEGORIES, SAVINGS_GOALS } from "../lib/categories";

const INCOME_CATEGORIES = [
  "Salary",
  "Bonus",
  "Gift",
  "Refund",
  "Interest",
  "Other",
] as const;

function centsFromMoney(input: string) {
  const cleaned = input.replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;
  const [dollars, cents = ""] = cleaned.split(".");
  const c = (cents + "00").slice(0, 2);
  return Number(dollars || "0") * 100 + Number(c);
}

export default function AddTransactionModal() {
  const navigation = useNavigation();
  const { addTransaction } = useTransactions();

  const [type, setType] = useState<TxType>("EXPENSE");
  const [amount, setAmount] = useState<string>("");
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [note, setNote] = useState<string>("");
  const [tagsInput, setTagsInput] = useState<string>("");
  const categoryOptions = useMemo(() => {
    if (type === "EXPENSE") return EXPENSE_CATEGORIES;
    if (type === "INCOME") return INCOME_CATEGORIES;
    return SAVINGS_GOALS; // SAVING
  }, [type]);

  useEffect(() => {
    const options = categoryOptions as readonly string[];
    if (!options.includes(category)) {
      setCategory(options[0] ?? "Other");
    }
  }, [type, categoryOptions, category]);

  const tags = useMemo(() => {
    const raw = tagsInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    // 중복 제거
    return Array.from(new Set(raw));
  }, [tagsInput]);

  const canSave = centsFromMoney(amount) > 0;

  const onSave = () => {
    if (!canSave) return;

    addTransaction({
      type,
      amountCents: centsFromMoney(amount),
      category,
      occurredAtISO: new Date().toISOString(),
      note: note.trim() || undefined,
      itemTags: tags.length ? tags : undefined,
    });

    navigation.goBack();
  };

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 12 }}>
        Add Transaction
      </Text>

      {/* Type */}
      <Text style={{ fontWeight: "600", marginBottom: 6 }}>Type</Text>
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
        {(["EXPENSE", "INCOME", "SAVING"] as TxType[]).map((t) => (
          <Pressable
            key={t}
            onPress={() => setType(t)}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 12,
              alignItems: "center",
              backgroundColor: type === t ? "black" : "#eee",
            }}
          >
            <Text
              style={{
                color: type === t ? "white" : "black",
                fontWeight: "600",
              }}
            >
              {t}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Amount */}
      <Text style={{ fontWeight: "600", marginBottom: 6 }}>Amount</Text>
      <TextInput
        value={amount}
        onChangeText={setAmount}
        placeholder="$0.00"
        keyboardType={Platform.select({
          ios: "decimal-pad",
          android: "numeric",
        })}
        inputMode="decimal"
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 12,
          marginBottom: 16,
          fontSize: 16,
        }}
      />

      {/* Category (간단 버튼들) */}
      <Text style={{ fontWeight: "600", marginBottom: 6 }}>
        {type === "SAVING" ? "Savings Goal" : "Category"}
      </Text>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 16,
        }}
      >
        {categoryOptions.map((c) => (
          <Pressable
            key={c}
            onPress={() => setCategory(c)}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderRadius: 999,
              backgroundColor: category === c ? "black" : "#eee",
            }}
          >
            <Text style={{ color: category === c ? "white" : "black" }}>
              {c}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Item Tags */}
      <Text style={{ fontWeight: "600", marginBottom: 6 }}>
        Item tags (comma separated)
      </Text>
      <TextInput
        value={tagsInput}
        onChangeText={setTagsInput}
        placeholder="chicken breast, banana, protein bar"
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 12,
          marginBottom: 10,
          fontSize: 14,
        }}
      />
      {!!tags.length && (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 16,
          }}
        >
          {tags.map((tag) => (
            <View
              key={tag}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: "#f2f2f2",
              }}
            >
              <Text>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Note */}
      <Text style={{ fontWeight: "600", marginBottom: 6 }}>
        Note (optional)
      </Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="memo..."
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 12,
          marginBottom: 18,
          fontSize: 14,
        }}
      />

      {/* Actions */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={{
            flex: 1,
            height: 48,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#eee",
          }}
        >
          <Text style={{ fontWeight: "600" }}>Cancel</Text>
        </Pressable>

        <Pressable
          onPress={onSave}
          disabled={!canSave}
          style={{
            flex: 1,
            height: 48,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: canSave ? "black" : "#999",
          }}
        >
          <Text style={{ color: "white", fontWeight: "700" }}>Save</Text>
        </Pressable>
      </View>
    </View>
  );
}
