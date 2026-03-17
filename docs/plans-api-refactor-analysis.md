# Plans API Refactor — Stage 1: Analysis

## 1. Current Responsibilities Per File

### `apps/server/src/app/api/plans/route.ts` (773 lines)
- **Auth**: Local `getDevUserId`, `resolveInternalUserId` (duplicated from lib/auth)
- **DTO conversion**: Local `toServerPlanDTO` (plan → ServerPlanDTO)
- **GET**: 4 flows in one handler:
  1. Monthly list: `periodType=MONTHLY&(at|months)` → build period starts, findMany, map to items
  2. Exact lookup: `periodType + periodStartISO` → findUnique by composite key
  3. Active plan: user.activePlanId → findUnique
  4. Fallback: latest plan → findFirst, or auto-create via `ensureDefaultActivePlan`, restore activePlanId
- **POST**: Create plan — period calculation (weekly/biweekly/monthly), upsert, active handling
- **PATCH**: Update plan — same period logic as POST, upsert, active handling
- **Prisma**: Direct `prisma.*` calls throughout
- **Error handling**: Manual `NextResponse.json({ error: ... }, { status })` branches; no `jsonRouteError`

### `apps/server/src/app/api/plans/actions/rollover/route.ts` (261 lines)
- **Auth**: Local `getDevUserId` (env-only), `resolveInternalUserId` (no dev header/body fallback)
- **DTO conversion**: Local `toServerPlanDTO` (duplicated)
- **Business logic**: ensurePeriodEnd, loop to create next periods, copy goals on first create, P2002 retry
- **Prisma**: Direct `prisma.$transaction` with plan create, goal copy, user update
- **Error handling**: ZodError branch, generic 500; no `jsonRouteError`

### `apps/server/src/app/api/plans/[id]/actions/switch-currency/route.ts` (278 lines)
- **Auth**: Local `resolveInternalUserId` (no dev fallback at all)
- **DTO conversion**: Local `toServerPlanDTO` with **different** budget goal mapping (category → lowercase trim)
- **Business logic**: switchMode/goalsMode, buildPeriodForNowUTC, convertPlanMinorPayload, upsert plan + goals
- **Prisma**: Direct `prisma.$transaction`
- **Error handling**: `jsonError` helper, ZodError branch; no `jsonRouteError`

### `apps/server/src/app/api/plans/[id]/goals/budget/route.ts` (379 lines)
- **Auth**: `requireActorUserId` (Supabase-only, no dev fallback)
- **DTO conversion**: Local `toServerPlanDTO` with `toFiniteNumberOrNull` and category lowercase
- **GET**: findUnique plan, return budgetGoals
- **POST**: normalize category, limit<=0 delete, findMany by category (insensitive), dedupe, upsert
- **PATCH**: normalize+dedupe by category, delete-on-limit<=0, parallel upserts
- **Prisma**: Direct `prisma.*` calls
- **Error handling**: Manual branches; no `jsonRouteError`

### `apps/server/src/app/api/plans/[id]/goals/savings/route.ts` (491 lines)
- **Auth**: Local `resolveInternalUserId` (no dev fallback)
- **DTO conversion**: Local `toServerPlanDTO` (simpler variant)
- **GET**: findUnique plan, return savingsGoals
- **POST**: id-based upsert first, else name-based (case-insensitive), max 10 limit
- **PATCH**: sync mode, keepIds, delete not-in-payload, cross-plan id guard
- **Prisma**: Direct `prisma.$transaction`
- **Error handling**: Manual branches; no `jsonRouteError`

### `apps/server/src/domain/plan/plan.service.ts` (22 lines)
- **Current**: `ensureActivePlan` only — uses auth repo + plan repo for default weekly plan creation
- **Not used** by plans API routes (routes use `ensureDefaultActivePlan` from planCreateFactory, or `ensureActivePlan` from activePlan.ts for switch-currency)

### `apps/server/src/domain/plan/plan.repository.ts` (30 lines)
- **Current**: `createDefaultWeeklyPlanForUser`, `setUserActivePlanId` only
- **Not used** by main plans route (plans route uses `ensureDefaultActivePlan` from lib/plan)

### `apps/server/src/domain/plan/plan.mapper.ts` (2 lines)
- **Current**: Empty (placeholder)

### `apps/server/src/lib/auth.ts` (121 lines)
- **Exports**: `getAuthUser`, `resolveInternalUserId`, `requireUserId`
- **Dev fallback**: `getDevUserId` (header, query, body.userId, env)
- **Used by**: transactions route, transactions/[id]; NOT used by plans routes (they duplicate)

---

## 2. Duplicated Logic to Consolidate

