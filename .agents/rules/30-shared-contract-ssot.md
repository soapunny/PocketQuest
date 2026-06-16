---
trigger: model_decision
description: Apply when editing shared DTOs, schemas, enums, canonical domain values, or any cross-layer contract in packages/shared, or when changes affect how shared contracts are consumed across layers.
---

# .agents/rules/30-shared-contract-ssot.md

# Shared Contract SSOT Rules

## Purpose
Protect `packages/shared` as the primary single source of truth for cross-layer API contracts and canonical domain shapes, migrating code towards this incrementally.

## What Belongs in Shared
- Request / Response DTO schemas and generated Types (Preferably via Zod).
- Canonical enums, domain constants, constraint limits, and shared literal types.
- Environment-agnostic shared operational formatting helpers.

## Contract Change Checklist
When editing or replacing a shared contract, safely trace touchpoints to avoid breakages:
1. [ ] **Inspect Shared Definition**: Vet the shape change against existing expectations.
2. [ ] **Search Route Usage**: Find all backend route entry/exit points that serialize this DTO.
3. [ ] **Search Service/Mapper Usage**: Track backend mappers converting Prisma entities into this form.
4. [ ] **Search Frontend Imports**: Examine `apps/mobile` API clients and conditionally trace usages if the shared contract is utilized outside backend-only code.
5. [ ] **Refactor Incrementally**: Remove duplicate local contract definitions when touched by the current change, and do not introduce new duplicates.
6. [ ] **Avoid Split-Brain**: Do not permit legacy and modernized contract definitions to concurrently coexist indefinitely. Force the structural alignment updates together when possible.