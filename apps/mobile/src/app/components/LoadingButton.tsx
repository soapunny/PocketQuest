import React from "react";
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from "react-native";

export type LoadingButtonProps = {
  onPress: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  title: string;
  style?: ViewStyle | ViewStyle[];
  textStyle?: TextStyle | TextStyle[];
  loadingColor?: string;
  disabledStyle?: ViewStyle | ViewStyle[];
};

/**
 * LoadingButton
 * - 로딩 상태를 표시하는 버튼 컴포넌트
 * - 로딩 중 자동으로 비활성화되어 중복 클릭 방지
 * - 로딩 중 ActivityIndicator 표시
 */
export default function LoadingButton({
  onPress,
  isLoading = false,
  disabled = false,
  title,
  style,
  textStyle,
  loadingColor = "white",
  disabledStyle,
}: LoadingButtonProps) {
  const isDisabled = isLoading || disabled;

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.button,
        style,
        isDisabled && (disabledStyle || styles.buttonDisabled),
      ]}
      disabled={isDisabled}
    >
      {isLoading ? (
        <ActivityIndicator color={loadingColor} size="small" />
      ) : (
        <Text style={[styles.buttonText, textStyle]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: {
    fontSize: 18,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});







