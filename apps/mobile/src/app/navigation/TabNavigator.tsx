import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Pressable, Text, View } from "react-native";
import { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";

import DashboardScreen from "../screens/DashboardScreen";
import TransactionsScreen from "../screens/TransactionsScreen";
import PlanScreen from "../screens/PlanScreen";
import ProfileScreen from "../screens/ProfileScreen";

const Tab = createBottomTabNavigator();

function EmptyScreen() {
  return null;
}

function AddButton(props: BottomTabBarButtonProps) {
  const navigation = useNavigation<any>();

  return (
    <Pressable
      accessibilityRole={props.accessibilityRole}
      accessibilityState={props.accessibilityState}
      accessibilityLabel={props.accessibilityLabel}
      testID={props.testID}
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
        component={EmptyScreen}
        options={{
          tabBarLabel: "",
          tabBarButton: (props) => <AddButton {...props} />,
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate("AddTransactionModal");
          },
        })}
      />

      <Tab.Screen name="Plan" component={PlanScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
