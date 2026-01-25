import { View, ActivityIndicator, StyleSheet } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../store/authStore";
import TabNavigator from "./TabNavigator";
import LoginScreen from "../screens/LoginScreen";
import BootstrapScreen from "../screens/BootstrapScreen";
import AddTransactionModal from "../screens/AddTransactionModal";
import SettingsScreen from "../screens/SettingsScreen";
import ProfileImageModal from "../screens/ProfileImageModal";

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
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  // Auth restore gate
  if (isAuthLoading) {
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
