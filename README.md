# PocketQuest 🧭💰

**PocketQuest is a mobile-first budgeting app that turns financial planning into a clear, structured, period-based system.**

PocketQuest focuses on:

- Period-based budget & savings planning (Monthly / Weekly / Bi-weekly)
- Clear visibility into spending vs income
- Server-first consistency (API → DB → UI)
- A solid foundation for future gamification

This repository is a **monorepo** containing:

- A React Native (Expo) mobile app
- A Next.js API-only server
- PostgreSQL database via Prisma

---

## ✨ Current Status

### ✅ Implemented

#### 📅 Plan System

- **Monthly / Weekly / Bi-weekly plans**
- One plan per `(userId, periodType, periodStart)` (DB-enforced uniqueness)
- Switching periods instantly activates the correct plan
- Plans persist independently per period type
- Automatic plan creation when switching periods (idempotent upsert)

#### 🧾 Transaction System

- Canonical categories live in `packages/shared/src/transactions/categories.ts`
- EXPENSE / INCOME transactions use category keys; legacy `uncategorized` migrated to unified `other` fallback
- SAVING transactions require `savingsGoalId` and do not use category selection
- Clear separation of:
  - **EXPENSE / INCOME** → category-based
  - **SAVING** → goal-based (`savingsGoalId`), category fixed to `"savings"`
- Safe partial updates (PATCH) without unintended overwrites

#### 🔄 Active Plan Management

- `User.activePlanId` is the single source of truth
- No `isActive` flag on Plan (simpler and safer)
- Switching period updates `activePlanId` only
- Historical plans are preserved

#### 💱 Currency Handling

- Currency is stored **per Plan** (`Plan.currency`)
- Switching periods **does not overwrite currency**
- Each plan retains its own currency  
  (e.g. weekly = USD, bi-weekly = KRW)
- Currency changes persist to DB via PATCH
- UI automatically syncs to the active plan’s currency

#### 🌍 Timezone Correctness

- Each user has an IANA timezone (e.g. `America/New_York`)
- Period boundaries are calculated in the user’s local timezone
- Stored in UTC for consistency
- Weekly plans start on **Monday**
- Bi-weekly plans use a fixed anchor date

#### 📱 Mobile ↔ Server Sync

- Server is the source of truth
- Mobile hydrates state exclusively from server responses
- Optimistic UI updates with server confirmation
- Safe fallbacks for dev / offline scenarios

---

## 🧠 Core Concept

PocketQuest is built around **period-based plans**.

Each plan is uniquely identified by:
(userId, periodType, periodStart)

A plan contains:

- Total budget limit
- Budget goals (by category)
- Savings goals
- Currency
- Language
- Timezone-aware period boundaries

A transaction belongs to the active plan and is classified as one of:

- **EXPENSE** – categorized spending (e.g. groceries, rent)
- **INCOME** – categorized income (e.g. salary, bonus)
- **SAVING** – contributions tied to a specific savings goal

Transaction categories are validated against shared canonical keys and normalized before persistence.

Plans are immutable by period.  
Switching periods activates a different plan instead of mutating the existing one.

---

## 🧩 Key Features (Current MVP)

### 📱 Mobile App (React Native + Expo)

- Dashboard overview
- Period selector (Monthly / Weekly / Bi-weekly)
- Budget goals editor
- Savings goals editor
- Transaction list & filters
- Currency switching (USD / KRW)
- English / Korean support

#### Dashboard UX

- Status chips with emoji semantics: Good ✅, Caution ⚠️, Over ❌
- Remaining-based percentages and progress bars provide quick visual feedback
- Recent Transactions removed from Dashboard; use Transactions tab for details

### 🗄️ Backend API (Next.js App Router)

- Period-aware plan upsert (POST / PATCH)
- Active plan switching
- Currency persistence per plan
- Transaction CRUD
- Timezone-safe period calculations

### 🗃️ Database (PostgreSQL + Prisma)

- Strict uniqueness constraints
- Idempotent plan creation
- Clear separation of user vs plan state

---

## 🏗️ Tech Stack

### Mobile

- React Native
- Expo
- TypeScript
- React Navigation
- i18next (EN / KO)

