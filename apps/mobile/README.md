# PocketQuest Mobile — Frontend Study Guide

React Native + Expo 모바일 앱의 전체 구조를 처음부터 공부하는 노트.  
영어 프로그래밍 용어를 자연스럽게 섞어서 미국 회사 면접 준비도 같이 한다.

---

## 목차

1. [Tech Stack](#1-tech-stack)
2. [개발 환경 기초 개념 — Toolchain / Bundling / Build](#2-개발-환경-기초-개념--toolchain--bundling--build)
3. [Folder Structure](#3-folder-structure)
4. [Navigation Architecture](#4-navigation-architecture)
5. [State Management](#5-state-management)
6. [Design System — Design Tokens](#6-design-system--design-tokens)
7. [API Layer](#7-api-layer)
8. [Custom Hooks](#8-custom-hooks)
9. [Component Patterns](#9-component-patterns)
10. [TypeScript Patterns](#10-typescript-patterns)
11. [Data Flow — 앱이 켜지고 화면이 그려지기까지](#11-data-flow--앱이-켜지고-화면이-그려지기까지)

---

## 1. Tech Stack

| 기술 | 역할 | 핵심 개념 |
|---|---|---|
| **React Native** | 네이티브 앱을 React + JavaScript/TypeScript로 작성 | 웹 React와 문법은 같지만 `<div>` 대신 `<View>`, CSS 대신 `StyleSheet` |
| **Expo** | React Native 개발 전체를 관리하는 툴체인 | Dev server / 번들링 / 네이티브 모듈 래핑 / EAS 배포 빌드 |
| **TypeScript** | 정적 타입 시스템 | compile time에 타입 오류 잡기 |
| **React Navigation** | 화면 전환(navigation) 관리 | Stack Navigator + Tab Navigator |
| **Zustand** | 경량 global state management | Redux보다 보일러플레이트가 적음 |
| **React Context** | Auth/Transactions 같은 provider 패턴 | Zustand 이전에 설계된 store들 |
| **Supabase** | Authentication + DB as a service | OAuth, JWT, session 관리 |
| **Zod** | Runtime schema validation | TypeScript 타입과 runtime 체크를 동시에 |

---

## 2. 개발 환경 기초 개념 — Toolchain / Bundling / Build

### Toolchain (개발 툴체인)

"체인(chain)"이라는 이름처럼, 코드를 작성하고 앱이 실행되기까지 **여러 도구들이 순서대로 연결된 파이프라인**이다.

```
내가 작성한 코드 (TypeScript + JSX)
    ↓ [1. Transpiler — TypeScript → JavaScript 변환]
    ↓ [2. Bundler — 파일들을 하나로 묶기]
    ↓ [3. Dev Server — 폰/에뮬레이터에 전달]
    → 앱 화면에 표시
```

이 파이프라인 전체를 돌려주는 도구 세트가 **toolchain**이다. React Native에서는 Expo가 이 toolchain을 관리해준다. Expo 없이 순수 React Native를 쓰면 이걸 직접 설정해야 해서 훨씬 복잡하다.

---

### Transpiling (트랜스파일링)

폰은 TypeScript를 모른다. 브라우저도 마찬가지다. 폰이 이해할 수 있는 언어는 **JavaScript**뿐이다.

그래서 TypeScript로 작성한 코드를 JavaScript로 **변환(translate + compile = transpile)**하는 과정이 필요하다.

```ts
// 내가 작성한 TypeScript
function greet(name: string): string {
  return `Hello, ${name}`;
}
```

```js
// Transpiler가 변환한 JavaScript (폰이 실행하는 코드)
function greet(name) {
  return "Hello, " + name;
}
```

- TypeScript의 타입 정보(`: string`)는 transpile 시점에 전부 제거된다.
- 즉, **타입 체크는 개발 중에만 일어나고** 실제 실행 파일에는 타입 정보가 없다.
- React Native에서 transpiler 역할을 하는 것이 **Babel** (또는 최근에는 SWC).

---

### Bundling (번들링)

우리가 작성한 파일이 얼마나 많은지 보자.

```
api/http.ts
api/transactionsApi.ts
store/authStore.ts
store/dashboardStore.ts
screens/DashboardScreen.tsx
components/MetricCard.tsx
...수십 개의 파일
```

더불어 `node_modules/` 안에는 외부 라이브러리 파일이 **수천 개** 있다.

폰이 이 파일들을 하나하나 네트워크로 받으면 엄청나게 느리다. 그래서 **Bundler가 이 모든 파일을 하나(또는 소수)의 파일로 합쳐준다.**

```
수백 개의 .ts/.tsx 파일
+ node_modules 수천 개
    ↓ [Bundler]
하나의 bundle.js (또는 index.js)
```

React Native에서 bundler는 **Metro**다. `pnpm dev:mobile` 명령을 실행하면 터미널에 `Metro waiting on...`이 뜨는 게 바로 이것.

**번들링이 중요한 이유:**
- `import` 구문을 따라가며 실제로 사용되는 코드만 포함한다.
- 사용하지 않는 코드는 제외한다 (tree shaking).
- 결과물 하나를 폰에 전달하면 앱이 실행된다.

---

### Dev Server (개발 서버)

개발 중에는 코드를 바꿀 때마다 매번 번들링하고 폰에 앱을 새로 설치하면 너무 느리다. 그래서 Dev Server가 있다.

```
내가 파일을 저장
    ↓
Metro(번들러)가 변경된 부분만 다시 번들링
    ↓
Wi-Fi / USB로 폰/에뮬레이터에 즉시 전달 (Hot Reload)
    ↓
앱 화면이 바로 업데이트
```

- **Hot Reload**: 앱을 완전히 재시작하지 않고 변경된 컴포넌트만 업데이트.
- **Fast Refresh**: React 컴포넌트의 state를 유지한 채 UI만 갱신.
- `pnpm dev:mobile` 이 명령이 Metro dev server를 시작하는 것.

---

### Build (빌드) — 개발 vs 배포

| | Development Build | Production Build |
|---|---|---|
| 목적 | 개발 중 테스트 | 앱스토어 배포 |
| 속도 | 빠름 (최적화 없음) | 느림 (최적화 많음) |
| 파일 크기 | 큼 | 작음 (코드 압축/난독화) |
| 에러 메시지 | 상세하게 나옴 | 최소화됨 |
| 도구 | Metro dev server | Expo EAS Build |

앱스토어에 올리려면 Expo EAS(Expo Application Services)가 클라우드에서 `.ipa`(iOS) / `.apk`(Android) 파일을 만들어준다.

---

### Package Manager (패키지 매니저)

외부 라이브러리(패키지)를 설치하고 버전을 관리하는 도구.

```bash
pnpm install zustand   # zustand 라이브러리 설치
pnpm add react-native-reanimated
```

- **npm** — 가장 기본. Node.js에 포함되어 있음.
- **yarn** — npm보다 빠르게 나온 대안.
- **pnpm** — 이 프로젝트에서 사용. 디스크 공간을 효율적으로 쓰고 monorepo 지원이 강력함.

설치된 패키지 목록은 `package.json`에 기록되고, 실제 파일은 `node_modules/`에 저장된다.

```json
// package.json
{
  "dependencies": {
    "zustand": "^5.0.10",   // 실제 앱에 필요한 라이브러리
  },
  "devDependencies": {
    "typescript": "~5.9.2"  // 개발할 때만 필요한 도구
  }
}
```

- `dependencies` — 앱 실행에 필요한 것 (번들에 포함됨).
- `devDependencies` — 개발 도중에만 쓰는 것 (TypeScript, 테스트 도구 등). 번들에는 포함 안 됨.

---

## 3. Folder Structure

```
apps/mobile/src/app/
├── api/          # HTTP 통신 레이어
├── components/   # 재사용 가능한 UI 컴포넌트
├── config/       # 환경변수, 상수
├── domain/       # 비즈니스 로직 (UI 없는 순수 함수들)
├── hooks/        # Custom hooks
├── lib/          # 외부 라이브러리 설정 (supabase client 등)
├── navigation/   # Navigator 정의
├── screens/      # 각 화면 컴포넌트
├── store/        # State management (Zustand + React Context)
└── theme.ts      # Design token SSOT
```

**왜 이렇게 나눴나?**

- `domain/`은 React에 의존하지 않는 순수 비즈니스 로직만 담는다. 테스트하기 쉽고 재사용하기 쉬움.
- `screens/`은 화면 단위. 각 screen은 store에서 데이터를 읽고 domain 함수로 변환해서 UI에 넘긴다.
- `components/`는 screen 안에서 반복 사용되는 UI 조각들. screen에 종속되지 않음.

---

## 4. Navigation Architecture

React Navigation이 두 가지 navigator를 중첩해서 사용한다.

```
RootNavigator (Stack Navigator)
├── LoginScreen              ← 비로그인 상태
└── (로그인 후)
    ├── BootstrapScreen      ← 데이터 초기 로딩
    ├── TabNavigator         ← 메인 앱
    │   ├── DashboardScreen
    │   ├── TransactionsScreen
    │   ├── [Add 버튼]       ← EmptyScreen + 커스텀 버튼
    │   ├── PlanScreen
    │   └── ProfileScreen
    ├── AddTransactionModal  ← presentation: "modal"
    ├── SettingsScreen
    └── ProfileImageModal    ← presentation: "modal"
```

### Stack Navigator

`@react-navigation/native-stack` 패키지. 화면을 카드처럼 **쌓는(push/pop)** 구조.

```
push →   [Login]
push →   [Login][Bootstrap]
push →   [Login][Bootstrap][Tabs]
pop  ←   [Login][Bootstrap]
```

- 새 화면으로 갈 때: 스택 위에 **push** (오른쪽에서 슬라이드 인)
- 뒤로 갈 때: 스택에서 **pop** (오른쪽으로 슬라이드 아웃)
- 상단에 뒤로가기 버튼(`<`)이 자동으로 생김
- `presentation: "modal"` 옵션을 주면 아래서 위로 올라오는 Modal 전환 효과

이 앱에서 `RootNavigator`가 Stack Navigator. Login → Bootstrap → Tabs 순서로 쌓임.

### Tab Navigator

`@react-navigation/bottom-tabs` 패키지. 화면을 **교체(switch)**하는 구조. 스택을 쌓지 않음.

```
[Dashboard] ←탭→ [Transactions] ←탭→ [Plan] ←탭→ [Profile]
```

- 탭을 누르면 현재 화면을 버리고 다른 화면으로 교체
- 하단에 탭 바가 항상 고정
- 뒤로가기 버튼 없음

이 앱에서 `TabNavigator`가 Tab Navigator. Dashboard / Transactions / Plan / Profile 4개 탭.

### Stack vs Tab 비교

| | Stack Navigator | Tab Navigator |
|---|---|---|
| 전환 방식 | push / pop (쌓기) | switch (교체) |
| 뒤로가기 버튼 | 자동 생성 | 없음 |
| UI 위치 | 상단 헤더 | 하단 탭 바 |
| 비유 | 브라우저 앞으로/뒤로 | 브라우저 탭 |

### 중첩 구조 (Nested Navigators)

이 앱은 Stack 안에 Tab이 중첩된 구조다.

```
RootNavigator (Stack)      ← 앱 전체 흐름 담당
└── TabNavigator (Tab)     ← 메인 앱 안의 탭 전환 담당
```

- 탭 안에서의 전환 → Tab Navigator가 처리
- 탭 바깥으로 나가는 전환(AddTransactionModal 열기 등) → 바깥 Stack Navigator가 처리
- 두 Navigator가 각자 자기 역할만 담당해서 책임이 분리됨

### 각 Screen의 역할

**LoginScreen**
- Google / Kakao OAuth 버튼을 보여줌
- 버튼 누르면 인앱 브라우저(`WebBrowser`)가 열리고 OAuth 인증 진행
- 성공하면 Supabase가 `access_token` 발급 → `authStore`에 저장
- `isAuthenticated`가 true로 바뀌는 순간 RootNavigator가 자동으로 BootstrapScreen으로 전환

**BootstrapScreen** — 로딩 + 에러 + Gate 3가지 역할을 동시에 함
```
로딩 중  → 스피너 + "Loading…" 표시
성공     → navigation.replace("Tabs") 로 탭 화면으로 이동
실패     → 에러 메시지 + Retry 버튼 표시
```
핵심은 **Gate(게이트) 역할**. `prefs`, `plan`, `dashboard` 3개 store가 모두 채워져야만 Tabs로 통과시킴:
```ts
if (!isPrefsHydrated || !isPlanHydrated || !isDashboardHydrated) return; // 대기
navigation.replace("Tabs"); // 모두 준비됐을 때만 통과
```

### push vs replace

Stack Navigator에는 화면 전환 방식이 두 가지 있다.

```
push    →  스택에 화면을 쌓는다  (뒤로가기로 돌아올 수 있음)
replace →  현재 화면을 제거하고 새 화면으로 교체  (뒤로가기로 돌아올 수 없음)
```

Bootstrap → Tabs 전환이 뒤로가기 불가능한 이유:
```
push 방식이었다면:   [Login][Bootstrap][Tabs]  ← 뒤로가기로 Bootstrap 돌아올 수 있음
replace 방식:        [Login][Tabs]             ← Bootstrap이 스택에서 제거됨
```
로그인 후 뒤로가기로 로딩 화면에 돌아가는 건 UX상 말이 안 되므로 `replace()`를 사용한다.

### Auth Gate 패턴

```tsx
// RootNavigator.tsx
const { isAuthenticated, isLoading } = useAuthStore();

if (isLoading) return <LoadingSpinner />;

return (
  <Stack.Navigator>
    {!isAuthenticated
      ? <Stack.Screen name="Login" component={LoginScreen} />
      : <> {/* 로그인 후 화면들 */} </>
    }
  </Stack.Navigator>
);
```

`isAuthenticated`가 true가 되는 순간 **Login Screen이 Navigator 트리에서 아예 사라진다.**

```
로그인 전 스택:  [Login]
로그인 후 스택:  [Tabs]   ← Login이 트리에서 제거됨 → 뒤로가기로 돌아올 곳 없음
```

이 패턴의 장점: logout 시 `navigation.reset()` 같은 수동 조작 없이, `signOut()`으로 `isAuthenticated`를 false로 만들면 Login이 트리에 다시 나타나고 Tabs가 사라지면서 자동으로 로그인 화면으로 전환된다.

### Type-Safe Navigation

```tsx
// RootNavigator.tsx
export type RootStackParamList = {
  Login: undefined;
  Bootstrap: undefined;
  Tabs: undefined;
  AddTransactionModal: undefined;
  ProfileImageModal: {
    profileImageUri?: string | null;
    profileName?: string;
  };
};
```

- `ParamList`를 TypeScript로 정의하면 navigate 호출 시 파라미터 타입이 자동으로 체크된다.
- `ProfileImageModal`처럼 파라미터가 있는 화면은 타입을 명시한다.
- `undefined`는 파라미터가 없는 화면.

---

## 5. State Management

이 앱에는 두 가지 state management 패턴이 공존한다.

### React Context (authStore, transactionsStore)

Context가 없으면 부모 → 자식으로 데이터를 전달할 때 props를 계속 내려줘야 한다:

```
App → RootNavigator → TabNavigator → DashboardScreen → MetricCard (여기서만 씀)
        (전달만)          (전달만)        (전달만)
```

이걸 **Prop Drilling**이라고 한다. Context를 쓰면 Provider 안의 어디서든 바로 꺼낼 수 있어서 이 문제가 사라진다.

**3가지 구성 요소:**

```tsx
// 1. Context 생성 — 공유할 데이터 타입 선언
const Ctx = createContext<AuthStore | null>(null);

// 2. Provider — 데이터를 공급하는 컴포넌트
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);

  return (
    <Ctx.Provider value={{ session, signOut }}>
      {children}  {/* Provider 안의 모든 컴포넌트가 접근 가능 */}
    </Ctx.Provider>
  );
}

// 3. Consumer — 데이터를 꺼내 쓰는 쪽
export function useAuthStore() {
  return useContext(Ctx);  // Provider 안 어디서든 바로 꺼낼 수 있음
}
```

**실제 사용 흐름:**
```
App.tsx
└── AuthProvider  (session 데이터 공급)
    ├── RootNavigator   → useAuthStore()로 바로 꺼냄
    ├── DashboardScreen → useAuthStore()로 바로 꺼냄
    └── ProfileScreen   → useAuthStore()로 바로 꺼냄
```

**왜 Auth는 Context를 썼나?**

Auth는 Supabase의 `onAuthStateChange` 이벤트를 구독해야 한다:

```ts
useEffect(() => {
  supabase.auth.getSession().then(({ data }) => {
    setSession(data.session);  // 앱 시작 시 세션 복원
  });

  const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
    setSession(s);  // 로그인/로그아웃 이벤트 수신
  });

  return () => sub.subscription.unsubscribe();  // cleanup
}, []);
```

이런 **외부 이벤트 구독 + cleanup** 로직은 `useEffect`가 있는 React Context가 자연스럽다. Zustand는 컴포넌트 라이프사이클 밖에 있어서 이런 처리가 번거롭다.

### Zustand (dashboardStore, planStore, settingsStore 등)

Zustand는 **"컴포넌트 바깥에 있는 전역 `useState`"** 라고 보면 된다.

**Boilerplate(보일러플레이트)란?**  
실제 로직과 무관하게 구조상 어쩔 수 없이 써야 하는 반복 코드. Redux는 Action / Reducer / Store / Provider / dispatch를 모두 따로 정의해야 하지만 Zustand는 `create()` 하나로 끝난다. 면접에서 "Why Zustand over Redux?" 질문엔 **"Less boilerplate, no Provider needed, built-in selector support"** 라고 답하면 된다.

```tsx
// dashboardStore.ts 구조
export const useDashboardStore = create<DashboardState>((set) => ({
  dashboard: null,
  isHydrated: false,

  applyDashboardFromBootstrap: (bootstrap) => {
    set({ dashboard: bootstrap.dashboard, isHydrated: true });
  },

  refreshDashboard: async (token) => {
    set({ isRefreshing: true });
    const data = await fetchBootstrap(token);
    set({ dashboard: data.dashboard, isHydrated: true, isRefreshing: false });
  },
}));
```

- `create()`로 store를 만들고 `set()`으로 state를 업데이트한다.
- Provider 없이 어디서든 바로 import해서 쓸 수 있다.
- **언제 Zustand를 쓰나?** — Provider 트리 없이 독립적으로 쓰고 싶을 때, 또는 selector로 필요한 state만 subscribe 하고 싶을 때.

### isHydrated란?

```ts
isHydrated: false  →  true
```

"Hydrate(수화)"는 React에서 **"서버/API에서 받은 데이터로 빈 껍데기를 채운다"** 는 의미로 쓰인다.  
처음에는 store가 비어있다가(`null`) bootstrap API 응답으로 채워지는 순간 `isHydrated: true`가 된다.

화면에서 로딩 게이트로 사용:
```tsx
if (!isHydrated) return <LoadingCard />;  // 아직 데이터 없음 → 로딩 표시
return <Dashboard data={dashboard} />;    // 데이터 있음 → 화면 표시
```

### 화면에서 store 꺼내 쓰는 법 — 방법 1 vs 방법 2

**방법 1 — 전체 store 구독**
```ts
const { dashboard, isHydrated, isRefreshing } = useDashboardStore();
```
store 안에 있는 모든 state를 한 번에 가져온다.  
문제는 내가 `dashboard`만 필요한데 `isRefreshing`이 바뀌어도 이 컴포넌트가 re-render된다.

**방법 2 — Selector로 필요한 것만 구독**
```ts
const dashboard  = useDashboardStore((s) => s.dashboard);
const isHydrated = useDashboardStore((s) => s.isHydrated);
```
`(s) => s.dashboard`가 **selector**. "store 전체(`s`) 중에서 `dashboard`만 줘"라는 의미.  
`dashboard`가 바뀔 때만 re-render. `isRefreshing`이 바뀌어도 영향 없음.

**re-render란?**  
컴포넌트 함수가 다시 실행되고 화면을 다시 계산하는 것. 자주 일어날수록 앱이 느려진다.  
DashboardScreen처럼 계산이 많은 화면에서는 불필요한 re-render를 줄이는 게 중요하다.

| | 방법 1 | 방법 2 (Selector) |
|---|---|---|
| 코드 | `const { a, b } = useStore()` | `const a = useStore(s => s.a)` |
| 구독 범위 | store 전체 | 내가 지정한 값만 |
| re-render 조건 | store 안에 뭐든 바뀌면 | 내가 구독한 값만 바뀌면 |
| 성능 | 불리 | 유리 |

action 함수는 selector로 꺼내는 게 특히 중요하다. action은 절대 바뀌지 않는데 방법 1로 꺼내면 다른 state가 바뀔 때마다 불필요하게 re-render된다:
```ts
// action은 항상 selector로
const refresh = useDashboardStore((s) => s.refreshDashboard);
```

### Context vs Zustand 비교

| | React Context | Zustand |
|---|---|---|
| Provider 필요 | 필요 | 불필요 |
| Boilerplate | 많음 | 적음 |
| Selector | 없음 (전체 re-render) | 있음 (`store(s => s.field)`) |
| 외부 이벤트 구독 | `useEffect`로 자연스럽게 | 번거로움 |
| 주 용도 | Auth처럼 side effect가 있는 경우 | 단순 global state |
| 이 앱에서 | authStore, transactionsStore | dashboardStore, planStore, settingsStore |

---

## 6. Design System — Design Tokens

`apps/mobile/src/app/theme.ts`가 앱 전체 디자인의 SSOT(Single Source of Truth)다.

```ts
export const Colors = {
  ink: "#111111",
  statusGood: "#16A34A",   // green
  statusRisk: "#DC2626",   // red
  overlay04: "rgba(0,0,0,0.04)",
} as const;

export const FontSize = {
  sm: 12,
  md: 14,
  "3xl": 20,
} as const;

export const Spacing = {
  xs: 4,
  md: 8,
  "5xl": 24,
} as const;
```

### Design Token이란?

색상, 크기, 간격 같은 디자인 값을 **이름 있는 상수**로 관리하는 것.  
`"#16A34A"` 대신 `Colors.statusGood`을 쓰면:
- 디자인 변경 시 `theme.ts` 한 곳만 수정하면 앱 전체에 적용된다.
- 코드를 읽을 때 의도가 명확하다 ("statusGood이니까 초록색이겠구나").
- 면접에서 "design system" 또는 "design tokens" 얘기가 나오면 이 패턴을 언급할 수 있다.

### as const란?

```ts
export const Colors = { ink: "#111111" } as const;
```

- TypeScript에게 "이 객체의 값은 절대 바뀌지 않는다"고 알려주는 것.
- `Colors.ink`의 타입이 `string`이 아니라 `"#111111"` (literal type)이 된다.
- 오타 방지 + IDE 자동완성 강화.

---

## 7. API Layer

### Base Layer: `api/http.ts`

```ts
export async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, { ...options, headers });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as T;
}
```

- 모든 HTTP 요청의 공통 로직(URL 조합, 에러 처리, Content-Type 헤더)을 한 곳에 모았다.
- Generic `<T>`를 써서 응답 타입을 caller가 지정할 수 있다.
- `fetch`는 브라우저 Web API. React Native에서도 동일하게 사용 가능.

### Domain Layer: `api/transactionsApi.ts` 등

```ts
export const transactionsApi = {
  getList: (params) => request('/api/transactions', { headers: { Authorization: `Bearer ${token}` } }),
  create:  (token, payload) => request('/api/transactions', { method: 'POST', body: JSON.stringify(payload) }),
  update:  (token, id, patch) => request(`/api/transactions/${id}`, { method: 'PATCH' }),
  delete:  (token, id) => request(`/api/transactions/${id}`, { method: 'DELETE' }),
};
```

- `http.ts`의 `request()`를 래핑해서 도메인별 API 함수를 만든다.
- 화면(screen)이나 store가 HTTP 세부사항을 몰라도 되도록 추상화한다.

### Authorization 흐름

```
사용자 로그인
  → Supabase가 access_token (JWT) 발급
  → authStore에 저장
  → 모든 API 요청 헤더에 Authorization: Bearer <access_token> 포함
  → 서버가 토큰 검증 후 user 식별
```

---

## 8. Custom Hooks

Custom hook은 "React 로직을 재사용하는 함수"다. 이름은 반드시 `use`로 시작한다.

### useBootStrap

```ts
export function useBootStrap() {
  const auth = useAuthStore();
  const { applyBootstrapPlan } = usePlanStore();
  const applyDashboard = useDashboardStore(s => s.applyDashboardFromBootstrap);

  const runBootstrap = useCallback(async () => {
    const payload = await fetchBootstrap(auth.supabaseAccessToken);
    applyUserPrefs(payload.user);
    applyBootstrapPlan(payload);
    applyDashboard(payload);
  }, [auth.supabaseAccessToken]);

  return { runBootstrap, isBootstrapping, bootstrapError };
}
```

- 여러 store에 bootstrap 데이터를 나눠 저장하는 복잡한 로직을 hook 하나로 캡슐화했다.
- `BootstrapScreen`과 `transactionsStore`가 모두 이 hook을 사용한다 → 중복 없음.

### useCallback이란?

```ts
const runBootstrap = useCallback(async () => { ... }, [dependency]);
```

- 함수를 메모이제이션한다. dependency가 바뀌지 않으면 같은 함수 reference를 유지.
- 함수를 `useEffect`의 dependency에 넣을 때 무한 루프 방지에 필수.

### Custom Hook vs Component

| | Custom Hook | Component |
|---|---|---|
| 반환값 | 데이터/함수 | JSX |
| UI 포함 | 없음 | 있음 |
| 재사용 목적 | 로직 재사용 | UI 재사용 |
| 이름 | `use`로 시작 | 대문자로 시작 |

---

## 9. Component Patterns

### MetricCard — Props 기반 재사용 컴포넌트

```tsx
type Props = {
  title: string;
  value: string;
  sub?: React.ReactNode;    // string 또는 JSX 모두 가능
  status?: { label: string; color: string };
  progress?: { ratio: number; color: string };
  variant?: "default" | "detail";
};

export function MetricCard({ title, value, sub, status, progress, variant }: Props) {
  const isDetail = variant === "detail";
  // ...
}
```

- `React.ReactNode`는 "JSX, string, number, null 등 렌더링 가능한 모든 것"을 받는 타입.
- `variant` prop으로 같은 컴포넌트를 두 가지 스타일로 사용한다. (variant 패턴)
- Optional props(`?`)는 있어도 되고 없어도 된다.

### ScreenLayout — Slot 패턴

```tsx
// ScreenLayout.tsx
type Props = {
  header: React.ReactNode;  // "slot"
  children: React.ReactNode;
};

// 사용 예 (DashboardScreen.tsx)
<ScreenLayout
  header={<ScreenHeader title="Dashboard" subtitle="..." />}
>
  <MetricCard ... />
</ScreenLayout>
```

- `header`를 prop으로 받아서 레이아웃 안에 끼워 넣는다 → Slot 패턴 (웹의 `<slot>`과 같은 개념).
- 화면마다 달라지는 헤더를 유연하게 주입할 수 있다.

### StyleSheet.create

```tsx
const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing["5xl"],
  },
});
```

- React Native에서 CSS 대신 사용하는 스타일 정의 방식.
- `StyleSheet.create()`로 감싸면 Native 측에서 스타일 객체를 최적화(flatten)해 준다.
- 직접 인라인 객체(`style={{ ... }}`)를 쓰면 렌더마다 새 객체가 생성되므로 성능에 불리.

---

## 10. TypeScript Patterns

### Generic 함수

```ts
async function request<T>(endpoint: string): Promise<T> {
  return response.json() as T;
}

// 사용
const data = await request<DashboardPayloadDTO>('/api/bootstrap');
// data는 DashboardPayloadDTO 타입
```

- `<T>`는 타입 파라미터. 호출 시점에 구체적인 타입을 주입한다.
- 한 함수로 다양한 응답 타입을 type-safe하게 처리할 수 있다.

### Union Type + Type Guard

```ts
type CashflowHealthKey = "HEALTHY" | "OK" | "CAUTION" | "RISK";

function cashflowHealthKeyFromRemainingRatio(ratio: number): CashflowHealthKey {
  if (ratio < 0) return "RISK";
  if (ratio < 0.1) return "CAUTION";
  if (ratio < 0.3) return "OK";
  return "HEALTHY";
}
```

- Union type: 가능한 값을 명시적으로 열거한다.
- TypeScript가 모든 케이스를 강제하므로 새 케이스 추가 시 컴파일 에러로 알려준다 (exhaustive check).

### Discriminated Union (Discriminant)

```ts
// @pq/shared
type TxType = "EXPENSE" | "INCOME" | "SAVING";

type Transaction = {
  type: TxType;
  category: string;
  savingsGoalId?: string | null;  // SAVING일 때만 의미 있음
};
```

- 하나의 type 필드로 객체의 형태를 구분하는 패턴.
- 면접에서 "discriminated union" 또는 "tagged union"이라고 부른다.

### useMemo

```ts
const periodLabel = useMemo(() => {
  const periodType = getPlanPeriodType(plan);
  return periodLabelText(getPeriodLabelKey(periodType));
}, [plan]);
```

- 계산 비용이 있는 값을 메모이제이션한다.
- dependency(`plan`)가 바뀌지 않으면 이전에 계산한 값을 재사용.
- 렌더링마다 반복 계산을 피할 때 사용.

---

## 11. Data Flow — 앱이 켜지고 화면이 그려지기까지

```
1. App.tsx
   └── AuthProvider 마운트
       └── supabase.auth.getSession() 호출
           └── 세션 있으면: isAuthenticated = true
           └── 세션 없으면: isAuthenticated = false

2. RootNavigator
   └── isAuthenticated = false → LoginScreen 렌더
   └── isAuthenticated = true  → BootstrapScreen 렌더

3. BootstrapScreen
   └── useBootStrap().runBootstrap() 호출
       └── GET /api/bootstrap (Bearer token 포함)
           └── 서버가 user + plan + dashboard 한 번에 반환
               ├── userPrefsStore 업데이트 (언어, 통화 등)
               ├── planStore 업데이트 (활성 플랜)
               └── dashboardStore 업데이트 (대시보드 데이터)

4. Bootstrap 완료 → navigation.replace("Tabs")

5. TabNavigator → DashboardScreen
   └── useDashboardStore()로 데이터 읽기
   └── useUserPrefsStore()로 통화/언어 읽기
   └── domain 함수로 계산(비율, 상태 등)
   └── JSX 렌더링
```

### Bootstrap 패턴이란?

앱 시작 시 서버에서 필요한 모든 초기 데이터를 **한 번의 API 호출**로 받아오는 패턴.  
개별 화면이 각자 데이터를 fetch하면 화면 전환마다 로딩이 생기고 네트워크 왕복이 늘어난다.  
Bootstrap으로 초기화하면 메인 앱 진입 후에는 이미 데이터가 store에 준비된 상태다.

---

## 면접에서 쓸 수 있는 키워드 정리

| 패턴/개념 | 이 앱에서 어디 | 영어로 설명할 때 |
|---|---|---|
| Auth gate | RootNavigator | "conditional rendering based on auth state" |
| Design tokens | theme.ts | "centralized design system with typed constants" |
| Global state | Zustand stores | "lightweight global state with selectors" |
| Custom hook | useBootStrap | "encapsulating reusable stateful logic" |
| Bootstrap pattern | BootstrapScreen | "single API call to hydrate initial app state" |
| Slot pattern | ScreenLayout | "composition via render props / children" |
| Variant prop | MetricCard | "single component with multiple visual modes" |
| SSOT | theme.ts, @pq/shared | "single source of truth for shared contracts" |
| Type-safe navigation | RootStackParamList | "strongly typed route params" |
| Discriminated union | TxType | "tagged union for exhaustive type narrowing" |
