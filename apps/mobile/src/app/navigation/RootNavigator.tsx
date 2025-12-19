import { createNativeStackNavigator } from "@react-navigation/native-stack";
import TabNavigator from "./TabNavigator";
import AddTransactionModal from "../screens/AddTransactionModal";
import SettingsScreen from "../screens/SettingsScreen";

export type RootStackParamList = {
  Tabs: undefined;
  AddTransactionModal: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Tabs"
        component={TabNavigator}
        options={{ headerShown: false }}
      />

      <Stack.Screen
        name="AddTransactionModal"
        component={AddTransactionModal}
        options={{
          presentation: "modal",
          title: "Add",
        }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: "Settings" }}
      />
    </Stack.Navigator>
  );
}
