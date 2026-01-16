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

### Tooling

- pnpm (monorepo)
- Cursor / VS Code
- Git + GitHub
- Jira (Kanban)

---

## 📁 Project Structure (Actual)

```text
pocketquest/
├── apps/
│ ├── mobile/
│ │ └── src/app/
│ │   ├── screens/        # Dashboard, Plan, Transactions, Settings
│ │   ├── components/     # Shared UI components
│ │   ├── lib/            # planStore, API clients, helpers
│ │   ├── i18n/           # EN / KO translations
│ │   └── theme/          # Design tokens
│ │
│ └── server/
│   └── src/app/api/
│     ├── plans/          # Unified plan endpoints
│     │ └── rollover/     # Period rollover logic
│     ├── transactions/
│     └── health/
│
├── prisma/
│ ├── schema.prisma
│ └── migrations/
│
├── packages/
│ └── shared/             # (planned) shared types & schemas
│
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

## 📌 Design Philosophy

- Server is the source of truth
- Consistency over premature features
- Timezone correctness before analytics
- Clear UX before gamification

PocketQuest prioritizes correctness, clarity, and long-term extensibility.

## 🛣️ Next Steps

- Refine advanced currency mode (home vs display)
- Automated rollover (cron-based)
- Authentication & multi-user support
- Analytics and insights
- Optional gamification layer

---
