# PocketQuest 🧭💰

**PocketQuest is a mobile-first budgeting app that turns financial planning into a clear, structured monthly system.**

It focuses on:

- Monthly budget & savings planning
- Clear visibility into spending vs income
- A foundation for future gamification (character system planned later)

This repository contains a **monorepo** with:

- A React Native (Expo) mobile app
- A Next.js API server
- PostgreSQL database via Prisma

---

## ✨ Current Status (What’s Implemented)

### ✅ Completed

- Monthly plan lifecycle (create → update → reload)
- Server-backed budget goals & savings goals
- Timezone-aware monthly periods
- React Native UI fully wired to backend
- PostgreSQL + Prisma integration
- End-to-end flow: **Mobile → API → DB → Mobile**

### ⏸️ Planned / Deferred

- Adding brand-new goals not previously saved
- Weekly / bi-weekly plans
- Character / XP system (intentionally postponed)
- Authentication & multi-user flows

---

## 🧠 Core Concept (Current)

PocketQuest is built around **monthly plans**.

Each month has **at most one plan per user**.

A monthly plan contains:

- Total budget limit
- Budget goals (by category)
- Savings goals
- Currency & language
- Timezone-aware period start

### Why monthly?

- Predictable income & expenses
- Simpler mental model
- Easier server-side consistency
- Scales naturally to weekly/bi-weekly later

---

## 🧩 Key Features (Current MVP)

### 📱 Mobile App (React Native + Expo)

- Dashboard overview
- Monthly plan editor
- Budget goals by category
- Savings goals
- Transactions list & filters
- English / Korean support

### 🗄️ Backend API

- Next.js App Router (API-only)
- Monthly plan upsert (idempotent)
- Plan update via PATCH
- Transaction CRUD
- Health check endpoint

### 🗃️ Database

- PostgreSQL
- Prisma ORM
- Strict uniqueness:

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
- VS Code / Cursor
- Git + GitHub
- Jira (Kanban)

---

## 📁 Project Structure (Actual)

```text
pocketquest/
├── apps/
│ ├── mobile/ # React Native (Expo)
│ │ └── src/app/
│ │ ├── screens/ # Dashboard, Plan, Transactions, Settings
│ │ ├── components/ # Shared UI (ScreenHeader, Layout, Cards)
│ │ ├── lib/ # planStore, api clients, helpers
│ │ ├── i18n/ # EN / KO translations
│ │ └── theme/ # Typography, spacing, tokens
│ │
│ └── server/ # Next.js API-only server
│ └── src/app/api/
│ ├── health/
│ ├── plans/
│ │ └── monthly/
│ ├── transactions/
│ └── auth/ # Placeholder
│
├── prisma/
│ ├── schema.prisma
│ └── migrations/
│
├── packages/
│ └── shared/ # (planned) shared types & schemas
│
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

---

## 🧭 Monthly Plan Lifecycle

PocketQuest operates around a **MONTHLY plan model**.

Each user can have **at most one plan per month**, enforced at the database level using a unique constraint on:

(userId, periodType, periodStart)

This guarantees idempotent behavior and prevents duplicate plans for the same month.

---

### 1) Create or Get Monthly Plan (Upsert)

POST /api/plans/monthly

- The client sends a userId and optionally an at parameter (e.g. 2026-01).
- The server calculates the correct periodStart based on the user’s timeZone.
- If a plan for (userId, MONTHLY, periodStart) already exists, it is returned.
- Otherwise, a new plan is created and returned.
- This operation is safe to call repeatedly.

---

### 2) Update Monthly Plan (Budget & Savings Goals)

PATCH /api/plans/monthly

This endpoint updates:

- Total monthly budget limit
- Budget goals (by category)
- Savings goals

The server replaces the goal sets when provided, ensuring consistency.

The API accepts both naming styles for compatibility:

- limitMinor / targetMinor (server & database standard)
- limitCents / targetCents (mobile UI naming)

Internally, all values are stored as minor currency units.

---

### 3) Reload & Hydrate on App Start

When the mobile app launches or the Plan screen mounts:

1. The app calls POST /api/plans/monthly
2. The server returns the current monthly plan
3. The response is applied via applyServerPlan() in planStore
4. The UI re-renders using persisted server data

This completes the full loop:

Mobile UI → API → Database → Mobile UI

---

## 🕒 Timezone Handling

Timezone correctness is a first-class concern.

- Each user has a timeZone field (IANA format, e.g. America/New_York)
- Monthly periodStart is calculated using the user’s local timezone
- The computed value is stored in UTC for consistency
- This prevents duplicate or shifted plans across timezones

---

## 💾 Data Model (Simplified)

Plan

- userId
- periodType (MONTHLY)
- periodStart (UTC)
- totalBudgetLimitMinor
- budgetGoals[]
- savingsGoals[]
- currency
- language

Transaction

- userId
- type (EXPENSE | INCOME | SAVING)
- amountMinor
- currency
- category
- occurredAt

---

## 🚀 Running Locally

Backend:
cd apps/server
pnpm install
pnpm dev

Mobile:
cd apps/mobile
pnpm install
pnpm start

Make sure PostgreSQL is running and DATABASE_URL is configured.

---

## 📌 Design Philosophy

- Server is the source of truth
- Consistency over premature features
- Timezone correctness before analytics
- Clear UX before gamification

PocketQuest prioritizes correctness and clarity over speed of feature delivery.

---

## 🛣️ Next Steps

- Fix edge case: adding new goals not previously saved
- Introduce weekly / bi-weekly plans
- Authentication & multi-user support
- Analytics and insights
- Optional gamification layer
