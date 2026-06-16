// apps/mobile/src/app/navigation/RootNavigator.tsx
// 앱의 화면 흐름 정책 관리

import { View, ActivityIndicator, StyleSheet } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

//RootNavigator는 Auth에만 의존, Plan/Transactions에는 의존하지 않음
import { useAuthStore } from "../store/authStore";

// Tap 바깥에서 보여지는 화면들
import LoginScreen from "../screens/LoginScreen"; // 인증
import BootstrapScreen from "../screens/BootstrapScreen"; // 인증 후 데이터 준비
import AddTransactionModal from "../screens/AddTransactionModal"; // 거래 추가
import SettingsScreen from "../screens/SettingsScreen"; // 설정
import ProfileImageModal from "../screens/ProfileImageModal"; // 프로필 이미지 수정

// Tap 바 안에서 보여지는 화면들(Dashboard, Transactions, Plan, Profile)
import TabNavigator from "./TabNavigator";

export type RootStackParamList = {
  Login: undefined;
  Bootstrap: undefined;
  Tabs: undefined;
  AddTransactionModal: undefined;
  Settings: undefined;
  ProfileImageModal: {
    profileImageUri?: string | null;
    profileName?: string;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuthStore();

  // Auth restore gate
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4285F4" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen name="Bootstrap" component={BootstrapScreen} />
          <Stack.Screen name="Tabs" component={TabNavigator} />
          <Stack.Screen
            name="AddTransactionModal"
            component={AddTransactionModal}
            options={{
              presentation: "modal",
              title: "Add",
              headerShown: true,
            }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{
              title: "Settings",
              headerShown: true,
            }}
          />
          <Stack.Screen
            name="ProfileImageModal"
            component={ProfileImageModal}
            options={{
              presentation: "modal",
              headerShown: false,
            }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f7f7f7",
  },
});
