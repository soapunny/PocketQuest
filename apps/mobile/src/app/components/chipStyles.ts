// apps/mobile/src/app/components/chipStyles.ts
// Shared pill-chip styles used by TransactionsScreen and AddTransactionModal.

import { StyleSheet } from "react-native";
import { Colors, FontWeight, Radius, Spacing, Opacity } from "../theme";

export const chipStyles = StyleSheet.create({
  chip: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  chipActive: { borderColor: Colors.ink, backgroundColor: Colors.ink },
  chipInactive: { borderColor: Colors.gray200, backgroundColor: Colors.white },
  chipDisabled: { opacity: Opacity.disabled },
  chipText: { fontWeight: FontWeight.extrabold },
  chipTextActive: { color: Colors.white },
  chipTextInactive: { color: Colors.ink },
});

export function chipStyle(active: boolean) {
  return [chipStyles.chip, active ? chipStyles.chipActive : chipStyles.chipInactive];
}

export function chipTextStyle(active: boolean) {
  return [chipStyles.chipText, active ? chipStyles.chipTextActive : chipStyles.chipTextInactive];
}
