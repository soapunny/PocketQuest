import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { CardSpacing } from "../Typography";

// ScreenCard
// - 공통 카드 컴포넌트로 모든 화면에서 동일한 너비와 스타일을 보장
// - CardSpacing.card 스타일을 기반으로 하며 width: '100%'를 명시적으로 적용

export type ScreenCardProps = {
  children?: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
};

export default function ScreenCard({ children, style }: ScreenCardProps) {
  return (
    <View style={[CardSpacing.card, styles.card, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%", // 명시적으로 전체 너비를 차지하도록 설정
    alignSelf: "stretch", // 부모 View의 padding을 고려하여 너비 조정
  },
});

