import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../lib/authStore";
import { usePlanStore } from "../lib/planStore";
import TabNavigator from "./TabNavigator";
import LoginScreen from "../screens/LoginScreen";
import AddTransactionModal from "../screens/AddTransactionModal";
import SettingsScreen from "../screens/SettingsScreen";
import ProfileImageModal from "../screens/ProfileImageModal";

export type RootStackParamList = {
  Login: undefined;
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
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const {
    isInitialized: isPlanInitialized,
    isLoading: isPlanLoading,
    initialize: initializePlan,
  } = usePlanStore();

  useEffect(() => {
    // 유저가 인증된 상태이고, 아직 Plan 초기 로딩이 안 끝났다면 한 번만 초기화
    if (isAuthenticated && !isPlanInitialized && !isPlanLoading) {
      initializePlan();
    }
  }, [isAuthenticated, isPlanInitialized, isPlanLoading, initializePlan]);

  // 1) 인증 상태 확인 중이거나
  // 2) 이미 로그인은 되었지만 Plan 초기 데이터가 아직 준비되지 않은 경우
  //    전체 앱 대신 로딩 화면을 먼저 보여줌
  if (
    isAuthLoading ||
    (isAuthenticated && (!isPlanInitialized || isPlanLoading))
  ) {
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
