import { View, ActivityIndicator, StyleSheet } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../lib/authStore";
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
  const { isAuthenticated, isLoading } = useAuth();

  // 초기 로딩 중일 때 로딩 화면 표시
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
