// apps/mobile/src/app/components/TransactionEditModal.tsx

import { useEffect, useState, ReactNode } from "react";
import { Keyboard, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import ScreenCard from "./layout/ScreenCard";
import { CardSpacing } from "./Typography";
import { Colors, Spacing } from "../theme";

type Props = {
  visible: boolean;
  onRequestClose: () => void;
  title: string;
  children: ReactNode;
};

export function TransactionEditModal({ visible, onRequestClose, title, children }: Props) {
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const onBackdropPress = () => {
    if (keyboardVisible) {
      Keyboard.dismiss();
      return;
    }
    onRequestClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <Pressable onPress={onBackdropPress} style={styles.backdrop}>
        <Pressable onPress={() => Keyboard.dismiss()} style={styles.card}>
          <ScreenCard>
            <Text style={[CardSpacing.cardTitle, styles.title]}>{title}</Text>
            {children}
          </ScreenCard>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.overlay35,
    padding: Spacing["3xl"],
    justifyContent: "center",
  },
  card: { maxHeight: "85%", width: "100%" },
  title: { marginBottom: Spacing.xl },
});
