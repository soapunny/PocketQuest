// apps/mobile/src/app/components/LoadingCard.tsx

import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import ScreenCard from "./layout/ScreenCard";
import { Colors, FontSize, FontWeight, Spacing } from "../theme";

type Props = {
  label?: string;
};

export function LoadingCard({ label }: Props) {
  return (
    <ScreenCard>
      <View style={styles.row}>
        <ActivityIndicator size="small" color={Colors.ink} />
        {label ? <Text style={styles.label}>{label}</Text> : null}
      </View>
    </ScreenCard>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  label: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.ink,
    opacity: 0.6,
  },
});
