import React from "react";
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from "react-native";
import { Colors, FontSize, FontWeight, Opacity } from "../theme";

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

export default function LoadingButton({
  onPress,
  isLoading = false,
  disabled = false,
  title,
  style,
  textStyle,
  loadingColor = Colors.white,
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
    fontSize: FontSize["2xl"],
    fontWeight: FontWeight.semibold,
  },
  buttonDisabled: {
    opacity: Opacity.disabled,
  },
});







