---
description: Apply to all PocketQuest work. Defines monorepo roles, global SSOT direction, and cross-layer consistency rules.
alwaysApply: true
---

# .agents/rules/00-global-architecture.md

## Core Rules
- **Monorepo Awareness**: Understand the distinct constraints of `apps/mobile`, `apps/server`, `packages/shared`, and `docs`.
- **Role Separation**:
  - `apps/mobile`: Frontend mobile client. Focuses on UI presentation and state.
  - `apps/server`: Backend API and business orchestration. Server-first consistency dictates that the server is the ultimate source of truth for runtime behavior and persisted state.
  - `packages/shared`: Single Source of Truth (SSOT) for shared types, DTOs, request/response schemas, and canonical enums.
- **Contract Discipline**: Do not invent ad-hoc contract changes in the server or mobile apps without first checking and updating the shared types in `packages/shared`. Follow existing project patterns first, then improve incrementally.
- **Global Consistency**: Ensure features align front-to-back. Data shapes flowing from DB -> Server -> Shared -> Mobile must remain structurally sound and consistent where applicable.
