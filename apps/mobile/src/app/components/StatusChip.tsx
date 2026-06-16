// apps/mobile/src/app/components/StatusChip.tsx

import { View, Text, StyleSheet } from "react-native";
import { Colors, FontSize, FontWeight, Radius, Spacing } from "../theme";

export function StatusChip({ label, color }: { label: string; color: string }) {
  return (
    <View style={styles.chip}>
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
    backgroundColor: Colors.overlay04,
  },
  text: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.extrabold,
  },
});