| Logic | Locations | Notes |
|-------|------------|-------|
| `toServerPlanDTO` | plans/route.ts, rollover/route.ts, switch-currency/route.ts, budget/route.ts, savings/route.ts | **5 copies** with subtle differences (timeZone fallback, category lowercase, totalBudgetLimitMinor handling) |
| `resolveInternalUserId` / `requireActorUserId` | plans/route.ts, rollover, switch-currency, budget, savings, users/me | Plans routes use local copies; some lack dev fallback |
| `getDevUserId` | plans/route.ts (full), rollover (env-only), others (none) | Inconsistent dev support |
| Period calculation (weekly/biweekly/monthly) | plans/route.ts POST+PATCH | Should move to service |
| Active plan fallback + restore | plans/route.ts GET | Should move to service |
| Monthly list assembly | plans/route.ts GET | Should move to service |
| Budget goal normalize + dedupe | budget/route.ts POST+PATCH | Should move to service |
| Savings goal sync + limit | savings/route.ts POST+PATCH | Should move to service |

---

## 3. Layering Violations

| Violation | File(s) | Issue |
|-----------|---------|-------|
| Route contains Prisma | All plan routes | Routes call `prisma.*` directly instead of repository |
| Route contains business logic | All plan routes | Period calculation, active fallback, goal sync, rollover loop |
| Route contains DTO conversion | All plan routes | Each has its own `toServerPlanDTO` |
| Route contains auth resolution | All plan routes | Duplicated `resolveInternalUserId` instead of `requireUserId` |
| Service/repo underused | plan.service.ts, plan.repository.ts | Plans API does not use domain layer |
| Mapper empty | plan.mapper.ts | No SSOT for DTO conversion |

---

## 4. Proposed Target Structure

```
route (thin)
  ├── parse request (query/body)
  ├── requireUserId(request, body?) → 401 if !ok
  ├── call planService.method(...)
  └── return NextResponse.json(result) | jsonRouteError(error, label)

plan.service.ts
  ├── getCurrentPlan(userId) → active or fallback or auto-create
  ├── getPlanByPeriod(userId, periodType, periodStartISO)
  ├── getMonthlyPlans(userId, at?, months?)
  ├── createPlan(userId, data)
  ├── patchPlan(userId, data)
  ├── getBudgetGoals(userId, planId)
  ├── upsertBudgetGoal(userId, planId, body)
  ├── patchBudgetGoals(userId, planId, body)
  ├── getSavingsGoals(userId, planId)
  ├── upsertSavingsGoal(userId, planId, body)
  ├── patchSavingsGoals(userId, planId, body)
  ├── rollover(userId)
  └── switchCurrency(userId, planId, body)

plan.repository.ts
  ├── findUserById(userId) → { timeZone, activePlanId, ... }
  ├── findPlanByUniqueKey(userId, periodType, periodStart)
  ├── findPlanById(id, include?)
  ├── findActivePlan(userId)
  ├── findLatestPlan(userId)
  ├── findPlansByStarts(userId, periodType, starts)
  ├── upsertPlan(tx, data)
  ├── setActivePlanId(userId, planId)
  ├── createPlan(tx, data)
  ├── updatePlan(tx, id, data)
  ├── upsertBudgetGoal / deleteBudgetGoals / ...
  ├── upsertSavingsGoal / deleteSavingsGoals / ...
  └── rollover transaction helpers

plan.mapper.ts
  └── toServerPlanDTO(plan, fallbackTimeZone) → ServerPlanDTO
```

---

## 5. Safe Incremental Refactor Order

1. **Patch 1**: Implement `plan.mapper.ts` as SSOT for `toServerPlanDTO`
   - Single canonical implementation
   - Resolve budget category: use lowercase for consistency (budget route + switch-currency expect it)
   - Resolve totalBudgetLimitMinor: use `toFiniteNumberOrNull`-style handling for Decimal/bigint safety

2. **Patch 2**: Expand `plan.repository.ts` with shared Prisma helpers
   - Add: findUserTimeZone, findUserWithActivePlan, findPlanByUniqueKey, findPlanByIdWithGoals, findActivePlanWithGoals, findLatestPlanWithGoals, findPlansByStarts, upsertPlanWithGoals, setUserActivePlanId (already exists)
   - Add: budget/savings goal persistence primitives

3. **Patch 3**: Expand `plan.service.ts` with read flows
   - getCurrentPlan, getPlanByPeriod, getMonthlyPlans
   - Use repository + mapper

4. **Patch 4**: Refactor `plans/route.ts` GET/POST/PATCH
   - Use `requireUserId`, service methods, `jsonRouteError`
   - Remove local auth, DTO, Prisma

5. **Patch 5**: Move budget goal logic to service + repository
   - Service: getBudgetGoals, upsertBudgetGoal, patchBudgetGoals
   - Route: thin handlers

6. **Patch 6**: Move savings goal logic to service + repository
   - Service: getSavingsGoals, upsertSavingsGoal, patchSavingsGoals
   - Route: thin handlers

7. **Patch 7**: Move rollover to service + repository
   - Service: rollover(userId)
   - Route: thin handler

