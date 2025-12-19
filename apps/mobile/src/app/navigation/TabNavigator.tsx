import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Pressable, Text, View } from "react-native";
import { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";

import DashboardScreen from "../screens/DashboardScreen";
import TransactionsScreen from "../screens/TransactionsScreen";
import WeeklyPlanScreen from "../screens/WeeklyPlanScreen";
import CharacterScreen from "../screens/CharacterScreen";
import SettingsScreen from "../screens/SettingsScreen";

const Tab = createBottomTabNavigator();

function AddButton(props: BottomTabBarButtonProps) {
  const navigation = useNavigation<any>();

  return (
    <Pressable
      {...props}
      onPress={() => navigation.navigate("AddTransactionModal")}
      style={({ pressed }) => [
        {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: "black",
          alignItems: "center",
          justifyContent: "center",
          marginTop: -18,
        }}
      >
        <Text style={{ color: "white", fontSize: 26, fontWeight: "700" }}>
          +
        </Text>
      </View>
    </Pressable>
  );
}

export default function TabNavigator() {
  return (
    <Tab.Navigator screenOptions={{ headerTitleAlign: "center" }}>
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Transactions" component={TransactionsScreen} />

      <Tab.Screen
        name="Add"
        component={WeeklyPlanScreen}
        options={{
          tabBarLabel: "",
          tabBarButton: (props) => <AddButton {...props} />,
        }}
      />

      <Tab.Screen name="Plan" component={WeeklyPlanScreen} />
      <Tab.Screen name="Character" component={CharacterScreen} />
    </Tab.Navigator>
  );
}
