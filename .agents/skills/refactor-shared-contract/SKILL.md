# .agents/skills/refactor-shared-contract/SKILL.md

---
description: Use this when introducing, merging, renaming, or refactoring shared DTOs, schemas, enums, canonical keys, or backend-consumed cross-layer contracts.
autoApply: false
---

# Refactor Shared Contract

## Goal
Refactor shared contracts safely without breaking backend behavior or creating duplicate definitions.

## Use This Skill When
- moving duplicated DTOs into shared
- unifying request/response types
- consolidating enums or canonical keys
- aligning backend code with existing shared definitions

## Workflow

### 1. Find all existing definitions
Search for:
- duplicate DTO names
- near-duplicate request/response shapes
- repeated enums/unions
- route-local schemas that should be shared

### 2. Choose the canonical shape
Select one canonical contract based on:
- existing shared usage
- backend persistence reality
- current public API behavior
- naming clarity and reuse potential

### 3. Move or define in shared
- place the cross-layer contract in `packages/shared`
- keep backend-only details out of shared
- prefer explicit names over vague local aliases

### 4. Update backend in safe order
Recommended order:
1. add/update shared contract
2. update backend imports and validation
3. update service/mapper usage
4. remove obsolete duplicate local contracts

### 5. Check persistence alignment
Confirm the refactored contract still matches:
- Prisma field names or mapping rules
- nullability expectations
- relation semantics
- server response behavior

### 6. Avoid split-brain states
Do not leave both old and new contract sources active longer than needed.
Do not keep dead duplicate schemas unless temporarily required during a tightly scoped migration.

## Done Criteria
- one canonical shared contract exists for the cross-layer concern
- duplicate local definitions were removed or clearly deprecated
- backend uses the shared contract consistently
- Prisma-backed assumptions still hold
- no unrelated refactor was mixed into the change