// apps/mobile/src/app/components/EmptyCard.tsx

import { StyleSheet, Text, View } from "react-native";
import ScreenCard from "./layout/ScreenCard";
import { Colors, FontSize, FontWeight, Spacing } from "../theme";

type Props = {
  icon?: string;
  title: string;
  body?: string;
};

export function EmptyCard({ icon, title, body }: Props) {
  return (
    <ScreenCard>
      <View style={styles.inner}>
        {icon ? <Text style={styles.icon}>{icon}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {body ? <Text style={styles.body}>{body}</Text> : null}
      </View>
    </ScreenCard>
  );
}

const styles = StyleSheet.create({
  inner: {
    alignItems: "center",
    paddingVertical: Spacing["5xl"],
    gap: Spacing.xl,
  },
  icon: {
    fontSize: 32,
  },
  title: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.ink,
    opacity: 0.55,
    textAlign: "center",
  },
  body: {
    fontSize: FontSize.sm,
    color: Colors.gray500,
    textAlign: "center",
    lineHeight: 18,
  },
});
