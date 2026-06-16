// apps/mobile/src/app/components/SegmentControl.tsx

import { Pressable, StyleSheet, Text, View } from "react-native";
import { Colors, FontWeight, Radius, Spacing } from "../theme";

type Option<T> = { label: string; value: T };

type Props<T> = {
  options: Array<Option<T>>;
  value: T;
  onChange: (value: T) => void | Promise<void>;
};

export function SegmentControl<T extends string | boolean>({
  options,
  value,
  onChange,
}: Props<T>) {
  return (
    <View style={styles.track}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={String(opt.value)}
            onPress={() => void onChange(opt.value)}
            style={[styles.btn, selected && styles.btnSelected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: Colors.gray100,
    borderRadius: Radius.lg,
    overflow: "hidden",
    marginTop: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  btn: {
    flex: 1,
    paddingVertical: Spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.white,
  },
  btnSelected: {
    backgroundColor: Colors.ink,
  },
  label: {
    fontWeight: FontWeight.black,
    color: Colors.ink,
  },
  labelSelected: {
    color: Colors.white,
  },
});