### Backend

- Next.js (API routes only)
- TypeScript
- Prisma ORM
- PostgreSQL
- Supabase

### Tooling

- pnpm (monorepo)
- Cursor / VS Code
- Git + GitHub
- Shared domain logic via `packages/shared` (SSOT)

---

## 📁 Project Structure (Actual)

```text
PocketQuest/
├── apps/
│   ├── mobile/
│   │   ├── src/app/
│   │   │   ├── api/
│   │   │   ├── components/
│   │   │   ├── config/
│   │   │   ├── domain/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   ├── navigation/
│   │   │   ├── screens/
│   │   │   ├── store/
│   │   │   └── oauth.tsx
│   │   ├── .env.development
│   │   ├── app.json
│   │   ├── App.tsx
│   │   ├── babel.config.js
│   │   ├── index.ts
│   │   ├── metro.config.js
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── server/
│       ├── prisma/
│       │   ├── migrations/
│       │   └── schema.prisma
│       ├── src/
│       │   ├── app/api/
│       │   │   ├── auth/
│       │   │   ├── bootstrap/
│       │   │   ├── character/
│       │   │   ├── health/
│       │   │   ├── plans/
│       │   │   ├── transactions/
│       │   │   └── users/me/
│       │   ├── lib/
│       │   │   ├── bootstrap/
│       │   │   └── plan/
│       │   ├── auth.ts
│       │   ├── categories.ts
│       │   ├── prisma.ts
│       │   └── middleware.ts
│       ├── .env
│       ├── next.config.js
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   └── shared/
│       └── src/
│           └── plans/
│               └── types.ts
│           └── transactions/
│               ├── categories.ts
│               └── types.ts
│
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

## 📌 Design Philosophy

- Server is the source of truth
- Consistency over premature features
- Timezone correctness before analytics
- Single Source of Truth (SSOT) for shared domain rules

PocketQuest prioritizes correctness, clarity, and long-term extensibility.

---

## 정책

- General
- Cashflow
  - UI
    - 메인 Cashflow = Income − Expense (Operational Cashflow)
    - Cashflow 섹션에서 Details를 누르면
    - 하위 카드로 Cashflow (Spendable) (Income − Expense − Savings)
    - 그리고 목표(Goal)별 누적 저축액 목록(타겟/진행률 없이 “금액만”)
  - Rolling은 아직 구현하지 말고, 구조만 확장 가능하게
  - Carryout
    - Carryover 범위: Rolling (최초 시작부터 누적 net)
      - 특정 달만 이월 X
      - 항상 “전체 기간 누적 결과”가 현재에 반영
    - 과거 tx 수정 시: 이후 모든 기간 재계산
      - SSOT 관점에서 정답
    - 첫 사용 carryover: 0
      - 초기 잔액 입력 UI 없음
      - 필요하면 “Income(또는 adjustment)” tx로 처리
    - 기본값 OFF, 설정에서 ON
- Transaction
  - SAVING ↔ EXPENSE 전환 허용
    - EXPENSE → SAVING
      - 반드시 Savings Goal 선택 필수
      - Unassigned 선택 불가
      - goal 선택 전까지 Save 비활성화
      - SAVING → EXPENSE
      - 반드시 Expense category 선택 필수
      - fallback 자동선택 OK (예: 첫 category)
- Plan
  - Type
    - Weekly
    - Biweekly
    - Monthly
  - BudgetGoal
  - SavingsGoal
    - 생성
    - 편집
    - 삭제
      - 삭제된 goal에 연결된 saving transactions 처리 정책(유지 + goalId null)
      - Transactions: savingsGoalId가 null/빈 문자열이면 라벨을 **“Unassigned / 미지정”**으로 표시, 필터/검색에도 정상적으로 걸리게, 미지정 트랜잭션”을 유저가 다시 어떤 goal로 재할당할 수 있게, 특정 goal로 할당된 tx를 Unassigned로 바꾸는 것은 금지
      - Dashboard: goalId=null로 묶인 savedMinor를 “Unassigned” 한 줄로 보여주기
      - Add Transaction: Unassigned도 선택 가능하게 열어두되, 기본값은 “첫 번째 goal”로 세팅
