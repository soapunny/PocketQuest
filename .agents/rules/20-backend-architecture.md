---
trigger: model_decision
description: Apply when editing apps/server, backend routes, services, repositories, mappers, or server-side business logic and API behavior.
---

# .agents/rules/20-backend-architecture.md

# Backend Architecture Rules

## Layer Responsibilities
- **Routes (`apps/server/src/app/api/**` or `route.ts`)**: Handle HTTP request parsing, authentication checks (AuthN), Zod schema validation, and response formatting. Route handlers should not access Prisma directly when a repository/service path exists or should exist. Treat legacy cases bypassing this as refactor targets, not preferred patterns.
- **Services (`domain` / `lib`)**: Contain core business logic. Enforce domain invariants and perform access-control authorization (AuthZ) using ownership rules.
- **Repositories**: Own direct data access, bridging services to Prisma. Keep methods strictly persistence-focused.
- **Mappers**: Map persistence/domain shapes into stable DTOs when returning cross-layer data.

## Error Handling
Reuse the project's existing shared utilities first:
- Inspect and align with `lib/http/httpError.ts` and `lib/prisma/prismaErrors.ts`.
- **Throwing**: Service and repository layers may throw project-standard domain errors. Do not overcommit to one exact exception style unless the surrounding codebase consistently does. 
- **Database Exceptions**: Rely on utilities like `prismaHttpGuard` to translate known Prisma errors where applicable.
- **Catching**: Route handlers are responsible for catching and uniformly converting thrown exceptions into standard HTTP JSON responses (e.g., using `jsonRouteError`).

## Naming & Validation
- **Validation Boundary**: Verify incoming HTTP structural shapes at the **Route** layer (via Zod/Shared). Validate complex business invariants inside the **Service** layer.
- **DTO Naming**: Prefer names that clearly express transport intent, such as `CreatePlanRequest`, `PlanResponse`, or `TransactionDTO`, depending on the existing nearby convention. Apply the clearer convention to new or actively refactored contracts first without forcing an immediate repo-wide rename.
- **File Naming**: Follow existing repository naming patterns first. Preserve framework-reserved filenames exactly (`route.ts`, `page.tsx`). New utility files should use one consistent naming style aligned with their surrounding directory.

## Verification Expectations
- Update existing tests when the current change affects covered backend behavior.
- If no automated test exists, manually trace the affected path:
  - Route: confirm request parsing, validation, and response shape
  - Service: confirm business invariants and authorization rules are enforced
  - Repository: confirm query behavior, returned shape, and persistence assumptions still match expectations
- For contract changes, verify route validation, service usage, mapper output, and affected consumers.
- For persistence changes, verify nullability, uniqueness, relation behavior, and migration assumptions.
- Do not introduce broad unrelated test rewrites during focused refactors.