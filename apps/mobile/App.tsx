// apps/mobile/App.tsx
// 앱을 실행하기 위한 환경설정

/*
Package (npm)
└─ Global modules
├─ Container module: 컴포넌트 묶음 (Layout, Header, Footer, etc.)
├─ Hook module: 상태 로직 / 사이드이펙트 로직
└─ Util module: 유틸리티 함수(포맷팅, 유효성 검사, 데이터 변환 등)

Domain directory
└─ Local modules
├─ Screen module
├─ Store module
├─ Navigator module
*/

// import { module } from "Package" or "Domain"
import React from "react";
import { StatusBar } from "expo-status-bar";
// NavigationContainer: 화면 전환을 위한 컨테이너(화면 이동의 시작점)
import { NavigationContainer } from "@react-navigation/native";

import RootNavigator from "./src/app/navigation/RootNavigator";
import { AuthProvider } from "./src/app/store/authStore";
import { PlanProvider } from "./src/app/store/planStore";
import { TransactionsProvider } from "./src/app/store/transactionsStore";

// App.tsx (top-level)
import { Platform } from "react-native";

//globalThis: 전역 객체(JavaScript 엔진에서 기본 제공하는 전역 객체, 모든 환경(browser, node, react native)에서 사용 가능)
const anyGlobal: any = globalThis as any; // globalThis를 Typesript 타입 검사 무시하는 로컬 상수로 선언

if (!anyGlobal.__GLOBAL_ERROR_HANDLER_INSTALLED__) {
  anyGlobal.__GLOBAL_ERROR_HANDLER_INSTALLED__ = true; // any 타입이라 boolean을 넣어줘도 에러 x

  const ErrorUtilsAny: any = anyGlobal.ErrorUtils;

  // ErrorUtilsAny가 있고, getGlobalHandler 프로퍼티가 있고, 그게 함수라면, 그 반환값을 prevHandler라는 상수로 저장
  // 기존 Handler를 미리 저장.
  const prevHandler = ErrorUtilsAny?.getGlobalHandler?.();

  // ErrorUtilsAny가 있고, setGlobalHandler가 함수라면, 전역 에러 발생 시 호출될 콜백 함수를 등록.
  ErrorUtilsAny?.setGlobalHandler?.((error: any, isFatal?: boolean) => {
    // 이 로그는 레드박스가 사라져도 Metro 터미널에 남음
    console.log("💥 GLOBAL ERROR (captured)", {
      message: String(error?.message ?? error),
      stack: String(error?.stack ?? ""),
      isFatal: !!isFatal,
      platform: Platform.OS,
    });

    prevHandler?.(error, isFatal); // 기존의 Handler도 같이 호출(레드박스, RN 기본 에러 처리 등)
  });
}

/*
App component
- AuthProvider: 인증 상태 관리(로그인 상태, Session 등), 모든 도메인의 전제 조건
- PlanProvider: 계획 상태 관리, 플랜은 유저(Auth)가 있어야만 존재
- TransactionsProvider: 거래 상태 관리, 거래는 Plan에 종속(N:N)
- NavigationContainer: 화면 전환을 위한 컨테이너
- RootNavigator: 루트 네비게이터
- StatusBar: 기본 상태바 관리
*/
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
