import React from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";

import RootNavigator from "./src/app/navigation/RootNavigator";
import { AuthProvider } from "./src/app/store/authStore";
import { TransactionsProvider } from "./src/app/store/transactionsStore";
import { PlanProvider } from "./src/app/store/planStore";

// App.tsx (top-level)
import { Platform } from "react-native";

const anyGlobal: any = globalThis as any;

if (!anyGlobal.__GLOBAL_ERROR_HANDLER_INSTALLED__) {
  anyGlobal.__GLOBAL_ERROR_HANDLER_INSTALLED__ = true;

  const ErrorUtilsAny: any = (anyGlobal as any).ErrorUtils;
  const prevHandler = ErrorUtilsAny?.getGlobalHandler?.();

  ErrorUtilsAny?.setGlobalHandler?.((error: any, isFatal?: boolean) => {
    // 이 로그는 레드박스가 사라져도 Metro 터미널에 남음
    console.log("💥 GLOBAL ERROR (captured)", {
      message: String(error?.message ?? error),
      stack: String(error?.stack ?? ""),
      isFatal: !!isFatal,
      platform: Platform.OS,
    });

    prevHandler?.(error, isFatal);
  });
}

export default function App() {
  return (
    <AuthProvider>
      <PlanProvider>
        <TransactionsProvider>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
          <StatusBar style="auto" />
        </TransactionsProvider>
      </PlanProvider>
    </AuthProvider>
  );
}
