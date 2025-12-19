import { FlatList, Text, View } from "react-native";
import { useTransactions } from "../lib/transactionsStore";

function money(amountCents: number) {
  const sign = amountCents < 0 ? "-" : "";
  const abs = Math.abs(amountCents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

export default function TransactionsScreen() {
  const { transactions } = useTransactions();

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 12 }}>
        Transactions
      </Text>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={{ color: "#666" }}>
            No transactions yet. Tap + to add one.
          </Text>
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <View
            style={{
              padding: 12,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#eee",
              backgroundColor: "white",
            }}
          >
            <Text style={{ fontWeight: "700" }}>
              {item.type} • {item.category}
            </Text>
            <Text style={{ marginTop: 4, fontSize: 16 }}>
              {money(item.amountCents)}
            </Text>

            {!!item.itemTags?.length && (
              <Text style={{ marginTop: 6, color: "#555" }}>
                Tags: {item.itemTags.join(", ")}
              </Text>
            )}

            {!!item.note && (
              <Text style={{ marginTop: 6, color: "#555" }}>
                Note: {item.note}
              </Text>
            )}
          </View>
        )}
      />
    </View>
  );
}
