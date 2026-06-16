# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Root (pnpm workspaces)
```bash
pnpm dev:server        # Start Next.js API server on :3001
pnpm dev:mobile        # Start Expo mobile app with tunnel
pnpm dev:mobile_expo   # Start Expo mobile app (no tunnel)
```

### Server (`apps/server`)
```bash
pnpm --filter ./apps/server dev              # Dev server (port 3001)
pnpm --filter ./apps/server build            # Production build
pnpm --filter ./apps/server lint             # ESLint via next lint
pnpm --filter ./apps/server prisma:generate  # Regenerate Prisma client
pnpm --filter ./apps/server prisma:migrate   # Apply pending migrations
pnpm --filter ./apps/server prisma:studio    # Open Prisma Studio
```

### Mobile (`apps/mobile`)
```bash
pnpm --filter ./apps/mobile start    # Expo start
pnpm --filter ./apps/mobile ios      # iOS simulator
pnpm --filter ./apps/mobile android  # Android emulator
```

No test suite exists yet. Manual tracing is the expected verification path (see backend architecture rules).

---

## Architecture

### Monorepo layout
| Package | Role |
|---|---|
| `apps/server` | Next.js 14 API (Route Handlers only — no pages). Port 3001. |
| `apps/mobile` | React Native / Expo mobile client. |
| `packages/shared` | SSOT for all cross-layer contracts. Imported as `@pq/shared`. |

### `packages/shared` — contract SSOT
All request/response DTOs, Zod schemas, shared enums, and canonical domain types live here. Never define a new cross-layer shape in the server or mobile app directly — add it to `packages/shared` first. Domains: `auth`, `bootstrap`, `transactions`, `plans`, `money`.

### Server layer order: Route → Service → Repository → Mapper
- **Routes** (`src/app/api/**/route.ts`): HTTP parsing, Zod validation, auth check via `requireUserId`, response formatting. Never touch Prisma directly.
- **Services** (`src/domain/*/\*.service.ts`): Business logic and AuthZ (ownership checks). No Prisma access — delegate to repositories.
- **Repositories** (`src/domain/*/\*.repository.ts`): All Prisma queries. Return raw Prisma shapes.
- **Mappers** (`src/domain/*/\*.mapper.ts`): Convert Prisma shapes to `@pq/shared` DTOs before they leave the domain.

Shared error utilities:
- `lib/http/httpError.ts` — `HttpError`, `jsonRouteError`, `jsonUnauthorized`
- `lib/prisma/prismaErrors.ts` — `prismaHttpGuard` wraps Prisma calls and translates known error codes (P2025 → 404, P2002 → 409)

### Authentication
`lib/auth.ts` exposes `requireUserId(request)`. It verifies the Supabase Bearer token, then maps the Supabase UUID to the internal `User.id` via `prisma.user.findUnique({ where: { supabaseUserId } })`. In non-production, an `x-dev-user-id` request header (or `?userId=` query param, or `DEV_USER_ID` env var) bypasses Supabase and passes the raw internal user id directly — this is the local dev workflow.

### Mobile design system
- **Token SSOT**: `apps/mobile/src/app/theme.ts` exports `Colors`, `FontSize`, `FontWeight`, `Spacing`, `Radius`, `Opacity`. All screens and components must import from this file — never hardcode color strings, font sizes, or spacing numbers directly in StyleSheets.
- **Styling approach**: React Native `StyleSheet.create()` with theme tokens. No Tailwind/CSS — this is not a web app.
- **Typography utilities**: `apps/mobile/src/app/components/Typography.ts` exports reusable text style objects (`CardSpacing`, etc.) built on top of theme tokens.

### Mobile state and data flow
- **Auth**: `AuthProvider` / `useAuthStore` (React Context) wraps Supabase session. Supabase `access_token` is passed as `Authorization: Bearer` to every API call.
- **Global state**: Zustand stores (`authStore`, `dashboardStore`, `planStore`, `transactionsStore`, `settingsStore`, `userPrefsStore`).
- **API layer**: `src/app/api/http.ts` — base `request<T>()` function. Domain-specific modules (e.g. `plansApi.ts`, `transactionsApi.ts`) wrap it.
- **Bootstrap**: On login, the app hits `GET /api/bootstrap` which returns the active plan, monthly nav list, dashboard summary, and user prefs in a single payload (`BootstrapResponseDTO`). This is how the mobile app initialises.
- **Navigation**: `RootNavigator` (stack) gates on `isAuthenticated`. After auth, flow is Login → Bootstrap → Tabs (Dashboard / Transactions / Plan / Profile).

### Data model key points
- Money is always stored as **minor units** (`amountMinor: Int`, i.e., cents or won). Never store decimal amounts.
- `Transaction.type` is `EXPENSE | INCOME | SAVING`. `SAVING` transactions must link to a `SavingsGoal` via `savingsGoalId`.
- `Plan` has a `timeZone` snapshot (Policy A): period boundaries for a plan must use the timezone captured at creation time, not the user's current timezone.
- `User.activePlanId` is a unique self-relation pointing to the current plan. Bootstrap auto-creates a default plan if none exists.
- Period dates are stored as `Timestamptz` UTC. Local display strings are derived server-side using `date-fns-tz`.

### Prisma schema changes
Follow this sequence: update `schema.prisma` → `prisma:migrate` → `prisma:generate` → update repositories → update services/DTOs. See `.agents/rules/40-prisma-and-persistence.md` for the full checklist.

### Agent rules
Detailed architectural rules are in `.agents/rules/`. The `00-global-architecture.md` rule is always active; the others (`10-frontend`, `20-backend`, `30-shared-contract`, `40-prisma`) apply when editing their respective layers. Consult them before making cross-layer contract changes.
