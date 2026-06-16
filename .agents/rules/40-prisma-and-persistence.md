---
trigger: model_decision
description: Apply when editing Prisma schema, migrations, repository persistence logic, DB constraints, relations, or any code that directly depends on Prisma model shapes or database-level behavior.
---

# .agents/rules/40-prisma-and-persistence.md

# Prisma and Persistence Rules

## Schema vs. DTO Boundary
- A Prisma Model defines exact database persistence, NOT the API communication contract.
- Keep proprietary Prisma shapes deeply within backend Repositories or Services where practical. Convert records into formal DTOs prior to dispatching responses to routes. Do not place Prisma model shapes or persistence-only structures in `packages/shared`.

## Sequence of Operations
For persistence-impacting changes, coordinate schema and code updates together so they do not fall out of sync:
1. Update `schema.prisma`.
2. Generate the client and manage the underlying migration payload.
3. Update Repository abstractions to support the newly migrated query map.
4. Escalate changes to Services and Shared DTOs.

## Structural Validation Checklist
Prior to introducing or eliminating DB schemas explicitly verify:
- [ ] **Nullability Context**: Has an optional property forcibly become implicitly required? Will existing records become invalid or require migration/backfill?
- [ ] **Uniqueness Constraints**: Is complex domain uniqueness preserved at the DB tier?
- [ ] **Relation Cascades**: Who formally owns the relationship record destruction (`onDelete: Cascade` vs `SetNull`)?