// apps/mobile/src/app/components/MetricCard.tsx

import { View, Text, StyleSheet } from "react-native";
import ScreenCard from "./layout/ScreenCard";
import { StatusChip } from "./StatusChip";
import { Colors, FontSize, FontWeight, Radius, Spacing, Opacity } from "../theme";

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

type Props = {
  title: string;
  value: string;
  sub?: React.ReactNode;
  status?: { label: string; color: string };
  progress?: { ratio: number; color: string };
  variant?: "default" | "detail";
};

export function MetricCard({ title, value, sub, status, progress, variant }: Props) {
  const isDetail = variant === "detail";
  const cardStyle = StyleSheet.flatten([
    styles.card,
    isDetail ? styles.cardDetail : null,
  ]);

  return (
    <ScreenCard style={cardStyle}>
      <View style={styles.topRow}>
        <Text style={[styles.title, isDetail && styles.titleDetail]}>{title}</Text>
        {status ? <StatusChip label={status.label} color={status.color} /> : null}
      </View>

      {progress ? (
        <View style={[styles.track, isDetail && styles.trackDetail]}>
          <View
            style={[
              styles.fill,
              {
                width: `${Math.round(clamp01(progress.ratio) * 100)}%`,
                backgroundColor: progress.color,
              },
            ]}
          />
        </View>
      ) : null}

      <Text
        style={[styles.value, isDetail && styles.valueDetail]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {value}
      </Text>

      {sub ? (
        typeof sub === "string" ? (
          <Text style={[styles.sub, isDetail && styles.subDetail]}>{sub}</Text>
        ) : (
          <View style={[styles.subRow, isDetail && styles.subRowDetail]}>{sub}</View>
        )
      ) : null}
    </ScreenCard>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    minHeight: 104,
    justifyContent: "space-between",
  },
  cardDetail: { minHeight: 92 },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.lg,
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.base,
    opacity: Opacity.subtle,
    fontWeight: FontWeight.semibold,
  },
  titleDetail: {
    fontSize: FontSize.sm,
    opacity: 0.68,
  },

  track: {
    height: 4,
    borderRadius: Radius.pill,
    backgroundColor: Colors.overlay06,
    overflow: "hidden",
    marginBottom: Spacing.md,
  },
  trackDetail: {
    height: 3,
    marginBottom: Spacing.sm,
  },
  fill: {
    height: "100%",
    borderRadius: Radius.pill,
  },

  value: {
    fontSize: FontSize["3xl"],
    fontWeight: FontWeight.extrabold,
    letterSpacing: 0.2,
    marginTop: 2,
  },
  valueDetail: { fontSize: FontSize["2xl"] },

  sub: {
    marginTop: Spacing.sm,
    fontSize: FontSize.sm,
    opacity: Opacity.muted,
    fontWeight: FontWeight.medium,
  },
  subDetail: {
    marginTop: Spacing.xs,
    fontSize: FontSize.xs,
    opacity: 0.62,
  },
  subRow: {
    marginTop: Spacing.sm,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  subRowDetail: { marginTop: Spacing.xs },
});
