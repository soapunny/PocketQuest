import React from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";

import RootNavigator from "./src/app/navigation/RootNavigator";
import { AuthProvider } from "./src/app/lib/authStore";
import { TransactionsProvider } from "./src/app/lib/transactionsStore";
import { PlanProvider } from "./src/app/lib/planStore";
import { CharacterProvider } from "./src/app/lib/characterStore";

export default function App() {
  return (
    <AuthProvider>
      <TransactionsProvider>
        <PlanProvider>
          <CharacterProvider>
            <NavigationContainer>
              <RootNavigator />
              <StatusBar style="auto" />
            </NavigationContainer>
          </CharacterProvider>
        </PlanProvider>
      </TransactionsProvider>
    </AuthProvider>
  );
}
