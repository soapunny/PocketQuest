import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { usePlan } from "../lib/planStore";
import type { PeriodType } from "../lib/planStore";

const OPTIONS: Array<{ label: string; value: PeriodType; help: string }> = [
  { label: "Weekly", value: "WEEKLY", help: "Resets every Monday." },
  { label: "Bi-weekly", value: "BIWEEKLY", help: "2-week blocks (Mon start)." },
  {
    label: "Monthly",
    value: "MONTHLY",
    help: "Calendar month (1st to last day).",
  },
];

export default function SettingsScreen() {
  const { plan, setPeriodType } = usePlan();

  const current = (plan.periodType ?? "WEEKLY") as PeriodType;

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Customize PocketQuest</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Planning period</Text>
        <Text style={styles.help}>
          Choose how goals and progress are grouped.
        </Text>

        <View style={styles.segment}>
          {OPTIONS.map((opt) => {
            const selected = opt.value === current;
            return (
              <Pressable
                key={opt.value}
                onPress={() => setPeriodType(opt.value)}
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
          Current:{" "}
          <Text style={{ fontWeight: "900" }}>
            {OPTIONS.find((o) => o.value === current)?.label}
          </Text>
        </Text>
        <Text style={styles.help}>
          {OPTIONS.find((o) => o.value === current)?.help}
        </Text>

        {current === "BIWEEKLY" ? (
          <Text style={styles.help}>
            Anchor:{" "}
            <Text style={{ fontWeight: "900" }}>
              {plan.periodAnchorISO ?? "2025-01-06"}
            </Text>
          </Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Coming next</Text>
        <Text style={styles.help}>
          Language (EN/KR), notifications, and theme controls will live here.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#f6f6f7",
    padding: 16,
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: "#111",
  },
  subtitle: {
    marginTop: 4,
    color: "#666",
  },
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
});
