import React from "react";
import { View, Text, StyleSheet } from "react-native";

// NOTE:
// - ScreenHeader is a presentational component used by all screens.
// - It is responsible ONLY for the screen title/subtitle/optional description and an optional right-side slot.
// - Do not put filters, inputs, or buttons inside ScreenHeader (pass them via rightSlot if needed).

export type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  description?: string;
  rightSlot?: React.ReactNode;
  compact?: boolean;

  // Optional style overrides for edge cases
  containerStyle?: object;
};

// Temporary local typography until Typography.ts is fully centralized.
// Keep these values consistent across screens.
const Typography = {
  screenTitle: {
    fontSize: 26,
    fontWeight: "800" as const,
    color: "#111",
    letterSpacing: -0.2,
  },
  screenSubtitle: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#666",
    marginTop: 4,
  },
  description: {
    fontSize: 12,
    fontWeight: "500" as const,
    color: "#888",
    marginTop: 6,
  },
};

export default function ScreenHeader({
  title,
  subtitle,
  description,
  rightSlot,
  compact,
  containerStyle,
}: ScreenHeaderProps) {
  return (
    <View
      style={[
        styles.container,
        compact ? styles.compact : null,
        containerStyle,
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.textBlock}>
          <Text style={Typography.screenTitle}>{title}</Text>

          {subtitle ? (
            <Text style={Typography.screenSubtitle}>{subtitle}</Text>
          ) : null}

          {description ? (
            <Text style={Typography.description}>{description}</Text>
          ) : null}
        </View>

        {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 0, // paddingHorizontal is handled by ScreenLayout
    paddingTop: 16,
    paddingBottom: 16,
  },
  compact: {
    paddingBottom: 8,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  rightSlot: {
    marginLeft: 12,
    alignItems: "flex-end",
    justifyContent: "flex-start",
  },
});