8. **Patch 8**: Move switch-currency to service + repository
   - Service: switchCurrency(userId, body)
   - Route: thin handler

---

## 6. Risk List / Regression-Sensitive Areas

| Area | Risk | Mitigation |
|------|------|------------|
| **toServerPlanDTO variants** | Budget route uses `toFiniteNumberOrNull`; switch-currency uses category lowercase; others use `String(g.category ?? "Other")` | Mapper must produce DTO that passes `serverPlanDTOSchema` and matches mobile expectations. Use single canonical: category lowercase, totalBudgetLimitMinor as number\|null, homeCurrency/displayCurrency = currency |
| **Auth dev fallback** | Rollover/switch-currency/budget/savings lack x-dev-user-id, ?userId, body.userId | Use `requireUserId(request, body)` from lib/auth so all routes get consistent dev support |
| **Monthly list** | `buildPeriodStartListUTC` months count: plans uses `Math.min(120, Math.max(1, ...))` | Preserve exact logic in service |
| **Exact period lookup** | `isoLocalDayToUTCDate(timeZone, periodStartISO)` | Keep in service, use periodRules |
| **Active fallback** | Restore activePlanId when returning latest plan | Preserve in service |
| **ensureDefaultActivePlan** | Creates MONTHLY plan via planCreateFactory | Keep using it from lib; service calls it |
| **POST/PATCH period calculation** | weekly/biweekly/monthly, setActive+useCurrentPeriod, monthly at | Move to service without changing formulas |
| **Budget category** | Case-insensitive, normalize to lowercase, dedupe last-write-wins | Preserve in service |
| **Budget limit<=0** | Delete goal | Preserve |
| **Savings max 10** | Enforced in POST and PATCH | Preserve |
| **Savings PATCH** | keepIds, delete not in payload, cross-plan id guard | Preserve |
| **Rollover** | ensurePeriodEnd, loop, P2002 retry, goal copy on first create only | Preserve |
| **Switch-currency** | ensureActivePlan (from activePlan.ts), buildPeriodForNowUTC, convertPlanMinorPayload, goalsMode | Preserve; ensureActivePlan creates if missing — plans route uses different flow (ensureDefaultActivePlan) |
| **Prisma errors** | P2025, P2002 | Use `prismaHttpGuard` where appropriate; HttpError for 404/409 |

---

## 7. DTO Compatibility Notes

From `packages/shared/src/plans/types.ts`:
- `ServerPlanDTO`: id, periodType, periodStartUTC, periodEndUTC, periodAnchorUTC, timeZone, totalBudgetLimitMinor, currency, homeCurrency, displayCurrency, budgetGoals, savingsGoals, language
- `budgetGoals`: `{ id?, category, limitMinor? }` — category must be string min 1
- `savingsGoals`: `{ id?, name, targetMinor? }` — name must be string min 1

Budget route currently lowercases category. Switch-currency lowercases category. Others use "Other" as fallback. **Canonical**: category as trimmed lowercase (empty → "uncategorized" or "other" per schema). Schema says `category: z.string().min(1)` so "Other" is valid. Use consistent: `String(g.category ?? "Other").trim().toLowerCase()` for budget goals to match existing behavior.

---

## 8. Final Regression Checklist (Post-Refactor)

| Scenario | Verification |
|----------|---------------|
| GET current active plan | Returns active plan DTO; uses requireUserId |
| GET exact plan by period | periodType + periodStartISO → 404 if not found |
| GET monthly plan list | periodType=MONTHLY&(at\|months) → items with periodStartUTC, plan or null |
| Auto-create default active plan | No plans → ensureDefaultActivePlan → MONTHLY plan |
| POST weekly plan | Server computes periodStart; upsert; active handling |
| POST biweekly plan with anchor | periodAnchor required; periodStart from anchor |
| POST monthly plan using at | at=YYYY-MM → getMonthlyPeriodStartUTCForAt |
| Fallback activePlan restore | Latest plan returned → setUserActivePlanId |
| Budget goal POST | normalize category; limit<=0 delete; upsert; 201 with plan |
| Budget goal PATCH | normalize+dedupe; delete-on-limit<=0; case-insensitive |
| Savings goal POST | id-based first, name-based fallback; max 10 |
| Savings goal PATCH | sync mode; keepIds; delete not in payload; cross-plan id guard |
| Rollover | ensurePeriodEnd; loop; P2002 retry; goal copy on first create |
| Switch-currency | ensureActivePlan; switchMode/goalsMode; buildPeriodForNowUTC; convertPlanMinorPayload |
| DTO shape compatibility | currency, homeCurrency, displayCurrency, budgetGoals, savingsGoals |
| Auth via lib/auth | requireUserId(request, body?) with dev fallback |
| jsonRouteError / HttpError | Single try/catch; HttpError for 4xx; jsonRouteError for catch-all |
