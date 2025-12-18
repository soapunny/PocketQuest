# PocketQuest 🧭💰

**A goal-driven budgeting app where your character grows as you manage money better.**

PocketQuest is a **mobile-first personal finance app** that combines:

- Expense / income / saving tracking
- Weekly budget & item-based goals
- RPG-style character growth (XP & levels)

As you complete your financial goals, **your character levels up** — turning budgeting into a motivating quest.

---

## ✨ Core Concept

PocketQuest is built around **weekly plans**.

Example:

- **Budget Goals**
  - Groceries ≤ $80
  - Insurance ≤ $120
- **Item Goals**
  - Chicken breast
  - Protein bar
  - Banana
  - Instant rice
  - Apple juice

When you:

- Stay under budget
- Purchase planned items
- Maintain weekly streaks

→ You gain **XP**, level up, and visually grow your character.

---

## 🧩 Key Features (MVP)

- 📱 **Mobile app (React Native + Expo)**
- 💸 Transactions
  - Expense / Income / Saving
  - Category-based
  - Optional item tags
- 🎯 Weekly Plans
  - Numeric budget goals
  - Item checklist goals
- 📊 Progress Engine
  - Goal completion rate
  - XP & level calculation
- 🧙 Character Growth UI
  - Level
  - XP bar
  - Growth stages
- 🌍 Internationalization
  - English / Korean
- 🗄️ Backend API
  - Next.js API routes
  - PostgreSQL + Prisma

---

## 🏗️ Tech Stack

### Mobile App

- React Native
- Expo
- TypeScript
- React Navigation
- TanStack Query (React Query)
- i18next (EN / KO)

### Backend

- Next.js (API-only)
- TypeScript
- Prisma ORM
- PostgreSQL

### Tooling

- pnpm (monorepo)
- VS Code
- Jira (Kanban)

---

## 📁 Project Structure (Monorepo)

pocketquest/
├── apps/
│ ├── mobile/ # React Native (Expo) - Frontend
│ │ ├── app.config.ts # Expo config & env
│ │ ├── app.json
│ │ └── src/
│ │ ├── app/
│ │ │ ├── navigation/ # React Navigation setup
│ │ │ │ ├── RootNavigator.tsx
│ │ │ │ └── TabNavigator.tsx
│ │ │ ├── screens/ # App screens
│ │ │ │ ├── DashboardScreen.tsx
│ │ │ │ ├── TransactionsScreen.tsx
│ │ │ │ ├── AddTransactionModal.tsx
│ │ │ │ ├── WeeklyPlanScreen.tsx
│ │ │ │ ├── CharacterScreen.tsx
│ │ │ │ └── SettingsScreen.tsx
│ │ │ ├── components/ # Reusable UI components
│ │ │ │ ├── SummaryCards.tsx
│ │ │ │ ├── TransactionForm.tsx
│ │ │ │ ├── TransactionList.tsx
│ │ │ │ ├── GoalCards.tsx
│ │ │ │ ├── XpBar.tsx
│ │ │ │ └── CharacterStage.tsx
│ │ │ ├── lib/ # Client-side utilities
│ │ │ │ ├── api.ts # API client (fetch/axios)
│ │ │ │ ├── queryClient.ts # TanStack Query setup
│ │ │ │ ├── date.ts # Week/date helpers
│ │ │ │ └── storage.ts # Local storage helpers
│ │ │ ├── i18n/ # Internationalization
│ │ │ │ ├── index.ts # i18n initialization
│ │ │ │ ├── en.json
│ │ │ │ └── ko.json
│ │ │ └── theme/ # Design tokens
│ │ │ └── tokens.ts
│ │ └── main.tsx # App entry point
│ │
│ └── api/ # Backend API (Next.js)
│ ├── src/
│ │ ├── app/
│ │ │ └── api/ # API routes
│ │ │ ├── health/route.ts
│ │ │ ├── auth/ # Authentication
│ │ │ │ ├── sign-in/route.ts
│ │ │ │ └── sign-up/route.ts
│ │ │ ├── transactions/
│ │ │ │ ├── route.ts
│ │ │ │ └── [id]/route.ts
│ │ │ ├── plans/
│ │ │ │ └── week/
│ │ │ │ ├── route.ts
│ │ │ │ ├── budget-goals/route.ts
│ │ │ │ └── item-goals/route.ts
│ │ │ └── progress/
│ │ │ └── week/route.ts
│ │ └── lib/
│ │ ├── prisma.ts # Prisma client
│ │ ├── validators.ts # Zod schemas
│ │ ├── progress.ts # XP & level logic
│ │ └── date.ts # Week/date helpers
│ ├── .env.local
│ └── package.json
│
├── packages/
│ └── shared/ # Shared logic & types
│ └── src/
│ ├── types.ts # Shared TypeScript types
│ ├── schemas.ts # Shared Zod schemas
│ ├── constants.ts # Enums, XP rules, defaults
│ └── i18nKeys.ts # Translation key references
│
├── prisma/ # Database layer
│ ├── schema.prisma
│ ├── seed.ts
│ └── migrations/
│
├── docs/ # Documentation
│ ├── PRD.md
│ ├── API.md
│ └── DB.md
│
├── pnpm-workspace.yaml
├── package.json # Root scripts
├── tsconfig.base.json
└── README.md

---

### 🧭 Architecture Summary

- **Frontend**

  - React Native (Expo)
  - Mobile-only UI
  - Communicates with backend via REST API

- **Backend**

  - Next.js (API routes only)
  - Prisma ORM
  - PostgreSQL database

- **Shared**
  - Zod schemas
  - TypeScript types
  - Business rules (XP, enums)

This structure allows **clear separation of concerns** while keeping
a single source of truth for core logic.

---
